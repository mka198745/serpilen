/**
 * Veritabanı yedeği geri-yükleme (restore) motoru.
 *
 * Garantiler:
 *  - Yalnızca `<canlı db'nin dizini>/backups/` altındaki mevcut dosyalar yüklenebilir
 *    (path traversal + realpath containment kontrolü).
 *  - İşlem ÖNCESİ SQLite online backup API ile tutarlı bir "pre-restore" güvenlik
 *    yedeği alınır; alınamazsa hiçbir değişiklik yapılmaz.
 *  - Geri yükleme SQL düzeyinde TEK BEGIN EXCLUSIVE transaction'dadır: çalışan
 *    process yeniden başlatılmaz, okurlar ya eski ya yeni durumu tutarlı görür.
 *  - "Tam geri yükleme" semantiği: yedekte olmayan canlı tabloları da temizlenir
 *    (önceki hal tamamen döner). Yedekte eksik olan sütunlar kolon kesişimiyle atılır;
 *    zorunlu tablolar yoksa yedek REDDEDİLİR.
 *  - Her geri yükleme audit_logs'a DB_BACKUP_RESTORED olarak yazılır ve
 *    backups/.restore-state.json işareti güncellenir.
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export const BACKUP_NAME_RE = /^tuhafiye(-[A-Za-z0-9_.-]+)?\.db$/;
const REQUIRED_TABLES = ["users", "products", "orders", "order_items"];

export function backupDirFor(livePath: string): string {
  const base = livePath === ":memory:" ? path.join(process.cwd(), "data") : path.dirname(livePath);
  return path.join(base, "backups");
}

export function isValidBackupName(name: string): boolean {
  return BACKUP_NAME_RE.test(name) && !name.includes("..") && path.basename(name) === name;
}

export function resolveBackupFile(livePath: string, name: string): string | null {
  if (!isValidBackupName(name)) return null;
  const dir = backupDirFor(livePath);
  try {
    const realDir = fs.realpathSync(dir);
    const realFile = fs.realpathSync(path.join(dir, name));
    if (path.dirname(realFile) !== realDir) return null;
    if (!fs.statSync(realFile).isFile()) return null;
    return realFile;
  } catch {
    return null;
  }
}

export type BackupSummary = {
  name: string;
  sizeBytes: number;
  createdAt: string;
  integrity: "ok" | "fail" | "unknown";
  tables: number;
  orders: number | null;
  products: number | null;
  customers: number | null;
  users: number | null;
  error?: string;
};

function safeCount(conn: Database.Database, table: string): number | null {
  try {
    const q = `SELECT count(*) AS c FROM "${table.replace(/"/g, '""')}"`;
    return Number((conn.prepare(q).get() as { c: number }).c);
  } catch {
    return null;
  }
}

/** Yedeği salt-okuma açıp hızlı içerik özeti çıkarır (UI'da gösterilir). */
export function summarizeBackup(livePath: string, entry: { name: string; sizeBytes: number; createdAt: string }): BackupSummary {
  const file = resolveBackupFile(livePath, entry.name);
  if (!file) {
    return { ...entry, integrity: "fail", tables: 0, orders: null, products: null, customers: null, users: null, error: "geçersiz dosya" };
  }
  let conn: Database.Database | null = null;
  try {
    conn = new Database(file, { readonly: true, fileMustExist: true });
    const integrityRaw = String(conn.pragma("integrity_check", { simple: true }) ?? "unknown");
    const integrity: BackupSummary["integrity"] = integrityRaw.toLowerCase() === "ok" ? "ok" : "fail";
    const tables = (conn.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]).map((r) => r.name);
    const grab = (t: string) => (tables.includes(t) ? safeCount(conn!, t) : null);
    return { ...entry, integrity, tables: tables.length, orders: grab("orders"), products: grab("products"), customers: grab("customers"), users: grab("users") };
  } catch (err) {
    return { ...entry, integrity: "fail", tables: 0, orders: null, products: null, customers: null, users: null, error: String((err as Error)?.message || err).slice(0, 200) };
  } finally {
    try { conn?.close(); } catch { /* noop */ }
  }
}

export type RestoreState = {
  source: string;
  restoredAt: string;
  preRestoreBackup: string;
  actor: string;
  tables: number;
  rowsCopied: number;
};

export function readRestoreState(livePath: string): RestoreState | null {
  try {
    const p = path.join(backupDirFor(livePath), ".restore-state.json");
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8")) as RestoreState;
  } catch {
    return null;
  }
}

