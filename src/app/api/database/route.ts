import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { sqlite, sqlitePath } from "@/db";

import { requireStaff } from "@/lib/auth";
import { summarizeBackup, performRestore, readRestoreState, isValidBackupName } from "@/lib/db-restore";
export const dynamic = "force-dynamic";

function backupDir(): string {
  const base = sqlitePath === ":memory:" ? path.join(process.cwd(), "data") : path.dirname(sqlitePath);
  return path.join(base, "backups");
}

function listBackupsBase() {
  const dir = backupDir();
  if (!fs.existsSync(dir)) return [] as { name: string; sizeBytes: number; createdAt: string }[];
  return fs
    .readdirSync(dir)
    .filter((f) => isValidBackupName(f) && fs.statSync(path.join(dir, f)).isFile())
    .map((f) => {
      const st = fs.statSync(path.join(dir, f));
      return { name: f, sizeBytes: st.size, createdAt: st.mtime.toISOString() };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Yedeklere bütünlük + içerik özeti ekler (en fazla 15 dosya özetlenir). */
function listBackups() {
  const base = listBackupsBase();
  return base.map((entry, i) =>
    i < 15 ? summarizeBackup(sqlitePath, entry) : { ...entry, integrity: "unknown" as const, tables: -1, orders: null, products: null, customers: null, users: null },
  );
}

function tableStats() {
  const rows = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as { name: string }[];
  return rows.map(({ name }) => {
    const { c } = sqlite.prepare(`SELECT count(*) AS c FROM "${name.replace(/"/g, '""')}"`).get() as { c: number };
    return { name, rows: Number(c) };
  });
}

function dbFileInfo() {
  if (sqlitePath === ":memory:") return { path: ":memory:", sizeBytes: 0 };
  try {
    const st = fs.statSync(sqlitePath);
    return { path: sqlitePath, sizeBytes: st.size };
  } catch {
    return { path: sqlitePath, sizeBytes: 0 };
  }
}

/** GET /api/database — DB bilgisi + tablo istatistikleri + yedekler. ?download=<ad> ile yedek indirilir. */
export async function GET(request: Request) {
  const __gate = await requireStaff(request);
  if (!__gate.ok) return __gate.response;

  const url = new URL(request.url);
  const download = url.searchParams.get("download");
  if (download) {
    const safe = path.basename(download);
    if (!/^tuhafiye(-[\w.-]+)?\.db$/.test(safe)) {
      return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Geçersiz yedek adı." } }, { status: 422 });
    }
    const file = path.join(backupDir(), safe);
    if (!fs.existsSync(file)) {
      return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Yedek bulunamadı." } }, { status: 404 });
    }
    const buf = fs.readFileSync(file);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${safe}"`,
        "Content-Length": String(buf.length),
      },
    });
  }

  try {
    const integrity = (sqlite.pragma("integrity_check", { simple: true }) as string) || "unknown";
    const tables = tableStats();
    const totalRows = tables.reduce((s, t) => s + t.rows, 0);
    return NextResponse.json({
      success: true,
      data: {
        engine: "SQLite",
        driver: "better-sqlite3",
        orm: "Drizzle ORM",
        journalMode: String(sqlite.pragma("journal_mode", { simple: true }) || ""),
        integrity,
        ...dbFileInfo(),
        tableCount: tables.length,
        totalRows,
        tables,
        backups: listBackups(),
        restoreState: readRestoreState(sqlitePath),
      },
    });
  } catch (err: any) {
    console.error("Database info error:", err);
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: err?.message || "Veritabanı bilgisi alınamadı." } }, { status: 500 });
  }
}

/** POST /api/database
 *  { action: "backup" }                      — Tutarlı yedek üretir (VACUUM INTO)
 *  { action: "restore", name: "<yedek.db>" } — Yedeği sisteme geri yükler (YALNIZ SUPER_ADMIN)
 */
export async function POST(request: Request) {
  const __gate = await requireStaff(request);
  if (!__gate.ok) return __gate.response;

  const body = (await request.json().catch(() => ({}))) as { action?: string; name?: string };

  if (body?.action === "restore") {
    const role = (__gate.user.role || "").toUpperCase();
    if (role !== "SUPER_ADMIN") {
      return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Yedek geri yükleme yalnız Süper Admin içindir." } }, { status: 403 });
    }
    const name = String(body?.name ?? "").trim();
    if (!isValidBackupName(name)) {
      return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Geçersiz yedek adı." } }, { status: 422 });
    }
    const actor = (__gate.user.email || __gate.user.name || "admin").toString();
    const result = await performRestore({ livePath: sqlitePath, name, actor });
    if (!result.ok) {
      return NextResponse.json({ success: false, error: { code: "RESTORE_FAILED", message: result.error } }, { status: 400 });
    }
    return NextResponse.json({
      success: true,
      data: {
        restored: result.source,
        preRestoreBackup: result.preRestoreBackup,
        tables: result.tables,
        rowsCopied: result.rowsCopied,
        skippedTables: result.skippedTables,
        message: `'${result.source}' geri yüklendi; önceki canlı durum '${result.preRestoreBackup}' olarak saklandı. Sayfayı yenileyin.`,
        backups: listBackups(),
        restoreState: readRestoreState(sqlitePath),
      },
    });
  }

  if (body?.action !== "backup") {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Geçersiz işlem. action='backup' veya 'restore' kullanın." } }, { status: 422 });
  }
  try {
    const dir = backupDir();
    fs.mkdirSync(dir, { recursive: true });
    const now = new Date();
    const stamp =
      `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}` +
      `-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
    const dest = path.join(dir, `tuhafiye-${stamp}.db`);
    // VACUUM INTO: WAL içeriği dahil, tutarlı ve sıkıştırılmış kopya üretir.
    sqlite.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
    return NextResponse.json({ success: true, data: { backups: listBackups() } });
  } catch (err: any) {
    console.error("Database backup error:", err);
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: err?.message || "Yedek oluşturulamadı." } }, { status: 500 });
  }
}
