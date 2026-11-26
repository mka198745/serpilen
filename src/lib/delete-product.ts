import type Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { normalizeRoleMatrix, type MatrixRole } from "@/lib/admin-modules";

type Actor = { id: number; role: string; name: string };
type ErrorResult = { status: 403 | 404 | 409; error: string };
type StockRow = { id: number; warehouseId: number; warehouseName: string | null; variantId: number | null; physicalQty: number; reservedQty: number };
export type ProductDeletionPreview = { name: string; totalStock: number; warehouses: { id: number; name: string; quantity: number }[]; fingerprint: string };
type Inspection = ErrorResult | { status: 200; preview: ProductDeletionPreview; stocks: StockRow[] };
type DeletionResult = ErrorResult | { status: 200; name: string };
const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

/** Must execute inside a SQLite transaction. History, ownership and all reservations are checked on both preview and deletion. */
function inspectDeletion(sqlite: Database.Database, id: number, actor: Actor): Inspection {
  const user = sqlite.prepare("SELECT role,is_active FROM users WHERE id=?").get(actor.id) as {role:string; is_active:number} | undefined;
  if (!user || !user.is_active || actor.role !== user.role) return {status:403,error:"Ürün silme yetkiniz bulunmuyor."};
  const setting = sqlite.prepare("SELECT value FROM app_settings WHERE key='admin.role_matrix'").get() as {value:string | null} | undefined;
  let stored: unknown = null;
  try { if (setting?.value) stored = JSON.parse(setting.value); } catch { /* non-super roles fail closed */ }
  const row = normalizeRoleMatrix(stored)[user.role as MatrixRole];
  if (!row || row.catalog !== true || row.productDelete !== true) return {status:403,error:"Ürün silmek için katalog ve ürün silme yetkisi gerekir."};
  const product = sqlite.prepare("SELECT name FROM products WHERE id=?").get(id) as {name:string} | undefined;
  if (!product) return {status:404,error:"Ürün bulunamadı."};

  // Unknown and future relationships are also protected. Do not erase history.
  const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as {name:string}[];
  for (const {name} of tables) {
    if (["products", "product_variants", "product_images", "inventory"].includes(name)) continue;
    const columns = (sqlite.prepare(`PRAGMA table_info(${quote(name)})`).all() as {name:string}[]).map(c=>c.name);
    const conditions: string[] = [];
    const args: number[] = [];
    for (const column of ["product_id", "related_product_id"]) if (columns.includes(column)) { conditions.push(`${quote(column)} = ?`); args.push(id); }
    if (columns.includes("variant_id")) { conditions.push(`${quote("variant_id")} IN (SELECT id FROM product_variants WHERE product_id=?)`); args.push(id); }
    if (conditions.length && sqlite.prepare(`SELECT 1 FROM ${quote(name)} WHERE ${conditions.join(" OR ")} LIMIT 1`).get(...args)) {
      return {status:409,error:"Bu ürünün sipariş, stok hareketi veya başka ilişkili kayıtları var; geçmişi korumak için silinemez. Ürünü pasife alabilirsiniz."};
    }
  }
  for (const table of ["inventory", "product_images"]) {
    if (sqlite.prepare(`SELECT 1 FROM ${table} WHERE product_id=? AND variant_id IS NOT NULL AND variant_id NOT IN (SELECT id FROM product_variants WHERE product_id=?) LIMIT 1`).get(id,id)) return {status:409,error:"Ürün ve varyant kayıtları tutarsız; silme işlemi yapılmadı."};
  }
  if (sqlite.prepare("SELECT 1 FROM inventory WHERE product_id<>? AND variant_id IN (SELECT id FROM product_variants WHERE product_id=?) LIMIT 1").get(id,id)) return {status:409,error:"Varyant stokları başka bir ürüne bağlı; silme işlemi yapılmadı."};
  if (sqlite.prepare("SELECT 1 FROM product_images WHERE product_id<>? AND variant_id IN (SELECT id FROM product_variants WHERE product_id=?) LIMIT 1").get(id,id)) return {status:409,error:"Ürün görsellerinde başka kayıtlara bağlı varyant var; ürün silinemedi."};

  const stocks = sqlite.prepare(`SELECT i.id, i.warehouse_id AS warehouseId, w.name AS warehouseName, i.variant_id AS variantId,
    i.physical_qty AS physicalQty, i.reserved_qty AS reservedQty FROM inventory i
    LEFT JOIN warehouses w ON w.id=i.warehouse_id WHERE i.product_id=? ORDER BY i.id`).all(id) as StockRow[];
  const warehouses = new Map<number, {id:number; name:string; quantity:number}>();
  let totalStock = 0;
  for (const stock of stocks) {
    if (!stock.warehouseName || !Number.isSafeInteger(stock.physicalQty) || stock.physicalQty < 0 || stock.reservedQty !== 0) return {status:409,error:"Ürünün rezervasyonu veya geçersiz stok kaydı var; silinemez. Önce kayıtları kontrol edin."};
    totalStock += stock.physicalQty;
    if (!Number.isSafeInteger(totalStock)) return {status:409,error:"Stok toplamı güvenli olarak hesaplanamadı; ürün silinemedi."};
    const current = warehouses.get(stock.warehouseId) || {id:stock.warehouseId,name:stock.warehouseName,quantity:0};
    current.quantity += stock.physicalQty;
    warehouses.set(stock.warehouseId,current);
  }
  // Binds confirmation to the exact product, stock rows, quantities, reservations and warehouse names.
  const fingerprint = createHash("sha256").update(JSON.stringify({id,name:product.name,stocks})).digest("hex");
  return {status:200,stocks,preview:{name:product.name,totalStock,warehouses:[...warehouses.values()].sort((a,b)=>a.id-b.id),fingerprint}};
}

export function previewProductDeletion(sqlite: Database.Database, id: number, actor: Actor): Inspection {
  return sqlite.transaction(() => inspectDeletion(sqlite,id,actor)).deferred();
}

/** Authorization, history, reservation, confirmation and deletion share one write lock. */
export function deleteProductSafely(sqlite: Database.Database, id: number, actor: Actor, fingerprint?: string): DeletionResult {
  return sqlite.transaction((): DeletionResult => {
    const checked = inspectDeletion(sqlite,id,actor);
    if (checked.status !== 200) return checked;
    const {preview} = checked;
    if ((preview.totalStock > 0 && !fingerprint) || (fingerprint && fingerprint !== preview.fingerprint)) {
      return {status:409,error:"Stok silme onayı eksik veya stok değişti; ürünü tekrar seçip depolardaki miktarları doğrulayın."};
    }
    sqlite.prepare("DELETE FROM inventory WHERE product_id=?").run(id);
    sqlite.prepare("DELETE FROM product_images WHERE product_id=?").run(id);
    sqlite.prepare("DELETE FROM product_variants WHERE product_id=?").run(id);
    sqlite.prepare("DELETE FROM products WHERE id=?").run(id);
    sqlite.prepare("INSERT INTO audit_logs (user_id,user_name,action,entity,entity_id,details) VALUES (?,?,'PRODUCT_DELETED','Product',?,?)").run(String(actor.id),actor.name,String(id),JSON.stringify({name:preview.name,discardedStock:preview.totalStock,warehouses:preview.warehouses,stockRows:checked.stocks}));
    return {status:200,name:preview.name};
  }).immediate();
}
