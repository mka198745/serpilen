import { NextResponse } from "next/server";
import fs from "node:fs";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import os from "node:os";
import path from "node:path";
import { sqlite, sqlitePath } from "@/db";

import { requireStaff, getUserByToken, getRequestToken, SESSION_COOKIE, publicBaseUrl, type SessionUser } from "@/lib/auth";
import { issueDownloadTicket, consumeDownloadTicket, DOWNLOAD_TICKET_TTL_SECONDS } from "@/lib/download-tickets";
import { readCrmJson } from "@/lib/crm-write";
import { readBoundedMultipart, MultipartTooLarge } from "@/lib/bounded-multipart";
import { summarizeBackup, performRestore, performRestoreFromPath, readRestoreState, isValidBackupName, resolveBackupFile } from "@/lib/db-restore";
export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
const fail = (status: number, code: string, message: string) => NextResponse.json({ success: false, error: { code, message } }, { status, headers: privateHeaders });

/** Match the actual session that authenticated this actor, without retaining its raw token. */
async function sessionHashFor(request: Request, actor: SessionUser): Promise<string | null> {
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  for (const token of [cookie, getRequestToken(request)]) {
    if (!token) continue;
    const user = await getUserByToken(token);
    if (user?.id === actor.id && user.role === "SUPER_ADMIN") return crypto.createHash("sha256").update(token).digest("hex");
  }
  return null;
}
function isActiveAdmin(userId: number, sessionHash: string): boolean {
  return !!sqlite.prepare(`SELECT 1 FROM users u JOIN admin_sessions s ON s.user_id=u.id
    WHERE u.id=? AND u.is_active=1 AND u.role='SUPER_ADMIN' AND s.jti=? AND s.revoked_at IS NULL AND s.expires_at>unixepoch()`).get(userId, sessionHash);
}
/** Rechecks the session and writes an audit record before disclosure or backup creation. */
function auditDatabaseAccess(userId: number, sessionHash: string, action: string, name: string | null): boolean {
  return sqlite.transaction(() => {
    if (!isActiveAdmin(userId, sessionHash)) return false;
    const user = sqlite.prepare("SELECT name FROM users WHERE id=?").get(userId) as { name: string };
    sqlite.prepare("INSERT INTO audit_logs(user_id,user_name,action,entity,entity_id,details) VALUES(?,?,?,'Database',NULL,?)").run(String(userId), user.name, action, name ? `Yedek: ${name}` : "Veritabanı yedek işlemi başlatıldı");
    return true;
  }).immediate();
}
async function validateDatabaseOrigin(request: Request, actor: SessionUser): Promise<boolean> {
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  if (origin) return origin === publicBaseUrl(request);
  const bearer = request.headers.get("authorization");
  const authenticated = bearer?.startsWith("Bearer ") ? await getUserByToken(bearer.slice(7).trim()) : null;
  return authenticated?.id === actor.id;
}

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
  const url = new URL(request.url);
  const download = url.searchParams.get("download");
  const ticket = url.searchParams.get("ticket");

  // Ticket URLs are bearer credentials for preview downloads; they are bound to the issuing live session.
  if (download && ticket) {
    if (!isValidBackupName(download)) return fail(401, "UNAUTHENTICATED", "İndirme bileti geçersiz veya süresi doldu.");
    const entry = consumeDownloadTicket(ticket, download);
    if (!entry) return fail(401, "UNAUTHENTICATED", "İndirme bileti geçersiz veya süresi doldu.");
    try {
      const file = resolveBackupFile(sqlitePath, download);
      if (!file) return fail(404, "NOT_FOUND", "Yedek bulunamadı.");
      if (!auditDatabaseAccess(entry.userId, entry.sessionHash, "DB_BACKUP_DOWNLOAD", download)) return fail(403, "FORBIDDEN", "İndirme oturumu artık yetkili değil.");
      const buf = fs.readFileSync(file);
      return new NextResponse(new Uint8Array(buf), { status: 200, headers: { ...privateHeaders, "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${download}"`, "Content-Length": String(buf.length) } });
    } catch {
      return fail(500, "INTERNAL_ERROR", "Yedek indirilemedi.");
    }
  }

  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  if (gate.user.role !== "SUPER_ADMIN") return fail(403, "FORBIDDEN", "Veritabanı ve yedek işlemleri yalnız Süper Admin içindir.");
  const sessionHash = await sessionHashFor(request, gate.user);
  if (!sessionHash || !isActiveAdmin(gate.user.id, sessionHash)) return fail(403, "FORBIDDEN", "Veritabanı oturumu artık yetkili değil.");

  if (download) {
    if (request.headers.get("sec-fetch-site") === "cross-site") return fail(403, "FORBIDDEN", "İstek kaynağı doğrulanamadı.");
    if (!isValidBackupName(download)) return fail(422, "VALIDATION_ERROR", "Geçersiz yedek adı.");
    const file = resolveBackupFile(sqlitePath, download);
    if (!file) return fail(404, "NOT_FOUND", "Yedek bulunamadı.");
    try {
      if (!auditDatabaseAccess(gate.user.id, sessionHash, "DB_BACKUP_DOWNLOAD", download)) return fail(403, "FORBIDDEN", "İndirme oturumu artık yetkili değil.");
      const buf = fs.readFileSync(file);
      return new NextResponse(new Uint8Array(buf), { status: 200, headers: { ...privateHeaders, "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${download}"`, "Content-Length": String(buf.length) } });
    } catch {
      return fail(500, "INTERNAL_ERROR", "Yedek indirilemedi.");
    }
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
    }, { headers: privateHeaders });
  } catch (err: any) {
    console.error("Database info error:", err);
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: err?.message || "Veritabanı bilgisi alınamadı." } }, { status: 500 });
  }
}

