import { db } from "@/db";
import { inventory, inventoryLedger, inventoryReservations, products, productVariants } from "@/db/schema";
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

export async function adjustInventory(input: StockAdjustmentInput) {
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

  const existing = await db
    .select()
    .from(inventory)
    .where(and(...existingConditions))
    .limit(1);

  if (existing.length > 0) {
    const current = existing[0];
    const newPhysical = Math.max(0, current.physicalQty + quantityDelta);

    await db
      .update(inventory)
      .set({
        physicalQty: newPhysical,
        updatedAt: new Date(),
      })
      .where(eq(inventory.id, current.id));
  } else {
    // Insert new inventory row if it doesn't exist
    await db.insert(inventory).values({
      warehouseId,
      productId,
      variantId,
      physicalQty: Math.max(0, quantityDelta),
      reservedQty: 0,
      minStock: 10,
      maxStock: 500,
      reorderPoint: 15,
      locationCode: "GENEL-A-01",
    });
  }

  // 2. Insert into inventory ledger (Stock Ledger is IMMUTABLE)
  await db.insert(inventoryLedger).values({
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
  });

  return { success: true };
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

  // Deduct from source
  await adjustInventory({
    warehouseId: fromWarehouseId,
    productId,
    variantId,
    quantityDelta: -quantity,
    transactionType: "TRANSFER_OUT",
    referenceType: "TRANSFER",
    referenceId: transferRef,
    note: `Sevk -> Depo #${toWarehouseId}. ${note}`,
    createdBy: user,
  });

  // Add to destination
  await adjustInventory({
    warehouseId: toWarehouseId,
    productId,
    variantId,
    quantityDelta: quantity,
    transactionType: "TRANSFER_IN",
    referenceType: "TRANSFER",
    referenceId: transferRef,
    note: `Teslim Alma <- Depo #${fromWarehouseId}. ${note}`,
    createdBy: user,
  });

  return { success: true, transferRef };
}

/* ============================================================
 * FAZ 3 — STOK REZERVASYON MOTORU
 * Checkout/sepet aşamasında stok 15 dk (varsayılan) kilitlenir;
 * ödeme tamamlanırsa rezervasyon CONSUMED olur, süre dolarsa EXPIRED.
 * ============================================================ */

export const RESERVATION_TTL_MINUTES = Number(process.env.STOCK_RESERVATION_MINUTES || 15);

/** Stok bakiye kaydını bulur veya oluşturur. */
async function getOrCreateStockRow(warehouseId: number, productId: number, variantId: number | null) {
  const conditions = [eq(inventory.warehouseId, warehouseId), eq(inventory.productId, productId)];
  if (variantId) conditions.push(eq(inventory.variantId, variantId));
  else conditions.push(sql`${inventory.variantId} IS NULL`);

  const rows = await db.select().from(inventory).where(and(...conditions)).limit(1);
  if (rows[0]) return rows[0];

  const [{ id: __created_id }] = await db.insert(inventory).values({
      warehouseId,
      productId,
      variantId,
      physicalQty: 0,
      reservedQty: 0,
      locationCode: "GENEL-A-01",
    }).$returningId();
  const [created] = await db.select().from(inventory).where(eq(inventory.id, __created_id));
  return created;
}

export interface ReserveStockInput {
  warehouseId: number;
  productId: number;
  variantId?: number | null;
  qty: number;
  referenceType?: "CART" | "CHECKOUT" | "ORDER";
  referenceId: string; // sepet anahtarı / sipariş no
  createdBy?: string;
  ttlMinutes?: number;
}

/** Kullanılabilir stok yeterliyse rezervasyon oluşturur; yetersizse reddeder (son ürünün çift satışını önler). */
export async function reserveStock(input: ReserveStockInput) {
  const qty = Math.max(1, Number(input.qty));
  const row = await getOrCreateStockRow(input.warehouseId, input.productId, input.variantId ?? null);
  const available = row.physicalQty - row.reservedQty;

  if (available < qty) {
    return {
      success: false as const,
      error: `Yetersiz stok. Kullanılabilir: ${Math.max(0, available)} adet.`,
      available,
    };
  }

  // Süresi dolmuş rezervasyonları temizle (temkinli ev toplama)
  await expireReservations();

  const [{ id: __reservation_id }] = await db.insert(inventoryReservations).values({
      warehouseId: input.warehouseId,
      productId: input.productId,
      variantId: input.variantId ?? null,
      qty,
      referenceType: input.referenceType || "CART",
      referenceId: input.referenceId,
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + (input.ttlMinutes || RESERVATION_TTL_MINUTES) * 60_000),
      createdBy: input.createdBy || "Sistem",
    }).$returningId();
  const [reservation] = await db.select().from(inventoryReservations).where(eq(inventoryReservations.id, __reservation_id));

  await db
    .update(inventory)
    .set({ reservedQty: row.reservedQty + qty, updatedAt: new Date() })
    .where(eq(inventory.id, row.id));

  await db.insert(inventoryLedger).values({
    transactionType: "RESERVATION",
    warehouseId: input.warehouseId,
    productId: input.productId,
    variantId: input.variantId ?? null,
    quantity: qty,
    referenceType: "RESERVATION",
    referenceId: String(reservation.id),
    note: `${input.referenceType || "CART"} rezervasyonu ${input.referenceId} (+${qty})`,
    createdBy: input.createdBy || "Sistem",
  });

  return { success: true as const, reservation };
}

