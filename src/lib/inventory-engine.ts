import { db, sqlite } from "@/db";
import { inventory, inventoryLedger, inventoryReservations } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

export interface StockAdjustmentInput {
  warehouseId: number;
  productId: number;
  variantId?: number | null;
  quantityDelta: number; // e.g. -5 for sale, +50 for purchase
  transactionType: "SALE" | "PURCHASE" | "TRANSFER_IN" | "TRANSFER_OUT" | "ADJUSTMENT" | "COUNT_DIFF" | "DAMAGE" | "RETURN";
  referenceType?: string;
  referenceId?: string;
  note?: string;
  createdBy?: string;
  unitCost?: string;
}

export class StockShortage extends Error {
  constructor(message = "Yetersiz kullanılabilir stok. Lütfen sepetinizi kontrol edin.") { super(message); }
}

function writeTransaction<T>(callback: () => T): T {
  return sqlite.inTransaction ? callback() : sqlite.transaction(callback).immediate();
}

// Synchronous variant for callers that already hold a SQLite transaction.
export function adjustInventorySync(input: StockAdjustmentInput) {
  const { warehouseId, productId, variantId = null, quantityDelta, transactionType, referenceType, referenceId, note, createdBy = "Sistem", unitCost = "0.00" } = input;

  // 1. Find existing inventory entry or create
  const existingConditions = [
    eq(inventory.warehouseId, warehouseId),
    eq(inventory.productId, productId),
  ];

  if (variantId) {
    existingConditions.push(eq(inventory.variantId, variantId));
  } else {
    existingConditions.push(sql`${inventory.variantId} IS NULL`);
  }

  const existing = db
    .select()
    .from(inventory)
    .where(and(...existingConditions))
    .limit(2).all();

  if (!Number.isSafeInteger(quantityDelta)) throw new StockShortage("Geçersiz stok miktarı.");
  if (existing.length > 1) throw new StockShortage("Stok kayıtları tutarsız; lütfen yetkiliye başvurun.");
  if (quantityDelta < 0 && (!existing[0] || existing[0].physicalQty - existing[0].reservedQty < -quantityDelta)) throw new StockShortage();
  if (existing.length > 0) {
    const current = existing[0];
    const newPhysical = current.physicalQty + quantityDelta;

    db
      .update(inventory)
      .set({
        physicalQty: newPhysical,
        updatedAt: new Date(),
      })
      .where(eq(inventory.id, current.id)).run();
  } else {
    // Insert new inventory row if it doesn't exist
    db.insert(inventory).values({
      warehouseId,
      productId,
      variantId,
      physicalQty: quantityDelta,
      reservedQty: 0,
      minStock: 10,
      maxStock: 500,
      reorderPoint: 15,
      locationCode: "GENEL-A-01",
    }).run();
  }

  // 2. Insert into inventory ledger (Stock Ledger is IMMUTABLE)
  db.insert(inventoryLedger).values({
    transactionType,
    warehouseId,
    productId,
    variantId,
    quantity: quantityDelta,
    unitCost,
    referenceType,
    referenceId,
    note,
    createdBy,
  }).run();

  return { success: true };
}

// Retain the async API used by the other inventory workflows.
export async function adjustInventory(input: StockAdjustmentInput) {
  return writeTransaction(() => adjustInventorySync(input));
}

export async function transferBetweenWarehouses(
  fromWarehouseId: number,
  toWarehouseId: number,
  productId: number,
  variantId: number | null,
  quantity: number,
  note: string,
  user: string = "Depo Sorumlusu"
) {
  const transferRef = `TRF-${Date.now().toString().slice(-6)}`;
  return writeTransaction(() => {
    adjustInventorySync({warehouseId:fromWarehouseId,productId,variantId,quantityDelta:-quantity,transactionType:"TRANSFER_OUT",referenceType:"TRANSFER",referenceId:transferRef,note:`Sevk -> Depo #${toWarehouseId}. ${note}`,createdBy:user});
    adjustInventorySync({warehouseId:toWarehouseId,productId,variantId,quantityDelta:quantity,transactionType:"TRANSFER_IN",referenceType:"TRANSFER",referenceId:transferRef,note:`Teslim Alma <- Depo #${fromWarehouseId}. ${note}`,createdBy:user});
    return { success:true, transferRef };
  });
}

