import type Database from "better-sqlite3";
import { normalizeRoleMatrix, type MatrixRole } from "@/lib/admin-modules";

type Actor = { id: number; role: string; name: string };
type DeletionResult = { status: 200; name: string } | { status: 403 | 404 | 409; error: string };
const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

/** Delete only pristine products. Existing operational and history references must survive. */
export function deleteProductSafely(sqlite: Database.Database, id: number, actor: Actor): DeletionResult {
  return sqlite.transaction((): DeletionResult => {
    const user = sqlite.prepare("SELECT role,is_active FROM users WHERE id=?").get(actor.id) as {role:string; is_active:number} | undefined;
    if (!user || !user.is_active || actor.role !== user.role) return {status:403,error:"Ürün silme yetkiniz bulunmuyor."};
    // Permission is read inside the same write transaction as deletion, so revocation
    // or role changes cannot race with an already authorized delete.
    const setting = sqlite.prepare("SELECT value FROM app_settings WHERE key='admin.role_matrix'").get() as {value:string | null} | undefined;
    let stored: unknown = null;
    try { if (setting?.value) stored = JSON.parse(setting.value); } catch { /* non-super roles fail closed */ }
    const row = normalizeRoleMatrix(stored)[user.role as MatrixRole];
    if (!row || row.catalog !== true || row.productDelete !== true) return {status:403,error:"Ürün silmek için katalog ve ürün silme yetkisi gerekir."};
    const product = sqlite.prepare("SELECT name FROM products WHERE id=?").get(id) as {name:string} | undefined;
    if (!product) return {status:404,error:"Ürün bulunamadı."};

    // Discover the installed schema, including references added by future migrations. Any
    // non-owned product/variant reference blocks hard deletion, even historical records.
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
    // Inconsistent ownership must not cause us to remove another variant's records.
    for (const table of ["inventory", "product_images"]) {
      if (sqlite.prepare(`SELECT 1 FROM ${table} WHERE product_id=? AND variant_id IS NOT NULL AND variant_id NOT IN (SELECT id FROM product_variants WHERE product_id=?) LIMIT 1`).get(id,id)) return {status:409,error:"Ürün ve varyant kayıtları tutarsız; silme işlemi yapılmadı."};
    }
    // Never remove physical/reserved stock or other products' rows linked to its variants.
    if (sqlite.prepare("SELECT 1 FROM inventory WHERE (product_id=? OR variant_id IN (SELECT id FROM product_variants WHERE product_id=?)) AND (product_id<>? OR physical_qty<>0 OR reserved_qty<>0) LIMIT 1").get(id,id,id)) return {status:409,error:"Ürünün stok veya rezervasyonu var; silinemez. Önce stokları kontrol edin veya ürünü pasife alın."};
    if (sqlite.prepare("SELECT 1 FROM product_images WHERE product_id<>? AND variant_id IN (SELECT id FROM product_variants WHERE product_id=?) LIMIT 1").get(id,id)) return {status:409,error:"Ürün görsellerinde başka kayıtlara bağlı varyant var; ürün silinemedi."};
    sqlite.prepare("DELETE FROM inventory WHERE product_id=?").run(id);
    sqlite.prepare("DELETE FROM product_images WHERE product_id=?").run(id);
    sqlite.prepare("DELETE FROM product_variants WHERE product_id=?").run(id);
    sqlite.prepare("DELETE FROM products WHERE id=?").run(id);
    sqlite.prepare("INSERT INTO audit_logs (user_id,user_name,action,entity,entity_id,details) VALUES (?,?,'PRODUCT_DELETED','Product',?,?)").run(String(actor.id),actor.name,String(id),`Ürün silindi: ${product.name}`);
    return {status:200,name:product.name};
  }).immediate();
}
