/** Pure, fail-closed stock reversal planner. It does not read or write the database. */
export type StockIdentity = { warehouseId: number; productId: number; variantId: number | null };
export type DeletionItem = { productId: number; variantId: number | null; quantity: number };
export type HistoricalMovement = StockIdentity & { quantity: number };
export type DeletionReturn = { id: number; status: "REFUNDED" | "REJECTED"; restock: boolean; items: DeletionItem[]; movements: HistoricalMovement[] };
export type InventoryBalance = StockIdentity & { physical: number; reserved: number };
export type StockReversal = StockIdentity & { delta: number; physical: number; reserved: number; after: number };

export class StockPlanError extends Error {}
const fail = (message: string): never => { throw new StockPlanError(message); };
const validId = (v: number) => Number.isSafeInteger(v) && v > 0;
const validVariant = (v: number | null) => v === null || validId(v);
const itemKey = (v: Pick<StockIdentity,"productId"|"variantId">) => `${v.productId}:${v.variantId ?? "-"}`;
const stockKey = (v: StockIdentity) => `${v.warehouseId}:${itemKey(v)}`;
function add(map: Map<string,number>, key: string, amount: number) {
  const value=(map.get(key) ?? 0)+amount;
  if(!Number.isSafeInteger(value)) fail("Stok miktarı güvenli hesaplanamadı.");
  map.set(key,value);
}
function aggregateItems(items: DeletionItem[]): Map<string,number> {
  const result=new Map<string,number>();
  for(const item of items) {
    if(!validId(item.productId) || !validVariant(item.variantId) || !validId(item.quantity)) fail("Ürün veya miktar kaydı geçersiz.");
    add(result,itemKey(item),item.quantity);
  }
  return result;
}
function movementTotals(movements: HistoricalMovement[], direction: -1 | 1): Map<string,number> {
  const totals=new Map<string,number>();
  for(const row of movements) {
    if(!validId(row.warehouseId) || !validId(row.productId) || !validVariant(row.variantId) || !Number.isSafeInteger(row.quantity) || row.quantity*direction<=0) fail("Stok hareketi geçersiz veya beklenmeyen yönde.");
    add(totals,itemKey(row),row.quantity*direction);
  }
  return totals;
}
function equalAmounts(expected: Map<string,number>, actual: Map<string,number>) {
  return expected.size===actual.size && [...expected].every(([key,value])=>actual.get(key)===value);
}

/**
 * Build a net inverse of verified immutable stock movements. An order deletion
 * passes its sale movements and all finalized returns; a return-only deletion
 * passes no sale items/movements and exactly that finalized return. Callers
 * MUST query all movements by validated original reference, verify account and
 * payment state, obtain physical confirmation, and re-plan under a write lock.
 */
export function planStockReversal(input: { saleItems: DeletionItem[]; saleMovements: HistoricalMovement[]; returns: DeletionReturn[]; balances: InventoryBalance[] }): StockReversal[] {
  if(!equalAmounts(aggregateItems(input.saleItems),movementTotals(input.saleMovements,-1))) fail("Satış miktarı ile stok hareketleri uyuşmuyor; manuel mutabakat gerekli.");
  const saleCounts=aggregateItems(input.saleItems);
  const returnedCounts=new Map<string,number>();
  const seen=new Set<number>();
  for(const ret of input.returns) {
    if(!validId(ret.id) || seen.has(ret.id) || typeof ret.restock!=="boolean" || !["REFUNDED","REJECTED"].includes(ret.status)) fail("İade durumu veya kimliği geçersiz.");
    seen.add(ret.id);
    const items=aggregateItems(ret.items);
    if(!items.size) fail("İade kalemleri eksik.");
    if (ret.status === "REFUNDED" && saleCounts.size) {
      for (const [key, qty] of items) {
        add(returnedCounts,key,qty);
        if ((returnedCounts.get(key) ?? 0) > (saleCounts.get(key) ?? 0)) fail("İade miktarı satış miktarını aşıyor.");
      }
    }
    const expected=ret.status==="REFUNDED" && ret.restock ? items : new Map<string,number>();
    if(!equalAmounts(expected,movementTotals(ret.movements,1))) fail("İade miktarı ile stok hareketleri uyuşmuyor; manuel mutabakat gerekli.");
  }
  const deltas=new Map<string,{identity:StockIdentity;delta:number}>();
  for(const row of [...input.saleMovements,...input.returns.flatMap(r=>r.movements)]) {
    const key=stockKey(row), old=deltas.get(key), delta=(old?.delta ?? 0)-row.quantity;
    if(!Number.isSafeInteger(delta)) fail("Stok değişimi güvenli hesaplanamadı.");
    deltas.set(key,{identity:{warehouseId:row.warehouseId,productId:row.productId,variantId:row.variantId},delta});
  }
  const balances=new Map<string,InventoryBalance>();
  for(const row of input.balances) {
    if(!validId(row.warehouseId) || !validId(row.productId) || !validVariant(row.variantId) || !Number.isSafeInteger(row.physical) || !Number.isSafeInteger(row.reserved) || row.reserved<0 || row.physical<row.reserved) fail("Mevcut stok veya rezervasyon tutarsız.");
    const key=stockKey(row);if(balances.has(key)) fail("Yinelenen stok kaydı; manuel mutabakat gerekli.");balances.set(key,row);
  }
  return [...deltas.entries()].map(([key,{identity,delta}])=>{
    const balance=balances.get(key);
    if(!balance) return fail("Stok kaydı eksik; fiziksel durum bilinmediğinden işlem yapılmadı.");
    const {physical,reserved}=balance, after=physical+delta;
    if(!Number.isSafeInteger(after) || after<reserved) fail("Ters işlem için ayrılmamış stok yetersiz; işlem yapılmadı.");
    return {...identity,delta,physical,reserved,after};
  }).sort((a,b)=>a.warehouseId-b.warehouseId || a.productId-b.productId || (a.variantId ?? 0)-(b.variantId ?? 0));
}