const MAX_UPLOAD_BYTES = 256 * 1024 * 1024; // 256 MB üst sınır
const SQLITE_MAGIC = Buffer.from("SQLite format 3\0", "latin1");

type StaffGate = Extract<Awaited<ReturnType<typeof requireStaff>>, { ok: true }>;

/** multipart/form-data ile gelen yüklenen .db yedeğini geri yükler (YALNIZ SUPER_ADMIN). */
async function handleRestoreUpload(request: Request, gate: StaffGate, sessionHash: string) {
  const role = (gate.user.role || "").toUpperCase();
  if (role !== "SUPER_ADMIN") {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Yedek geri yükleme yalnız Süper Admin içindir." } }, { status: 403 });
  }
  let form: FormData;
  try {
    form = await readBoundedMultipart(request, MAX_UPLOAD_BYTES + 1024 * 1024);
  } catch (error) {
    if (error instanceof MultipartTooLarge) return fail(413, "PAYLOAD_TOO_LARGE", "Yüklenen istek 256 MB sınırını aşıyor.");
    return fail(400, "VALIDATION_ERROR", "Form verisi okunamadı.");
  }
  const entries = [...form.entries()];
  if (entries.length !== 1 || entries[0][0] !== "file") return fail(422, "VALIDATION_ERROR", "Yalnızca bir yedek dosyası gönderin.");
  const file = form.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Dosya seçilmedi (form alanı: 'file')." } }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Yüklenen dosya boş." } }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ success: false, error: { code: "PAYLOAD_TOO_LARGE", message: "Dosya 256 MB sınırını aşıyor." } }, { status: 413 });
  }
  // SQLite magic bytes — diske yazmadan önce kabaca SQLite dosyası olduğunu doğrula
  try {
    const head = Buffer.from(await file.slice(0, 16).arrayBuffer());
    if (head.length < 16 || !head.subarray(0, 16).equals(SQLITE_MAGIC)) {
      return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Bu bir SQLite veritabanı dosyası değil." } }, { status: 422 });
    }
  } catch {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Dosya okunamadı." } }, { status: 400 });
  }

  // Staging: geçici dizine yaz; geri yükleme bitince (başarı/başarısızlık) temizlenir
  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), "serpilen-restore-"));
  const rawName = path.basename(String(file.name || "upload.db"));
  const safeName = rawName.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 120) || "upload.db";
  const stagingPath = path.join(stagingDir, safeName.toLowerCase().endsWith(".db") ? safeName : `${safeName}.db`);
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(stagingPath, buf);
    if (!isActiveAdmin(gate.user.id, sessionHash)) return fail(403, "FORBIDDEN", "Geri yükleme oturumu artık yetkili değil.");
    const actor = (gate.user.email || gate.user.name || "admin").toString();
    const result = await performRestoreFromPath({ livePath: sqlitePath, backupPath: stagingPath, source: safeName, actor });
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
  } finally {
    try {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    } catch {
      /* noop */
    }
  }
}

