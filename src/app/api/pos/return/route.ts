import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, orderItems, posShifts, orderReturns, orderReturnItems, orderStatusHistory, auditLogs } from "@/db/schema";
import { adjustInventory } from "@/lib/inventory-engine";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      orderNumber,
      items = [], // Array of { orderItemId, productId, variantId, quantity, unitPrice, productName }
      refundMethod = "CASH", // CASH, CREDIT_CARD, STORE_CREDIT
      reason = "Müşteri Mağaza İadesi",
      posShiftId,
      warehouseId = 2, // Kadıköy Mağaza
      cashierName = "Kasiyer",
    } = body;

    if (!orderNumber) {
      return NextResponse.json({ success: false, error: "Sipariş/Fiş numarası zorunludur." }, { status: 422 });
    }

    const [order] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber.trim())).limit(1);
    if (!order) {
      return NextResponse.json({ success: false, error: "Fiş/Sipariş bulunamadı." }, { status: 404 });
    }

    const allOrderItems = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));

    const validItems = items.filter((it: any) => Number(it.quantity) > 0);
    if (validItems.length === 0) {
      return NextResponse.json({ success: false, error: "İade edilecek en az 1 ürün seçiniz." }, { status: 422 });
    }

    let refundTotal = 0;
    const returnNumber = `POS-IAD-${Date.now().toString().slice(-6)}`;

    const [{ id: __ret_id }] = await db.insert(orderReturns).values({
        returnNumber,
        orderId: order.id,
        orderNumber: order.orderNumber,
        reason,
        status: "REFUNDED",
        refundAmount: "0.00",
        restock: true,
        warehouseId: Number(warehouseId),
        createdBy: cashierName,
        resolvedAt: new Date(),
      }).$returningId();
    const [ret] = await db.select().from(orderReturns).where(eq(orderReturns.id, __ret_id));

    for (const item of validItems) {
      const oi = allOrderItems.find((x) => x.id === Number(item.orderItemId) || (x.productId === item.productId && x.variantId === item.variantId));
      const unitPrice = oi ? Number(oi.unitPrice) : Number(item.unitPrice || 0);
      const qty = Number(item.quantity);
      const itemRefund = unitPrice * qty;
      refundTotal += itemRefund;

      await db.insert(orderReturnItems).values({
        returnId: ret.id,
        orderItemId: oi?.id || 0,
        productId: Number(item.productId),
        variantId: item.variantId ? Number(item.variantId) : null,
        productName: item.productName || oi?.productName || "Ürün",
        quantity: qty,
        refundAmount: String(itemRefund.toFixed(2)),
      });

      // Restore physical stock to the store warehouse
      await adjustInventory({
        warehouseId: Number(warehouseId),
        productId: Number(item.productId),
        variantId: item.variantId ? Number(item.variantId) : null,
        quantityDelta: qty,
        transactionType: "RETURN",
        referenceType: "POS_RETURN",
        referenceId: returnNumber,
        note: `Kasa İadesi: Fiş #${order.orderNumber} (${returnNumber})`,
        createdBy: cashierName,
      });
    }

    // Update return total amount
    await db.update(orderReturns).set({ refundAmount: String(refundTotal.toFixed(2)) }).where(eq(orderReturns.id, ret.id));

    // Update POS Shift if active
    if (posShiftId) {
      const [shift] = await db.select().from(posShifts).where(eq(posShifts.id, Number(posShiftId))).limit(1);
      if (shift && shift.status === "OPEN") {
        if (refundMethod === "CASH") {
          const newRetCash = Number(shift.totalReturnsCash || 0) + refundTotal;
          const newExpected = Math.max(0, Number(shift.expectedAmount || shift.openingAmount) - refundTotal);
          await db
            .update(posShifts)
            .set({
              totalReturnsCash: String(newRetCash.toFixed(2)),
              expectedAmount: String(newExpected.toFixed(2)),
            })
            .where(eq(posShifts.id, shift.id));
        } else {
          const newRetCard = Number(shift.totalReturnsCard || 0) + refundTotal;
          await db
            .update(posShifts)
            .set({ totalReturnsCard: String(newRetCard.toFixed(2)) })
            .where(eq(posShifts.id, shift.id));
        }
      }
    }

    // Audit log
    await db.insert(auditLogs).values({
      userId: "1",
      userName: cashierName,
      action: "POS_RETURN_COMPLETED",
      entity: "OrderReturn",
      entityId: String(ret.id),
      details: `${returnNumber}: ${validItems.length} kalem iade alındı. Tutar: ${refundTotal.toFixed(2)} TL (${refundMethod})`,
    });

    return NextResponse.json({
      success: true,
      message: `İade başarıyla alındı ve ürünler ${warehouseId === 2 ? "Mağaza" : "Depo"} stoğuna eklendi.`,
      data: {
        returnNumber,
        orderNumber: order.orderNumber,
        refundTotal: refundTotal.toFixed(2),
        refundMethod,
        items: validItems,
      },
    });
  } catch (error: any) {
    console.error("POS Return Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