function stampNow(): string {
  const n = new Date();
  const p = (v: number) => String(v).padStart(2, "0");
  const ms = String(n.getMilliseconds()).padStart(3, "0");
  return `${n.getFullYear()}${p(n.getMonth() + 1)}${p(n.getDate())}-${p(n.getHours())}${p(n.getMinutes())}${p(n.getSeconds())}${ms}`;
}

/** Mevcut canlı DB'nin tutarlı kopyasını backups/pre-restore-<ts>.db olarak alır. */
export async function createSafetyBackup(livePath: string): Promise<string> {
  const dir = backupDirFor(livePath);
  fs.mkdirSync(dir, { recursive: true });
  // tuhafiye-* öneki: listele/geri-yükle regex'iyle uyumlu (yedekler UI'da görünür ve yüklenebilir)
  let name = `tuhafiye-pre-restore-${stampNow()}.db`;
  let dest = path.join(dir, name);
  // Asla üzerine yazma — aynı ms içinde çift işlem ihtimaline karşı artan ek
  for (let i = 1; fs.existsSync(dest); i++) {
    name = `tuhafiye-pre-restore-${stampNow()}-${i}.db`;
    dest = path.join(dir, name);
  }
  const live = new Database(livePath); // ayrı bağlantı — WAL'li canlı DB çevrimiçi kopyalanır
  try {
    await live.backup(dest);
    return name;
  } finally {
    try { live.close(); } catch { /* noop */ }
  }
}

export type RestoreResult =
  | { ok: true; source: string; preRestoreBackup: string; tables: number; rowsCopied: number; skippedTables: string[] }
  | { ok: false; error: string; preRestoreBackup?: string };

/**
 * Bilgisayardan yüklenen (staging) dosyadan geri yükleme.
 * Dosya adı serbesttir; içerik yine bütünlük + zorunlu tablo kontrolünden geçirilir.
 * `source` yalnızca görüntüleme/audit amacıyla kullanılır (basename + 120 karakterle sınırlanır).
 */
export async function performRestoreFromPath(opts: { livePath: string; backupPath: string; source: string; actor: string }): Promise<RestoreResult> {
  const { livePath, backupPath } = opts;
  if (livePath === ":memory:") return { ok: false, error: "Bellek içi veritabanı geri yüklenemez." };
  const source = String(opts.source || "upload.db").split(/[\\/]/).pop()?.trim().slice(0, 120) || "upload.db";
  try {
    if (!fs.existsSync(backupPath) || !fs.statSync(backupPath).isFile()) {
      return { ok: false, error: "Yüklenen yedek dosyası bulunamadı." };
    }
  } catch {
    return { ok: false, error: "Yüklenen yedek dosyası okunamadı." };
  }
  return restoreFromFile({ livePath, file: backupPath, source, actor: opts.actor });
}

export async function performRestore(opts: { livePath: string; name: string; actor: string }): Promise<RestoreResult> {
  const { livePath, name } = opts;
  if (livePath === ":memory:") return { ok: false, error: "Bellek içi veritabanı geri yüklenemez." };
  const file = resolveBackupFile(livePath, name);
  if (!file) return { ok: false, error: "Geçersiz yedek adı veya dosya bulunamadı." };
  return restoreFromFile({ livePath, file, source: name, actor: opts.actor });
}

