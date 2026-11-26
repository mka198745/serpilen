import { sqlite } from "@/db";

/** The setting is intentionally not inferred from warehouse IDs or names. */
export const SHARED_SALES_WAREHOUSE_KEY = "sales.shared_warehouse_id";

export class SharedWarehouseError extends Error {
  constructor(message: string, readonly code: string) { super(message); }
}

/** Fail closed when the setting is absent, invalid, missing or inactive. */
export function sharedSalesWarehouseId(): number | null {
  const setting = sqlite.prepare("SELECT value FROM app_settings WHERE key=?").get(SHARED_SALES_WAREHOUSE_KEY) as { value: string } | undefined;
  if (!setting || !/^[1-9]\d*$/.test(setting.value)) return null;
  const id = Number(setting.value);
  if (!Number.isSafeInteger(id)) return null;
  return sqlite.prepare("SELECT 1 FROM warehouses WHERE id=? AND is_active=1").get(id) ? id : null;
}

/**
 * Caller must recheck authorization within the same IMMEDIATE write transaction.
 * Selection never moves stock or edits existing orders. Pending obligations block it.
 */
export function selectSharedSalesWarehouse(id: number, actor: { id: number; name: string }) {
  if (!sqlite.inTransaction) throw new Error("Shared warehouse selection requires a write transaction");
  if (!Number.isSafeInteger(id) || id <= 0 || !sqlite.prepare("SELECT 1 FROM warehouses WHERE id=? AND is_active=1").get(id)) {
    throw new SharedWarehouseError("Geçerli ve aktif bir depo seçin.", "INVALID_WAREHOUSE");
  }
  const current = sharedSalesWarehouseId();
  if (current === id) return { id, changed: false };
  const checks: Array<[string, string]> = [
    ["açık POS vardiyası", "SELECT 1 FROM pos_shifts WHERE status IS NULL OR status<>'CLOSED' LIMIT 1"],
    ["sonuçlanmamış POS satışı", "SELECT 1 FROM pos_sale_intents WHERE status IS NULL OR status NOT IN ('COMPLETED','CANCELLED') LIMIT 1"],
    ["açık iade", "SELECT 1 FROM order_returns WHERE status IS NULL OR status NOT IN ('REFUNDED','REJECTED') LIMIT 1"],
    ["açık online sipariş", "SELECT 1 FROM orders WHERE order_type='ONLINE_B2C' AND (status IS NULL OR status NOT IN ('DELIVERED','CANCELLED','RETURNED','REFUNDED') OR (status<>'CANCELLED' AND (payment_status IS NULL OR payment_status NOT IN ('PAID','REFUNDED')))) LIMIT 1"],
    ["aktif stok rezervasyonu", "SELECT 1 FROM inventory_reservations WHERE status IS NULL OR status='ACTIVE' LIMIT 1"],
    ["ayrılmış veya tutarsız stok", "SELECT 1 FROM inventory WHERE reserved_qty IS NULL OR reserved_qty<>0 OR physical_qty IS NULL OR physical_qty<0 LIMIT 1"],
  ];
  const blocked = checks.filter(([, sql]) => sqlite.prepare(sql).get()).map(([label]) => label);
  if (blocked.length) throw new SharedWarehouseError(`Ortak depo değiştirilemedi: ${blocked.join(", ")}. Önce açık işlemleri inceleyin.`, "OPEN_OPERATIONS");
  sqlite.prepare("INSERT INTO app_settings(key,value,description,updated_at) VALUES(?,?,?,unixepoch()) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").run(SHARED_SALES_WAREHOUSE_KEY, String(id), "POS ve online ortak satış deposu");
  sqlite.prepare("INSERT INTO audit_logs(user_id,user_name,action,entity,entity_id,details) VALUES(?,?,'SHARED_SALES_WAREHOUSE_CHANGED','Warehouse',?,?)").run(String(actor.id), actor.name, String(id), `Önceki: ${current ?? "seçilmemiş"}; yeni: ${id}. Stoklar taşınmadı.`);
  return { id, changed: true };
}