/* ============================================================
 * FAZ 3 — STOK REZERVASYON MOTORU
 * Checkout/sepet aşamasında stok 15 dk (varsayılan) kilitlenir;
 * ödeme tamamlanırsa rezervasyon CONSUMED olur, süre dolarsa EXPIRED.
 * ============================================================ */

export const RESERVATION_TTL_MINUTES = Number(process.env.STOCK_RESERVATION_MINUTES || 15);

export interface ReserveStockInput {
  warehouseId: number;
  productId: number;
  variantId?: number | null;
  qty: number;
  referenceType?: "CART" | "CHECKOUT" | "ORDER";
  referenceId: string;
  createdBy?: string;
  ttlMinutes?: number;
}

const PAYMENT_HOLD = "PAYMENT_HOLD";
const POS_HOLD = "POS_SALE_HOLD";
export const PAYMENT_HOLD_SECONDS = 24 * 60 * 60;

function stockRow(warehouseId: number, productId: number, variantId: number | null) {
  const rows = sqlite.prepare("SELECT * FROM inventory WHERE warehouse_id=? AND product_id=? AND variant_id IS ? LIMIT 2").all(warehouseId, productId, variantId) as Array<{id:number;physical_qty:number;reserved_qty:number}>;
  if (rows.length > 1) throw new StockShortage("Stok kayıtları tutarsız; lütfen yetkiliye başvurun.");
  return rows[0];
}

// These operations must be used within a write transaction, including order creation.
function reserveStockSync(input: ReserveStockInput, paymentHold = false) {
  const qty = Number(input.qty), variantId = input.variantId ?? null;
  if (!paymentHold && input.referenceType && !["CART", "CHECKOUT", "ORDER"].includes(input.referenceType)) throw new StockShortage("Geçersiz rezervasyon türü.");
  if (!Number.isSafeInteger(qty) || qty <= 0 || !Number.isSafeInteger(input.productId) || input.productId <= 0 || !Number.isSafeInteger(input.warehouseId) || input.warehouseId <= 0) throw new StockShortage("Geçersiz stok miktarı veya ürün.");
  const row = stockRow(input.warehouseId, input.productId, variantId);
  if (!row || row.physical_qty - row.reserved_qty < qty) throw new StockShortage();
  const [{ id }] = db.insert(inventoryReservations).values({
    warehouseId: input.warehouseId, productId: input.productId, variantId, qty,
    referenceType: paymentHold ? PAYMENT_HOLD : input.referenceType || "CART",
    referenceId: input.referenceId, status: "ACTIVE",
    expiresAt: paymentHold ? new Date(Date.now() + PAYMENT_HOLD_SECONDS * 1000) : new Date(Date.now() + (input.ttlMinutes || RESERVATION_TTL_MINUTES) * 60_000),
    createdBy: input.createdBy || "Sistem",
  }).returning({ id: inventoryReservations.id }).all();
  sqlite.prepare("UPDATE inventory SET reserved_qty=reserved_qty+?,updated_at=unixepoch() WHERE id=?").run(qty,row.id);
  db.insert(inventoryLedger).values({ transactionType: "RESERVATION", warehouseId: input.warehouseId, productId: input.productId, variantId, quantity: qty, referenceType: "RESERVATION", referenceId: String(id), note: `Rezervasyon ${input.referenceId}`, createdBy: input.createdBy || "Sistem" }).run();
  return db.select().from(inventoryReservations).where(eq(inventoryReservations.id,id)).get()!;
}

export function reservePaymentStock(input: ReserveStockInput) {
  if (!sqlite.inTransaction) throw new Error("Payment reservation requires transaction");
  return reserveStockSync(input, true);
}