async function restoreFromFile(opts: { livePath: string; file: string; source: string; actor: string }): Promise<RestoreResult> {
  const { livePath, file, source } = opts;

  // 1) Yedeği salt-okuma doğrula
  try {
    const src = new Database(file, { readonly: true, fileMustExist: true });
    try {
      const integrity = String(src.pragma("integrity_check", { simple: true }) ?? "");
      if (integrity.toLowerCase() !== "ok") {
        return { ok: false, error: `Yedek bütünlük kontrolünden geçemedi (${integrity}).` };
      }
      const tables = (src.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]).map((r) => r.name);
      for (const req of REQUIRED_TABLES) {
        if (!tables.includes(req)) {
          return { ok: false, error: `Yedekte zorunlu tablo yok: ${req}. Bu dosya bir Serpilen veritabanı yedeği görünmüyor.` };
        }
      }
    } finally {
      src.close();
    }
  } catch (err) {
    return { ok: false, error: `Yedek açılamadı: ${String((err as Error)?.message || err).slice(0, 200)}` };
  }

  // 2) ÖNCE canlı durumun güvenlik yedeği (başarısızsa dokunma)
  let preRestoreBackup: string;
  try {
    preRestoreBackup = await createSafetyBackup(livePath);
  } catch (err) {
    return { ok: false, error: `Güvenlik yedeği alınamadı — işlem iptal edildi, canlı veriye dokunulmadı: ${String((err as Error)?.message || err).slice(0, 200)}` };
  }

  // 3) Tek transaction'da tam geri yükleme
  const q = (ident: string) => `"${ident.replace(/"/g, '""')}"`;
  let tablesCopied = 0;
  let rowsCopied = 0;
  let skippedTables: string[] = [];
  const live = new Database(livePath);
  try {
    live.pragma("journal_mode = WAL");
    live.pragma("foreign_keys = OFF");
    live.exec(`ATTACH DATABASE '${file.replace(/'/g, "''")}' AS src`);
    const srcTables = (live.prepare("SELECT name FROM src.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]).map((r) => r.name);
    const liveTables = (live.prepare("SELECT name FROM main.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]).map((r) => r.name);
    tablesCopied = srcTables.length;

    live.exec("BEGIN EXCLUSIVE");
    try {
      // Canlıda olup yedekte olmayan tablolar tam geri-yüklemede temizlenir
      for (const t of liveTables) {
        if (!srcTables.includes(t)) live.exec(`DELETE FROM main.${q(t)}`);
      }
      for (const t of srcTables) {
        if (!liveTables.includes(t)) {
          skippedTables.push(t);
          continue;
        }
        const srcCols = (live.prepare(`PRAGMA src.table_info(${q(t)})`).all() as { name: string }[]).map((c) => c.name);
        const liveCols = (live.prepare(`PRAGMA main.table_info(${q(t)})`).all() as { name: string }[]).map((c) => c.name);
        const common = srcCols.filter((c) => liveCols.includes(c));
        live.exec(`DELETE FROM main.${q(t)}`);
        if (common.length === 0) continue;
        const colList = common.map(q).join(", ");
        live.exec(`INSERT INTO main.${q(t)} (${colList}) SELECT ${colList} FROM src.${q(t)}`);
        rowsCopied += Number((live.prepare(`SELECT count(*) AS c FROM src.${q(t)}`).get() as { c: number }).c);
      }
      try {
        live.exec("DELETE FROM main.sqlite_sequence");
        live.exec("INSERT INTO main.sqlite_sequence SELECT * FROM src.sqlite_sequence");
      } catch {
        // sqlite_sequence yoksa/boşsa sorun değil
      }
      const uvRow = live.prepare("PRAGMA src.user_version").get() as { user_version?: number } | undefined;
      const uv = Number(uvRow?.user_version ?? 0);
      if (Number.isFinite(uv)) live.pragma(`user_version = ${uv}`);
      live.exec("COMMIT");
    } catch (err) {
      live.exec("ROLLBACK");
      throw err;
    }
    live.exec("DETACH src");
    live.close();
  } catch (err) {
    try { live.exec("DETACH src"); } catch { /* noop */ }
    try { live.close(); } catch { /* noop */ }
    return {
      ok: false,
      error: `Geri yükleme başarısız — transaction geri alındı, canlı veri değişmedi: ${String((err as Error)?.message || err).slice(0, 300)}`,
      preRestoreBackup,
    };
  }

  // 4) Geri-yükleme işareti (UI "son geri yükleme" satırı için)
  try {
    fs.writeFileSync(
      path.join(backupDirFor(livePath), ".restore-state.json"),
      JSON.stringify({ source, restoredAt: new Date().toISOString(), preRestoreBackup, actor: opts.actor, tables: tablesCopied, rowsCopied } satisfies RestoreState, null, 1),
    );
  } catch (err) {
    console.error("[db-restore] restore-state yazılamadı:", err);
  }

  // 5) Audit kaydı (geri yüklenen veritabanına)
  try {
    const auditDb = new Database(livePath);
    auditDb.prepare(
      "INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(
      opts.actor,
      opts.actor,
      "DB_BACKUP_RESTORED",
      "Database",
      source,
      `Yedekten geri yüklendi: ${source}. Önceki canlı durum '${preRestoreBackup}' olarak saklandı.`,
      Math.floor(Date.now() / 1000),
    );
    auditDb.close();
  } catch (err) {
    console.error("[db-restore] audit log yazılamadı:", err);
  }

  return { ok: true, source, preRestoreBackup, tables: tablesCopied, rowsCopied, skippedTables };
}
