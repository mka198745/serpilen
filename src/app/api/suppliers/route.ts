import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  suppliers,
  purchaseOrders,
  purchaseOrderItems,
  goodsReceipts,
  goodsReceiptItems,
  warehouses,
  products,
  productVariants,
  inventory,
  orderItems,
  orders,
  auditLogs,
} from "@/db/schema";
import { adjustInventory } from "@/lib/inventory-engine";
import { desc, eq } from "drizzle-orm";

import { requireStaff } from "@/lib/auth";
export const dynamic = "force-dynamic";

function enrichedPOs(allSuppliers: any[], allPOs: any[], allPOItems: any[], allProds: any[]) {
  return allPOs.map((po: any) => {
    const sup = allSuppliers.find((s: any) => s.id === po.supplierId);
    const wh = allWhCache.find((w: any) => w.id === po.warehouseId);
    const items = allPOItems
      .filter((it: any) => it.purchaseOrderId === po.id)
      .map((it: any) => {
        const pr = allProds.find((p: any) => p.id === it.productId);
        return { ...it, productName: pr?.name || "Ürün", sku: pr?.sku || "" };
      });
    const receivedTotal = items.reduce((s: number, i: any) => s + (i.receivedQty || 0), 0);
    const orderedTotal = items.reduce((s: number, i: any) => s + i.quantity, 0);
    return {
      ...po,
      supplierName: sup?.name || "Tedarikçi",
      warehouseName: wh?.name || "Depo",
      items,
      progress: orderedTotal ? Math.round((receivedTotal / orderedTotal) * 100) : 0,
    };
  });
}

let allWhCache: any[] = [];