export function reserveStocks(inputs: ReserveStockInput[]) {
  try {
    return writeTransaction(() => { expireReservationsSync(); return { success:true as const, reservations:inputs.map(input => reserveStockSync(input)) }; });
  } catch (error) {
    if (error instanceof StockShortage) return { success:false as const, error:error.message };
    throw error;
  }
}

export async function reserveStock(input: ReserveStockInput) {
  try {
    return writeTransaction(() => { expireReservationsSync(); const reservation = reserveStockSync(input); return { success: true as const, reservation }; });
  } catch (error) {
    if (error instanceof StockShortage) return { success: false as const, error: error.message, available: 0 };
    throw error;
  }
}

type ReservationRow = { id:number; warehouse_id:number; product_id:number; variant_id:number|null; qty:number; reference_id:string|null };
function finishReservation(r: ReservationRow, status: "CONSUMED" | "RELEASED" | "EXPIRED", saleRef?: string, user = "Sistem", saleType = "ORDER") {
  const row = stockRow(r.warehouse_id, r.product_id, r.variant_id);
  if (!row || row.reserved_qty < r.qty || row.physical_qty < row.reserved_qty) throw new StockShortage("Rezervasyon ve stok kayıtları tutarsız; işlem yapılmadı.");
  sqlite.prepare("UPDATE inventory SET reserved_qty=reserved_qty-?,updated_at=unixepoch() WHERE id=?").run(r.qty,row.id);
  sqlite.prepare("UPDATE inventory_reservations SET status=? WHERE id=? AND status='ACTIVE'").run(status,r.id);
  if (status === "CONSUMED") {
    adjustInventorySync({ warehouseId:r.warehouse_id,productId:r.product_id,variantId:r.variant_id,quantityDelta:-r.qty,transactionType:"SALE",referenceType:saleType,referenceId:saleRef,note:`Rezerve satış (#${r.id} → ${saleRef})`,createdBy:user });
  } else if (status === "RELEASED") {
    db.insert(inventoryLedger).values({ transactionType:"RESERVATION_RELEASE",warehouseId:r.warehouse_id,productId:r.product_id,variantId:r.variant_id,quantity:-r.qty,referenceType:"RESERVATION",referenceId:String(r.id),note:"Rezervasyon serbest bırakıldı",createdBy:user }).run();
  }
}

/** Order holds are only settled by the order payment/cancellation transaction. */
export function finishPaymentHolds(orderId: number, status: "CONSUMED" | "RELEASED", saleRef: string, user: string) {
  if (!sqlite.inTransaction) throw new Error("Payment settlement requires transaction");
  const rows = sqlite.prepare("SELECT * FROM inventory_reservations WHERE reference_type=? AND reference_id=? AND status='ACTIVE' ORDER BY id").all(PAYMENT_HOLD,String(orderId)) as ReservationRow[];
  const items = sqlite.prepare("SELECT product_id,variant_id,quantity FROM order_items WHERE order_id=? ORDER BY id").all(orderId) as Array<{product_id:number;variant_id:number|null;quantity:number}>;
  if (!items.length || rows.length !== items.length || rows.some((r,i) => r.product_id !== items[i].product_id || r.variant_id !== items[i].variant_id || r.qty !== items[i].quantity)) throw new StockShortage("Sipariş stok rezervasyonu eksik veya tutarsız; işlem yapılmadı.");
  if (status === "CONSUMED") {
    const expired = sqlite.prepare("SELECT 1 FROM inventory_reservations WHERE reference_type=? AND reference_id=? AND status='ACTIVE' AND expires_at<=unixepoch() LIMIT 1").get(PAYMENT_HOLD,String(orderId));
    if (expired) throw new StockShortage("Havale süresi doldu; ödeme onaylanmadı. Banka hareketini inceleyin.");
  }
  for (const r of rows) finishReservation(r,status,saleRef,user);
}