/** POST /api/database
 *  { action: "backup" }                      — Tutarlı yedek üretir (VACUUM INTO)
 *  { action: "restore", name: "<yedek.db>" } — Yedeği sisteme geri yükler (YALNIZ SUPER_ADMIN)
 *  { action: "download-ticket", name }       — iframe içi indirme için kısa ömürlü tek kullanımlık bilet üretir
 *  multipart/form-data  { file: <yedek.db> } — Bilgisayardan yedek yükleyip geri yükler (YALNIZ SUPER_ADMIN)
 */
export async function POST(request: Request) {
  const __gate = await requireStaff(request);
  if (!__gate.ok) return __gate.response;
  if (__gate.user.role !== "SUPER_ADMIN") return fail(403, "FORBIDDEN", "Veritabanı ve yedek işlemleri yalnız Süper Admin içindir.");
  if (!(await validateDatabaseOrigin(request, __gate.user))) return fail(403, "FORBIDDEN", "İstek kaynağı doğrulanamadı.");
  const sessionHash = await sessionHashFor(request, __gate.user);
  if (!sessionHash || !isActiveAdmin(__gate.user.id, sessionHash)) return fail(403, "FORBIDDEN", "Veritabanı oturumu artık yetkili değil.");

  const contentType = (request.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("multipart/form-data")) {
    return handleRestoreUpload(request, __gate, sessionHash);
  }

  if (!/^application\/json(?:\s*;|\s*$)/i.test(contentType)) return fail(415, "VALIDATION_ERROR", "Geçersiz istek türü.");
  const parsed = await readCrmJson(request);
  if (!parsed.ok) return fail(parsed.response.status, "VALIDATION_ERROR", "Geçersiz veya çok büyük istek gövdesi.");
  if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) return fail(422, "VALIDATION_ERROR", "Geçersiz istek.");
  const body = parsed.value as { action?: string; name?: string };

  if (body?.action === "download-ticket") {
    const name = String(body?.name ?? "").trim();
    if (!isValidBackupName(name)) {
      return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Geçersiz yedek adı." } }, { status: 422 });
    }
    const file = resolveBackupFile(sqlitePath, name);
    if (!file) return fail(404, "NOT_FOUND", "Yedek bulunamadı.");
    try {
      if (!auditDatabaseAccess(__gate.user.id, sessionHash, "DB_BACKUP_TICKET", name)) return fail(403, "FORBIDDEN", "İndirme oturumu artık yetkili değil.");
      const ticket = issueDownloadTicket(name, __gate.user.id, sessionHash);
      return NextResponse.json({ success: true, data: { url: `/api/database?download=${encodeURIComponent(name)}&ticket=${ticket}`, expiresInSec: DOWNLOAD_TICKET_TTL_SECONDS } }, { headers: privateHeaders });
    } catch {
      return fail(500, "INTERNAL_ERROR", "İndirme bileti oluşturulamadı.");
    }
  }

  if (body?.action === "restore") {
    const role = (__gate.user.role || "").toUpperCase();
    if (role !== "SUPER_ADMIN") {
      return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Yedek geri yükleme yalnız Süper Admin içindir." } }, { status: 403 });
    }
    const name = String(body?.name ?? "").trim();
    if (!isValidBackupName(name)) {
      return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Geçersiz yedek adı." } }, { status: 422 });
    }
    if (!isActiveAdmin(__gate.user.id, sessionHash)) return fail(403, "FORBIDDEN", "Geri yükleme oturumu artık yetkili değil.");
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
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Geçersiz işlem. action='backup' | 'restore' | 'download-ticket' kullanın ya da multipart/form-data ile 'file' gönderin." } }, { status: 422 });
  }
  try {
    const dir = backupDir();
    fs.mkdirSync(dir, { recursive: true });
    const now = new Date();
    const stamp =
      `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}` +
      `-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
    const dest = path.join(dir, `tuhafiye-${stamp}.db`);
    if (!auditDatabaseAccess(__gate.user.id, sessionHash, "DB_BACKUP_CREATE", path.basename(dest))) return fail(403, "FORBIDDEN", "Yedek oluşturma oturumu artık yetkili değil.");
    // VACUUM INTO: WAL içeriği dahil, tutarlı ve sıkıştırılmış kopya üretir.
    sqlite.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
    return NextResponse.json({ success: true, data: { backups: listBackups() } });
  } catch (err: any) {
    console.error("Database backup error:", err);
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: err?.message || "Yedek oluşturulamadı." } }, { status: 500 });
  }
}
