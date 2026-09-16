import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, orderItems, orderReturns, orderReturnItems, orderStatusHistory, auditLogs } from "@/db/schema";
import { adjustInventory } from "@/lib/inventory-engine";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(orderReturns).orderBy(desc(orderReturns.id)).limit(50);
  const items = await db.select().from(orderReturnItems);
  return NextResponse.json({
    success: true,
    data: rows.map((r) => ({
      ...r,
      items: items.filter((i) => i.returnId === r.id),
      createdAt: new Date(r.createdAt).toISOString(),
      resolvedAt: r.resolvedAt ? new Date(r.resolvedAt).toISOString() : null,
    })),
  });
}

/**
 * İade akışı: REQUESTED → APPROVED → RECEIVED (stok geri) → REFUNDED
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    orderId?: number;
    reason?: string;
    items?: Array<{ orderItemId: number; quantity: number }>;
    returnId?: number;
    warehouseId?: number;
    restock?: boolean;
  };

  const action = body.action || "CREATE";

  try {
    if (action === "CREATE") {
      const orderId = Number(body.orderId);
      const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      if (!order) return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Sipariş bulunamadı." } }, { status: 404 });

      const allItems = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
      const requested = (body.items || []).filter((i) => Number(i.quantity) > 0);
      if (requested.length === 0) {
        return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "İade edilecek kalem seçin." } }, { status: 422 });
      }

      const returnNumber = `IAD-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
      let refundTotal = 0;
      const itemRows: Array<typeof orderReturnItems.$inferInsert> = [];

      for (const req of requested) {
        const oi = allItems.find((x) => x.id === Number(req.orderItemId));
        if (!oi) continue;
        const qty = Math.min(Number(req.quantity), oi.quantity);
        const refund = Number(oi.unitPrice) * qty;
        refundTotal += refund;
        itemRows.push({
          returnId: 0, // set after insert
          orderItemId: oi.id,
          productId: oi.productId,
          variantId: oi.variantId,
          productName: oi.productName,
          quantity: qty,
          refundAmount: refund.toFixed(2),
        });
      }

      const [{ id: __ret_id }] = await db.insert(orderReturns).values({
          returnNumber,
          orderId,
          orderNumber: order.orderNumber,
          reason: body.reason || "Müşteri iadesi",
          status: "REQUESTED",
          refundAmount: refundTotal.toFixed(2),
          restock: body.restock !== false,
          warehouseId: Number(body.warehouseId || 3),
        }).$returningId();
      const [ret] = await db.select().from(orderReturns).where(eq(orderReturns.id, __ret_id));

      for (const r of itemRows) {
        await db.insert(orderReturnItems).values({ ...r, returnId: ret.id });
      }

      // Sipariş durumunu iade talebine çek (uygunsa)
      if (order.status === "DELIVERED") {
        await db.update(orders).set({ status: "RETURN_REQUESTED" }).where(eq(orders.id, orderId));
        await db.insert(orderStatusHistory).values({
          orderId,
          fromStatus: order.status,
          toStatus: "RETURN_REQUESTED",
          note: `İade talebi ${returnNumber}`,
          changedBy: "Müşteri Hizmetleri",
        });
      }

      return NextResponse.json({ success: true, data: { ...ret, items: itemRows } });
    }

    const returnId = Number(body.returnId);
    const [ret] = await db.select().from(orderReturns).where(eq(orderReturns.id, returnId)).limit(1);
    if (!ret) return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "İade kaydı bulunamadı." } }, { status: 404 });

    if (action === "APPROVE") {
      if (ret.status !== "REQUESTED") return NextResponse.json({ success: false, error: { code: "BAD_STATE", message: "Sadece talep aşamasındaki iade onaylanabilir." } }, { status: 409 });
      await db.update(orderReturns).set({ status: "APPROVED" }).where(eq(orderReturns.id, returnId));
      const [u] = await db.select().from(orderReturns).where(eq(orderReturns.id, returnId));
      return NextResponse.json({ success: true, data: u });
    }

    if (action === "REJECT") {
      await db.update(orderReturns).set({ status: "REJECTED", resolvedAt: new Date() }).where(eq(orderReturns.id, returnId));
      const [u] = await db.select().from(orderReturns).where(eq(orderReturns.id, returnId));
      return NextResponse.json({ success: true, data: u });
    }

    if (action === "RECEIVE") {
      if (!["APPROVED", "REQUESTED"].includes(ret.status)) {
        return NextResponse.json({ success: false, error: { code: "BAD_STATE", message: "İade önce onaylanmalı." } }, { status: 409 });
      }
      const items = await db.select().from(orderReturnItems).where(eq(orderReturnItems.returnId, returnId));
      if (ret.restock) {
        for (const it of items) {
          await adjustInventory({
            warehouseId: ret.warehouseId || 3,
            productId: it.productId,
            variantId: it.variantId,
            quantityDelta: it.quantity,
            transactionType: "RETURN",
            referenceType: "RETURN",
            referenceId: ret.returnNumber,
            note: `İade girişi (${ret.returnNumber}) — ${it.productName}`,
            createdBy: "Depo Sorumlusu",
          });
        }
      }
      await db.update(orderReturns).set({ status: "RECEIVED" }).where(eq(orderReturns.id, returnId));
      const [u] = await db.select().from(orderReturns).where(eq(orderReturns.id, returnId));
      await db.update(orders).set({ status: "RETURNED" }).where(eq(orders.id, ret.orderId));
      await db.insert(orderStatusHistory).values({ orderId: ret.orderId, fromStatus: "RETURN_REQUESTED", toStatus: "RETURNED", note: `İade teslim alındı ${ret.returnNumber}`, changedBy: "Depo Sorumlusu" });
      return NextResponse.json({ success: true, data: { ...u, restocked: ret.restock } });
    }

    if (action === "REFUND") {
      if (ret.status !== "RECEIVED") return NextResponse.json({ success: false, error: { code: "BAD_STATE", message: "İade önce teslim alınmalı." } }, { status: 409 });
      await db.update(orderReturns).set({ status: "REFUNDED", resolvedAt: new Date() }).where(eq(orderReturns.id, returnId));
      const [u] = await db.select().from(orderReturns).where(eq(orderReturns.id, returnId));
      await db.update(orders).set({ status: "REFUNDED", paymentStatus: "REFUNDED" }).where(eq(orders.id, ret.orderId));
      await db.insert(orderStatusHistory).values({ orderId: ret.orderId, fromStatus: "RETURNED", toStatus: "REFUNDED", note: `İade bedeli iade edildi: ${ret.refundAmount} TL`, changedBy: "Muhasebe" });
      await db.insert(auditLogs).values({ userId: "1", userName: "Muhasebe", action: "REFUND_ISSUED", entity: "OrderReturn", entityId: String(returnId), details: `${ret.returnNumber}: ${ret.refundAmount} TL iade` });
      return NextResponse.json({ success: true, data: u });
    }

    return NextResponse.json({ success: false, error: { code: "UNKNOWN_ACTION", message: "Bilinmeyen eylem." } }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: err.message } }, { status: 500 });
  }
}