/** POS holds never expire automatically: after a crash payment may already have happened. */
export function reservePosStock(input: ReserveStockInput) {
  if (!sqlite.inTransaction) throw new Error("POS reservation requires transaction");
  const qty=Number(input.qty), variantId=input.variantId??null;
  if(!Number.isSafeInteger(qty)||qty<=0||input.warehouseId!==2) throw new StockShortage("Geçersiz POS stok miktarı.");
  const row=stockRow(input.warehouseId,input.productId,variantId);
  if(!row||row.physical_qty-row.reserved_qty<qty)throw new StockShortage("POS satışı için stok yetersiz.");
  const result=sqlite.prepare("INSERT INTO inventory_reservations(warehouse_id,product_id,variant_id,qty,reference_type,reference_id,status,expires_at,created_by) VALUES(?,?,?,?,?,?,'ACTIVE',253402300799,?)").run(input.warehouseId,input.productId,variantId,qty,POS_HOLD,input.referenceId,input.createdBy||"POS");
  sqlite.prepare("UPDATE inventory SET reserved_qty=reserved_qty+?,updated_at=unixepoch() WHERE id=?").run(qty,row.id);
  db.insert(inventoryLedger).values({transactionType:"RESERVATION",warehouseId:input.warehouseId,productId:input.productId,variantId,quantity:qty,referenceType:"RESERVATION",referenceId:String(result.lastInsertRowid),note:`POS hazırlığı ${input.referenceId}`,createdBy:input.createdBy||"POS"}).run();
}
export function finishPosStock(key:string, lines:Array<{productId:number;variantId:number|null;quantity:number}>, status:"CONSUMED"|"RELEASED", saleRef:string, user:string) {
  if(!sqlite.inTransaction)throw new Error("POS settlement requires transaction");
  const rows=sqlite.prepare("SELECT * FROM inventory_reservations WHERE reference_type=? AND reference_id=? AND status='ACTIVE' ORDER BY id").all(POS_HOLD,key) as ReservationRow[];
  if(rows.length!==lines.length||!lines.length||rows.some((r,i)=>r.warehouse_id!==2||r.product_id!==lines[i].productId||r.variant_id!==lines[i].variantId||r.qty!==lines[i].quantity))throw new StockShortage("POS stok rezervasyonu tutarsız; yetkili incelemesi gerekli.");
  for(const row of rows)finishReservation(row,status,saleRef,user,"POS_SALE");
}

export async function releaseReservations(referenceId: string, _reason = "Vazgeçme") {
  return writeTransaction(() => {
    expireReservationsSync();
    const rows = sqlite.prepare("SELECT * FROM inventory_reservations WHERE reference_id=? AND reference_type NOT IN (?,?) AND status='ACTIVE'").all(referenceId,PAYMENT_HOLD,POS_HOLD) as ReservationRow[];
    for (const r of rows) finishReservation(r,"RELEASED");
    return { success:true, released:rows.length };
  });
}

export async function consumeReservation(referenceId: string, saleReferenceId: string, user = "Sistem") {
  return writeTransaction(() => {
    const rows = sqlite.prepare("SELECT * FROM inventory_reservations WHERE reference_id=? AND reference_type NOT IN (?,?) AND status='ACTIVE' AND expires_at>=unixepoch()").all(referenceId,PAYMENT_HOLD,POS_HOLD) as ReservationRow[];
    for (const r of rows) finishReservation(r,"CONSUMED",saleReferenceId,user);
    return { success:true, consumed:rows.length, items:rows.map(r=>({productId:r.product_id,variantId:r.variant_id,qty:r.qty,warehouseId:r.warehouse_id})) };
  });
}

function expireReservationsSync() {
  const rows = sqlite.prepare("SELECT * FROM inventory_reservations WHERE status='ACTIVE' AND reference_type NOT IN (?,?) AND expires_at<unixepoch()").all(PAYMENT_HOLD,POS_HOLD) as ReservationRow[];
  for (const r of rows) finishReservation(r,"EXPIRED");
  return {expired:rows.length};
}
export async function expireReservations() { return writeTransaction(expireReservationsSync); }
