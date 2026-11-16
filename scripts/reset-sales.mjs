#!/usr/bin/env node
/**
 * Tek seferlik, çevrimdışı SQLite satış ve kapalı kasa geçmişi temizliği.
 * Önce --inspect ile kapsamı inceleyin. Uygulama yalnızca açıkça --apply ve
 * onay ifadesi verilirse çalışır. Ayrıntılar: docs/SATIS_SIFIRLAMA.md
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const CONFIRMATION = "SATISLARI-VE-KAPALI-Z-RAPORLARINI-SIL";
const usage = `Kullanım:
  node scripts/reset-sales.mjs --db /mutlak/veritabani.db --inspect
  node scripts/reset-sales.mjs --db /mutlak/veritabani.db --apply --confirm ${CONFIRMATION}
İsteğe bağlı: --backup-dir /mutlak/guvenli/yedek-klasoru`;

function parseArgs(args) {
  const result = { db: null, backupDir: null, mode: null, confirmation: null };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--db" || arg === "--backup-dir" || arg === "--confirm") {
      const value = args[++i];
      if (!value || value.startsWith("--")) throw new Error(`${arg} için bir değer gerekli.`);
      const key = arg === "--db" ? "db" : arg === "--backup-dir" ? "backupDir" : "confirmation";
      if (result[key] !== null) throw new Error(`${arg} birden fazla kullanılamaz.`);
      result[key] = value;
    } else if (arg === "--inspect" || arg === "--apply") {
      if (result.mode) throw new Error("Yalnızca bir işlem modu seçin.");
      result.mode = arg;
    } else {
      throw new Error(`Bilinmeyen seçenek: ${arg}`);
    }
  }
  if (!result.db || !path.isAbsolute(result.db)) throw new Error("--db için mevcut veritabanının mutlak dosya yolunu belirtin.");
  if (!result.mode) throw new Error("--inspect veya --apply seçin.");
  if (result.backupDir && !path.isAbsolute(result.backupDir)) throw new Error("Yedek klasörü mutlak yol olmalıdır.");
  if (result.mode === "--apply" && result.confirmation !== CONFIRMATION) throw new Error("Uygulama için tam onay ifadesi gerekli.");
  if (result.mode === "--inspect" && result.confirmation) throw new Error("--inspect onay ifadesi gerektirmez.");
  return result;
}

const requiredColumns = {
  orders: ["id", "status", "order_number", "pos_shift_id"],
  order_items: ["id", "order_id"],
  order_status_history: ["order_id"],
  order_returns: ["id", "order_id"],
  order_return_items: ["return_id", "order_item_id"],
  loyalty_transactions: ["order_id"],
  pos_shifts: ["id", "status"],
  pos_cash_transactions: ["shift_id"],
  inventory: ["id", "physical_qty", "reserved_qty"],
  inventory_ledger: ["id"],
  customers: ["id"],
  products: ["id"],
};

function assertSchema(db) {
  for (const [table, columns] of Object.entries(requiredColumns)) {
    const existing = new Set(db.pragma(`table_info('${table}')`).map((row) => row.name));
    for (const column of columns) {
      if (!existing.has(column)) throw new Error(`Veritabanı şeması beklenen yapıda değil: ${table}.${column} eksik.`);
    }
  }
  // Yeni bir migration beklenmedik ilişkiler eklerse onları sessizce bozmayın.
  const handled = new Set(["order_items", "order_status_history", "order_returns", "order_return_items", "loyalty_transactions", "pos_cash_transactions", "orders"]);
  const targets = new Set(["orders", "order_items", "order_returns", "pos_shifts"]);
  for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()) {
    const escaped = name.replaceAll("'", "''");
    for (const fk of db.pragma(`foreign_key_list('${escaped}')`)) {
      if (targets.has(fk.table) && !handled.has(name)) throw new Error(`Bilinmeyen bağlı tablo: ${name} → ${fk.table}. İşlem durduruldu.`);
    }
  }
}

function count(db, table, where = "") {
  return db.prepare(`SELECT count(*) AS count FROM ${table} ${where}`).get().count;
}

function report(db) {
  return {
    siparis_ve_satis: count(db, "orders"),
    siparis_durumlari: db.prepare("SELECT status AS durum, count(*) AS adet FROM orders GROUP BY status ORDER BY status").all(),
    siparis_kalemi: count(db, "order_items"),
    siparis_durum_gecmisi: count(db, "order_status_history"),
    iadeler: count(db, "order_returns"),
    iade_kalemleri: count(db, "order_return_items"),
    kapali_vardiya_ve_z: count(db, "pos_shifts", "WHERE status = 'CLOSED'"),
    kapali_vardiya_nakit_hareketleri: count(db, "pos_cash_transactions", "WHERE shift_id IN (SELECT id FROM pos_shifts WHERE status = 'CLOSED')"),
    acik_veya_bilinmeyen_vardiya: count(db, "pos_shifts", "WHERE status IS NULL OR status <> 'CLOSED'"),
    siparis_baglantisi_kaldirilacak_sadakat_hareketi: count(db, "loyalty_transactions", "WHERE order_id IN (SELECT id FROM orders)"),
    korunacak_musteri: count(db, "customers"),
    korunacak_urun: count(db, "products"),
    korunacak_stok_kaydi: count(db, "inventory"),
    korunacak_stok_defteri_hareketi: count(db, "inventory_ledger"),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const dbPath = fs.realpathSync(options.db);
  if (!fs.statSync(dbPath).isFile()) throw new Error("Veritabanı yolu bir dosya olmalıdır.");
  process.umask(0o077);
  const db = new Database(dbPath, { fileMustExist: true, readonly: options.mode === "--inspect", timeout: 5000 });
  let locked = false;
  try {
    db.pragma("foreign_keys = ON");
    assertSchema(db);
    if (db.pragma("quick_check", { simple: true }) !== "ok") throw new Error("Veritabanı bütünlük kontrolü başarısız.");
    if (db.pragma("foreign_key_check").length) throw new Error("Mevcut veritabanında yabancı anahtar hatası var; işlem durduruldu.");
    console.log(`Veritabanı: ${dbPath}`);
    console.log(JSON.stringify(report(db), null, 2));
    console.log("Stok miktarları, stok defteri, müşteriler, puanlar, ürünler ve sipariş numarası rezervasyonları korunur.");
    if (options.mode === "--inspect") {
      console.log("İnceleme tamamlandı; hiçbir veri değiştirilmedi.");
      return;
    }

    // Yazma kilidi, yedek ile silme arasında başka bir işlemin veri değiştirmesini engeller.
    db.exec("BEGIN IMMEDIATE");
    locked = true;
    const current = report(db);
    if (current.acik_veya_bilinmeyen_vardiya > 0) throw new Error("Açık veya durumu bilinmeyen vardiya var. Önce vardiyaları kapatın; hiçbir veri silinmedi.");
    const backupDir = options.backupDir || path.join(path.dirname(dbPath), "backups");
    fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
    const backupPath = path.join(backupDir, `before-sales-reset-${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}.db`);
    if (fs.existsSync(backupPath)) throw new Error("Yedek dosyası zaten var; işlem durduruldu.");
    const reader = new Database(dbPath, { readonly: true, fileMustExist: true, timeout: 5000 });
    try {
      await reader.backup(backupPath);
    } finally {
      reader.close();
    }
    fs.chmodSync(backupPath, 0o600);
    const backup = new Database(backupPath, { readonly: true, fileMustExist: true });
    try {
      if (backup.pragma("integrity_check", { simple: true }) !== "ok") throw new Error("Yedek bütünlük kontrolü başarısız; hiçbir veri silinmedi.");
      if (JSON.stringify(report(backup)) !== JSON.stringify(current)) throw new Error("Yedek ve kaynak kayıt sayıları uyuşmuyor; hiçbir veri silinmedi.");
    } finally {
      backup.close();
    }
    console.log(`Doğrulanmış yedek: ${backupPath}`);
    db.exec(`
      UPDATE loyalty_transactions SET order_id = NULL WHERE order_id IN (SELECT id FROM orders);
      DELETE FROM order_return_items;
      DELETE FROM order_returns;
      DELETE FROM order_status_history;
      DELETE FROM order_items;
      DELETE FROM orders;
      DELETE FROM pos_cash_transactions WHERE shift_id IN (SELECT id FROM pos_shifts WHERE status = 'CLOSED');
      DELETE FROM pos_shifts WHERE status = 'CLOSED';
    `);
    if (db.pragma("foreign_key_check").length) throw new Error("İşlem sonrası yabancı anahtar kontrolü başarısız; değişiklikler geri alındı.");
    db.exec("COMMIT");
    locked = false;
    console.log("Satışlar ve kapalı vardiya / Z raporları temizlendi. Son durum:");
    console.log(JSON.stringify(report(db), null, 2));
  } finally {
    if (locked) db.exec("ROLLBACK");
    db.close();
  }
}

main().catch((error) => {
  console.error(`HATA: ${error.message}\n${usage}`);
  process.exitCode = 1;
});
