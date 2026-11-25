import { sqlite } from "@/db";

// These IDs are still referenced by the POS and online-order engines.
export const POS_WAREHOUSE_ID = 2;
export const ONLINE_WAREHOUSE_ID = 3;
export function protectedWarehouseReason(id: number): string | null {
 if (id === POS_WAREHOUSE_ID) return "POS satış ve iade işlemlerinde kullanılan mağaza deposu silinemez veya pasife alınamaz.";
 if (id === ONLINE_WAREHOUSE_ID) return "Online sipariş ve stok sırası için kullanılan depo silinemez veya pasife alınamaz.";
 return null;
}
/** Missing input chooses an existing active warehouse, never a deleted ID. Explicit IDs must exist and be active. */
export function resolveActiveWarehouse(value: unknown): number | null {
 if (value === undefined || value === null || value === "") {
  const row=sqlite.prepare("SELECT id FROM warehouses WHERE is_active=1 ORDER BY CASE WHEN type='CENTRAL' THEN 0 ELSE 1 END,id LIMIT 1").get() as {id:number}|undefined;
  return row?.id ?? null;
 }
 const id=Number(value);if(!Number.isSafeInteger(id)||id<=0)return null;
 return sqlite.prepare('SELECT id FROM warehouses WHERE id=? AND is_active=1').get(id) ? id : null;
}