/** Aynı referansa ait aktif rezervasyonları serbest bırakır (sepet iptali / ödeme vazgeçme). */
export async function releaseReservations(referenceId: string, reason = "Vazgeçme") {
  await expireReservations();
  const active = await db
    .select()
    .from(inventoryReservations)
    .where(and(eq(inventoryReservations.referenceId, referenceId), eq(inventoryReservations.status, "ACTIVE")));

  let released = 0;
  for (const r of active) {
    const row = await getOrCreateStockRow(r.warehouseId, r.productId, r.variantId);
    await db
      .update(inventory)
      .set({ reservedQty: Math.max(0, row.reservedQty - r.qty), updatedAt: new Date() })
      .where(eq(inventory.id, row.id));
    await db.update(inventoryReservations).set({ status: "RELEASED" }).where(eq(inventoryReservations.id, r.id));
    await db.insert(inventoryLedger).values({
      transactionType: "RESERVATION_RELEASE",
      warehouseId: r.warehouseId,
      productId: r.productId,
      variantId: r.variantId,
      quantity: -r.qty,
      referenceType: "RESERVATION",
      referenceId: String(r.id),
      note: `Rezervasyon serbest (${reason})`,
      createdBy: "Sistem",
    });
    released++;
  }
  return { success: true, released };
}

/** Rezervasyonu satışa dönüştürür: rezerve düşer ve fiziksel stok SALE olarak azalır. */
export async function consumeReservation(referenceId: string, saleReferenceId: string, user = "Sistem") {
  const active = await db
    .select()
    .from(inventoryReservations)
    .where(and(eq(inventoryReservations.referenceId, referenceId), eq(inventoryReservations.status, "ACTIVE")));

  const consumedItems: Array<{ productId: number; variantId: number | null; qty: number; warehouseId: number }> = [];

  for (const r of active) {
    const row = await getOrCreateStockRow(r.warehouseId, r.productId, r.variantId);
    await db
      .update(inventory)
      .set({ reservedQty: Math.max(0, row.reservedQty - r.qty), updatedAt: new Date() })
      .where(eq(inventory.id, row.id));
    await db.update(inventoryReservations).set({ status: "CONSUMED" }).where(eq(inventoryReservations.id, r.id));

    await adjustInventory({
      warehouseId: r.warehouseId,
      productId: r.productId,
      variantId: r.variantId,
      quantityDelta: -r.qty,
      transactionType: "SALE",
      referenceType: "ORDER",
      referenceId: saleReferenceId,
      note: `Rezerve satış (#${r.id} → ${saleReferenceId})`,
      createdBy: user,
    });

    consumedItems.push({ productId: r.productId, variantId: r.variantId, qty: r.qty, warehouseId: r.warehouseId });
  }

  return { success: true, consumed: consumedItems.length, items: consumedItems };
}

/** Süresi dolmuş aktif rezervasyonları EXPIRED yapar ve stoku serbest bırakır. */
export async function expireReservations() {
  const expired = await db
    .select()
    .from(inventoryReservations)
    .where(and(eq(inventoryReservations.status, "ACTIVE"), sql`${inventoryReservations.expiresAt} < NOW()`));

  let count = 0;
  for (const r of expired) {
    const row = await getOrCreateStockRow(r.warehouseId, r.productId, r.variantId);
    await db
      .update(inventory)
      .set({ reservedQty: Math.max(0, row.reservedQty - r.qty), updatedAt: new Date() })
      .where(eq(inventory.id, row.id));
    await db.update(inventoryReservations).set({ status: "EXPIRED" }).where(eq(inventoryReservations.id, r.id));
    count++;
  }
  return { expired: count };
}