export async function GET(request: Request) {
  const __gate = await requireStaff(request);
  if (!__gate.ok) return __gate.response;

  try {
    const { searchParams } = new URL(request.url);
    const allSuppliers = await db.select().from(suppliers).orderBy(desc(suppliers.id));
    const allPOs = await db.select().from(purchaseOrders).orderBy(desc(purchaseOrders.id));
    const allPOItems = await db.select().from(purchaseOrderItems);
    const allProds = await db.select().from(products);
    const allWh = await db.select().from(warehouses);
    allWhCache = allWh;
    const allReceipts = await db.select().from(goodsReceipts).orderBy(desc(goodsReceipts.id)).limit(20);

    // Reorder önerileri: kritik + satış hızı
    const allInv = await db.select().from(inventory);
    const allOrderItems = await db.select().from(orderItems);
    const allOrders = await db.select().from(orders);
    const since = Date.now() - 30 * 86400000;
    const recentItems = allOrderItems.filter((it) => {
      const o = allOrders.find((x) => x.id === it.orderId);
      return o && new Date(o.createdAt).getTime() >= since && o.status !== "CANCELLED";
    });

    const salesByProduct = new Map<number, number>();
    for (const it of recentItems) {
      salesByProduct.set(it.productId, (salesByProduct.get(it.productId) || 0) + it.quantity);
    }

    const suggestions = allInv
      .map((inv) => {
        const p = allProds.find((x) => x.id === inv.productId);
        if (!p) return null;
        const available = inv.physicalQty - inv.reservedQty;
        const monthlySales = salesByProduct.get(inv.productId) || 0;
        const dailySales = monthlySales / 30;
        const leadTime = allSuppliers[0]?.leadTimeDays || 5;
        const reorderPoint = Math.ceil(dailySales * leadTime) + inv.minStock;
        const suggestedQty = Math.max(0, inv.maxStock - available);
        const isCritical = available <= inv.reorderPoint || available <= reorderPoint;
        // Tedarikçi eşleşmesi: ürün adında marka/tedarikçi ipucu yoksa ilk tedarikçi
        return {
          productId: inv.productId,
          productName: p.name,
          sku: p.sku,
          warehouseId: inv.warehouseId,
          warehouseName: allWh.find((w) => w.id === inv.warehouseId)?.name || "?",
          available,
          monthlySales,
          dailySales: Number(dailySales.toFixed(2)),
          reorderPoint,
          suggestedQty,
          estimatedCost: Number((suggestedQty * Number(p.buyPrice)).toFixed(2)),
          supplierId: allSuppliers[0]?.id || null,
          supplierName: allSuppliers[0]?.name || "—",
          isCritical,
          priority: available <= 0 ? "URGENT" : available <= inv.reorderPoint ? "HIGH" : "NORMAL",
        };
      })
      .filter((s) => s && (s.isCritical || s.suggestedQty > 0))
      .slice(0, 30) as any[];

    // Tedarikçi performans: PO tamamlama oranı + ortalama termin
    const supplierPerf = allSuppliers.map((s) => {
      const pos = allPOs.filter((p) => p.supplierId === s.id);
      const received = pos.filter((p) => p.status === "RECEIVED").length;
      return {
        ...s,
        totalPOs: pos.length,
        completedPOs: received,
        completionRate: pos.length ? Math.round((received / pos.length) * 100) : 100,
      };
    });

    const enriched = enrichedPOs(allSuppliers, allPOs, allPOItems, allProds);

    return NextResponse.json({
      success: true,
      suppliers: supplierPerf,
      purchaseOrders: enriched,
      receipts: allReceipts,
      suggestions,
      suggestionCount: suggestions.filter((s) => s.isCritical).length,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const __gate = await requireStaff(request);
  if (!__gate.ok) return __gate.response;

  try {
    const body = await request.json();
    const { action } = body;
    const user = body.user || "Satın Alma";

    /* ---------- TEDARİKÇİ CRUD ---------- */
    if (action === "CREATE_SUPPLIER" || action === "UPDATE_SUPPLIER") {
      const { id, name, contactPerson, phone, email, taxOffice, taxNumber, leadTimeDays, paymentTerms, rating, address, isActive } = body;
      if (action === "CREATE_SUPPLIER") {
        if (!name?.trim()) return NextResponse.json({ success: false, error: "Firma adı zorunlu." }, { status: 422 });
        const [{ id: __created_id }] = await db.insert(suppliers).values({
            name: name.trim(),
            contactPerson: contactPerson || null,
            phone: phone || null,
            email: email || null,
            taxOffice: taxOffice || null,
            taxNumber: taxNumber || null,
            leadTimeDays: Number(leadTimeDays || 5),
            paymentTerms: paymentTerms || "30 Gün Vade",
            rating: String(rating || "4.5"),
            address: address || null,
          }).returning({ id: suppliers.id });
        const [created] = await db.select().from(suppliers).where(eq(suppliers.id, __created_id));
        return NextResponse.json({ success: true, data: created });
      }
      await db.update(suppliers).set({
          ...(name && { name: name.trim() }),
          contactPerson: contactPerson ?? undefined,
          phone: phone ?? undefined,
          email: email ?? undefined,
          leadTimeDays: leadTimeDays !== undefined ? Number(leadTimeDays) : undefined,
          paymentTerms: paymentTerms ?? undefined,
          rating: rating !== undefined ? String(rating) : undefined,
          isActive: typeof isActive === "boolean" ? isActive : undefined,
        }).where(eq(suppliers.id, Number(id)));
      const [updated] = await db.select().from(suppliers).where(eq(suppliers.id, Number(id)));
      return NextResponse.json({ success: true, data: updated });
    }

    /* ---------- DOĞRUDAN PO ---------- */
    if (action === "CREATE_PO") {
      const { supplierId, warehouseId = 1, items = [], notes = "", expectedDate } = body;
      const valid = items.filter((i: any) => Number(i.quantity) > 0);
      if (!valid.length) return NextResponse.json({ success: false, error: "Kalem ekleyin." }, { status: 422 });
      const poNumber = `SAT-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
      const totalAmount = valid.reduce((s: number, it: any) => s + Number(it.unitCost) * Number(it.quantity), 0);
      const [{ id: __newPo_id }] = await db.insert(purchaseOrders).values({ poNumber, supplierId: Number(supplierId), warehouseId: Number(warehouseId), status: "ORDERED", totalAmount: String(totalAmount), notes, expectedDate }).returning({ id: purchaseOrders.id });
      const [newPo] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, __newPo_id));
      for (const item of valid) {
        await db.insert(purchaseOrderItems).values({
          purchaseOrderId: newPo.id,
          productId: Number(item.productId),
          variantId: item.variantId ? Number(item.variantId) : null,
          quantity: Number(item.quantity),
          unitCost: String(item.unitCost),
          receivedQty: 0,
          totalCost: String(Number(item.unitCost) * Number(item.quantity)),
        });
      }
      return NextResponse.json({ success: true, data: newPo });
    }

    if (action === "CANCEL_PO") {
      const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, Number(body.purchaseOrderId))).limit(1);
      if (!po || po.status === "RECEIVED") return NextResponse.json({ success: false, error: "Bu sipariş iptal edilemez." }, { status: 409 });
      await db.update(purchaseOrders).set({ status: "CANCELLED" }).where(eq(purchaseOrders.id, po.id));
      const [u] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, po.id));
      return NextResponse.json({ success: true, data: u });
    }

    /* ---------- KISMİ MAL KABUL ---------- */
    if (action === "RECEIVE_GOODS") {
      const { purchaseOrderId, lines = [] } = body; // lines: [{purchaseOrderItemId, qty}]
      const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, Number(purchaseOrderId))).limit(1);
      if (!po) return NextResponse.json({ success: false, error: "Sipariş bulunamadı." }, { status: 404 });
      if (po.status === "CANCELLED") return NextResponse.json({ success: false, error: "İptal siparişe kabul yapılamaz." }, { status: 409 });

      const receiptNumber = `MK-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
      const [{ id: __receipt_id }] = await db.insert(goodsReceipts).values({ receiptNumber, purchaseOrderId: po.id, warehouseId: po.warehouseId, receivedBy: user, notes: body.notes || null }).returning({ id: goodsReceipts.id });
      const [receipt] = await db.select().from(goodsReceipts).where(eq(goodsReceipts.id, __receipt_id));

      let receivedAny = 0;
      if (lines.length) {
        for (const ln of lines) {
          const qty = Number(ln.qty);
          if (qty <= 0) continue;
          const [poi] = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.id, Number(ln.purchaseOrderItemId))).limit(1);
          if (!poi) continue;
          const actual = Math.min(qty, poi.quantity - poi.receivedQty);
          if (actual <= 0) continue;
          await adjustInventory({
            warehouseId: po.warehouseId,
            productId: poi.productId,
            variantId: poi.variantId,
            quantityDelta: actual,
            transactionType: "PURCHASE",
            referenceType: "PO",
            referenceId: po.poNumber,
            note: `Mal Kabul ${receiptNumber} (${po.poNumber})`,
            createdBy: user,
            unitCost: poi.unitCost,
          });
          await db.update(purchaseOrderItems).set({ receivedQty: poi.receivedQty + actual }).where(eq(purchaseOrderItems.id, poi.id));
          await db.insert(goodsReceiptItems).values({ receiptId: receipt.id, purchaseOrderItemId: poi.id, productId: poi.productId, variantId: poi.variantId, qty: actual });
          receivedAny += actual;
        }
      } else {
        // Eski davranış: kalan tüm miktar
        const items = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, po.id));
        for (const item of items) {
          const remaining = item.quantity - item.receivedQty;
          if (remaining <= 0) continue;
          await adjustInventory({
            warehouseId: po.warehouseId,
            productId: item.productId,
            variantId: item.variantId,
            quantityDelta: remaining,
            transactionType: "PURCHASE",
            referenceType: "PO",
            referenceId: po.poNumber,
            note: `Mal Kabul ${receiptNumber} (${po.poNumber})`,
            createdBy: user,
            unitCost: item.unitCost,
          });
          await db.update(purchaseOrderItems).set({ receivedQty: item.quantity }).where(eq(purchaseOrderItems.id, item.id));
          await db.insert(goodsReceiptItems).values({ receiptId: receipt.id, purchaseOrderItemId: item.id, productId: item.productId, variantId: item.variantId, qty: remaining });
          receivedAny += remaining;
        }
      }

      // PO durumunu güncelle: tamamı alındıysa RECEIVED, kısmi ise PARTIAL
      const after = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, po.id));
      const allDone = after.every((i) => i.receivedQty >= i.quantity);
      await db.update(purchaseOrders).set({ status: allDone ? "RECEIVED" : "PARTIAL" }).where(eq(purchaseOrders.id, po.id));

      return NextResponse.json({ success: true, data: { receipt, receivedQty: receivedAny, poStatus: allDone ? "RECEIVED" : "PARTIAL" } });
    }

    return NextResponse.json({ success: false, error: "Bilinmeyen eylem." }, { status: 400 });
  } catch (err: any) {
    console.error("Suppliers API error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
