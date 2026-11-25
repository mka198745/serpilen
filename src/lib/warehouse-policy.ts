import { sharedSalesWarehouseId } from "@/lib/shared-sales-warehouse";
import { sqlite } from "@/db";

/** Protect the currently configured shared warehouse. Before configuration,
 * preserve legacy channel warehouses; invalid configuration fails closed. */
export function protectedWarehouseReason(id: number): string | null {
 const row = sqlite.prepare("SELECT value FROM app_settings WHERE key='sales.shared_warehouse_id'").get() as { value: string } | undefined;
 if (!row) return id === 2 || id === 3 ? "Mevcut satış deposu; ortak satış deposu seçilene kadar silinemez veya pasife alınamaz." : null;
 if (!/^[1-9]\d*$/.test(row.value) || !Number.isSafeInteger(Number(row.value))) return "Ortak satış deposu ayarı geçersiz; önce yöneticiyle kontrol edin.";
 return Number(row.value) === id ? "POS ve online satış için seçilen ortak depo silinemez veya pasife alınamaz." : null;
}
/** Missing input chooses an existing active warehouse, never a deleted ID. Explicit IDs must exist and be active. */
export function resolveActiveWarehouse(value: unknown): number | null {
 if (value === undefined || value === null || value === "") {
  const configured=sharedSalesWarehouseId();
  if(configured) return configured;
  const row=sqlite.prepare("SELECT id FROM warehouses WHERE is_active=1 ORDER BY CASE WHEN type='CENTRAL' THEN 0 ELSE 1 END,id LIMIT 1").get() as {id:number}|undefined;
  return row?.id ?? null;
 }
 const id=Number(value);if(!Number.isSafeInteger(id)||id<=0)return null;
 return sqlite.prepare('SELECT id FROM warehouses WHERE id=? AND is_active=1').get(id) ? id : null;
}
