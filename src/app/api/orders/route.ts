import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, orderItems, orderStatusHistory, customers, loyaltyTransactions, posShifts, products } from "@/db/schema";
import { adjustInventory } from "@/lib/inventory-engine";
import { erpAdapter } from "@/lib/erp-adapter";
import { desc, eq } from "drizzle-orm";

import { requireStaff } from "@/lib/auth";
// Sipariş yaşam döngüsü — geçerli durum geçişleri
const ORDER_FLOW: Record<string, string[]> = {
  PENDING: ["PAID", "CANCELLED"],
  PAID: ["PREPARING", "CANCELLED", "REFUNDED"],
  PREPARING: ["READY_FOR_SHIPMENT", "CANCELLED"],
  READY_FOR_SHIPMENT: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: ["RETURN_REQUESTED"],
  RETURN_REQUESTED: ["RETURNED", "DELIVERED"],
  RETURNED: ["REFUNDED"],
};

export const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: "Ödeme Bekliyor",
  PAID: "Ödendi",
  PREPARING: "Hazırlanıyor",
  READY_FOR_SHIPMENT: "Sevke Hazır",
  SHIPPED: "Kargoda",
  DELIVERED: "Teslim Edildi",
  CANCELLED: "İptal Edildi",
  RETURN_REQUESTED: "İade Talebi",
  RETURNED: "İade Alındı",
  REFUNDED: "İade Ödendi",
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const orderType = searchParams.get("type"); // ONLINE_B2C, B2B, POS
    const customerId = searchParams.get("customerId");
    const orderNumber = searchParams.get("orderNumber"); // müşteri sipariş takibi
    const phone = searchParams.get("phone");

    // Toplu sipariş listesi yalnızca personele açıktır; müşteri takibi (orderNumber+phone) herkese açıktır.
    if (!orderNumber) {
      const __gate = await requireStaff(request);
      if (!__gate.ok) return __gate.response;
    }

    // Tekil sipariş takibi (müşteri): sipariş no + telefon eşleşmesi
    if (orderNumber) {
      const [ord] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber.trim())).limit(1);
      if (!ord || (phone && ord.customerPhone && ord.customerPhone.replace(/\s/g, "") !== phone.replace(/\s/g, ""))) {
        return NextResponse.json({ success: false, error: "Sipariş bulunamadı. Numara/telefon kontrol edin." }, { status: 404 });
      }
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, ord.id));
      const history = await db.select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, ord.id));
      return NextResponse.json({
        success: true,
        data: { ...ord, items, history: history.map((h) => ({ ...h, statusLabel: ORDER_STATUS_LABELS[h.toStatus] || h.toStatus })), statusLabel: ORDER_STATUS_LABELS[ord.status] || ord.status },
      });
    }

    let query = db.select().from(orders).orderBy(desc(orders.id));
    let orderList = await query;

    if (orderType) {
      orderList = orderList.filter((o) => o.orderType === orderType);
    }
    if (customerId) {
      orderList = orderList.filter((o) => o.customerId === Number(customerId));
    }

    // Attach order items
    const allItems = await db.select().from(orderItems);
    const enriched = orderList.map((ord) => {
      const items = allItems.filter((it) => it.orderId === ord.id);
      return {
        ...ord,
        items,
        statusLabel: ORDER_STATUS_LABELS[ord.status] || ord.status,
      };
    });

    return NextResponse.json({ success: true, count: enriched.length, data: enriched });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      orderType = "ONLINE_B2C", // ONLINE_B2C, B2B, POS
      customerId = null,
      customerName,
      customerEmail = null,
      customerPhone = null,
      paymentMethod = "CREDIT_CARD", // CREDIT_CARD, CASH, B2B_CREDIT, SPLIT
      items = [], // Array of { productId, variantId, productName, variantName, sku, barcode, unitPrice, quantity, taxRate, totalPrice }
      subtotal,
      discountTotal: discountTotalIn = 0,
      taxTotal,
      shippingTotal: shippingTotalIn = 0,
      grandTotal: grandTotalIn,
      shippingAddress = null,
      notes: notesIn = null,
      warehouseId = 1, // 1: Merkez, 2: Kadıköy Mağaza, 3: Online
      posShiftId = null,
      spentPoints = 0,
      couponCode = null,
      applyCampaigns = true, // sunucu tarafı kural motoru
      orderNumber: clientOrderNumberIn = null, // checkout'ta müşteriye gösterilen numara (online siparişler)
    } = body;

    const clientOrderNumber = typeof clientOrderNumberIn === "string" ? clientOrderNumberIn.trim().toUpperCase().slice(0, 40) : null;

    let discountTotal = Number(discountTotalIn) || 0;
    let shippingTotal = Number(shippingTotalIn) || 0;
    let grandTotal = Number(grandTotalIn) || 0;
    let notes = notesIn;

    if (!items || items.length === 0) {
      return NextResponse.json({ success: false, error: "Sepette ürün bulunamadı" }, { status: 400 });
    }

    // --- FAZ 9: B2B cari limit / vade / minimum sipariş kontrolü ---
    let b2bCredit: Awaited<ReturnType<typeof import("@/lib/pricing-engine").checkCredit>> | null = null;
    if (orderType === "B2B" && customerId && paymentMethod === "B2B_CREDIT") {
      const { checkCredit } = await import("@/lib/pricing-engine");
      b2bCredit = await checkCredit(Number(customerId), Number(grandTotalIn) || 0);
      if (!b2bCredit.allowed) {
        return NextResponse.json(
          { success: false, error: b2bCredit.reason, code: b2bCredit.code, credit: b2bCredit },
          { status: 409 }
        );
      }
    }

    // --- FAZ 8: Otomatik kampanya motoru (sunucu otoritesi) ---
    let promoDiscount = 0;
    let promoFreeShipping = false;
    const appliedPromoIds: number[] = [];
    if (applyCampaigns) {
      try {
        const { applyPromotions, touchPromotions } = await import("@/lib/promotion-engine");
        const allProdsForPromo = await db.select().from(products);
        const promoLines = items.map((it: any) => {
          const p = allProdsForPromo.find((x) => x.id === Number(it.productId));
          return {
            productId: Number(it.productId),
            unitPrice: Number(it.unitPrice),
            quantity: Number(it.quantity),
            categoryId: p?.categoryId ?? null,
            brandId: p?.brandId ?? null,
          };
        });
        const promo = await applyPromotions(promoLines);
        promoDiscount = promo.totalDiscount;
        promoFreeShipping = promo.freeShipping;
        appliedPromoIds.push(...promo.appliedPromotions.map((a) => a.id));
        if (promoDiscount > 0) {
          discountTotal = Number(discountTotal) + promoDiscount;
          grandTotal = Math.max(0, Number(grandTotal) - promoDiscount);
          notes = `${notes ? notes + " | " : ""}Kampanya: ${promo.appliedPromotions.map((a) => a.name).join(", ")}`;
        }
        if (promoFreeShipping && shippingTotal > 0) {
          notes = `${notes ? notes + " | " : ""}Ücretsiz kargo (kampanya)`;
          grandTotal = Math.max(0, grandTotal - shippingTotal);
          shippingTotal = 0;
        }
        if (appliedPromoIds.length) await touchPromotions(appliedPromoIds);
      } catch (promoErr) {
        console.error("Promotion engine skipped:", promoErr);
      }
    }

    // --- Kupon kullanım sayacı ---
    if (couponCode) {
      try {
        const { coupons: couponTable } = await import("@/db/schema");
        const { sql: sqlOp } = await import("drizzle-orm");
        await db.update(couponTable).set({ usedCount: sqlOp`${couponTable.usedCount} + 1` }).where(eq(couponTable.code, String(couponCode).toUpperCase().trim()));
      } catch {
        /* sayaç kritik değil */
      }
    }

    // --- Sadakat oranı ayarlardan okunur ---
    let loyaltyEarnRateTl = 100;
    let loyaltyEarnPoints = 10;
    try {
      const { getSettings } = await import("@/lib/settings");
      const settings = await getSettings();
      loyaltyEarnRateTl = Number(settings["loyalty.earn_rate_tl"] || 100);
      loyaltyEarnPoints = Number(settings["loyalty.earn_points"] || 10);
    } catch {
      /* varsayılanlar */
    }

    const generatedOrderNumber =
      orderType === "POS"
        ? `POS-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`
        : orderType === "B2B"
        ? `B2B-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`
        : `OR-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`;

    // İstemcinin gösterdiği sipariş numarası geçerli ve çakışmıyorsa AYNI NUMARA İLE kaydedilir
    let orderNumber = generatedOrderNumber;
    if (clientOrderNumber && /^[A-Z0-9-]{5,40}$/.test(clientOrderNumber)) {
      const clash = await db.select({ id: orders.id }).from(orders).where(eq(orders.orderNumber, clientOrderNumber)).limit(1);
      if (clash.length === 0) orderNumber = clientOrderNumber;
    }

    // 1. Generate e-Fatura / e-Arşiv via ERP Adapter
    const erpInvoice = await erpAdapter.createInvoice({
      orderNumber,
      customerName: customerName || "Perakende Müşteri",
      taxNumber: null,
      total: Number(grandTotal),
      tax: Number(taxTotal || (Number(grandTotal) * 0.2).toFixed(2)),
      items: items.map((it: any) => ({
        name: it.productName,
        quantity: it.quantity,
        price: it.unitPrice,
        total: it.totalPrice,
      })),
    });

    // 2. Insert Order
    const [{ id: __newOrder_id }] = await db.insert(orders).values({
        orderNumber,
        orderType,
        customerId: customerId ? Number(customerId) : null,
        customerName: customerName || (orderType === "POS" ? "Mağaza Kasa Müşterisi" : "Misafir Müşteri"),
        customerEmail,
        customerPhone,
        status: orderType === "POS" ? "DELIVERED" : "PAID",
        paymentStatus: "PAID",
        paymentMethod,
        subtotal: String(subtotal),
        discountTotal: String(discountTotal),
        taxTotal: String(taxTotal),
        shippingTotal: String(shippingTotal),
        grandTotal: String(grandTotal),
        shippingAddress,
        trackingNumber: orderType === "ONLINE_B2C" ? `YK-${Date.now().toString().slice(-8)}` : null,
        carrier: orderType === "ONLINE_B2C" ? "Yurtiçi Kargo" : null,
        posShiftId: posShiftId ? Number(posShiftId) : null,
        erpInvoiceNumber: erpInvoice.invoiceNumber,
        notes,
      }).returning({ id: orders.id });
    const [newOrder] = await db.select().from(orders).where(eq(orders.id, __newOrder_id));

    // 3. Insert Order Items & Deduct Inventory in Stock Ledger
    for (const item of items) {
      await db.insert(orderItems).values({
        orderId: newOrder.id,
        productId: Number(item.productId),
        variantId: item.variantId ? Number(item.variantId) : null,
        productName: item.productName,
        variantName: item.variantName || null,
        sku: item.sku || `SKU-${item.productId}`,
        barcode: item.barcode || null,
        unitPrice: String(item.unitPrice),
        quantity: Number(item.quantity),
        taxRate: Number(item.taxRate || 20),
        totalPrice: String(item.totalPrice),
      });

      // Deduct stock from the specified warehouse using our central inventory engine
      await adjustInventory({
        warehouseId: Number(warehouseId),
        productId: Number(item.productId),
        variantId: item.variantId ? Number(item.variantId) : null,
        quantityDelta: -Number(item.quantity),
        transactionType: "SALE",
        referenceType: orderType === "POS" ? "POS_SALE" : "ORDER",
        referenceId: orderNumber,
        note: `${orderType} Satışı (${orderNumber})`,
        createdBy: orderType === "POS" ? "Kasiyer" : "Online Müşteri",
      });
    }

    // 4. If POS Shift is active, update shift totals
    if (orderType === "POS" && posShiftId) {
      const shift = (await db.select().from(posShifts).where(eq(posShifts.id, Number(posShiftId))).limit(1))[0];
      if (shift) {
        if (paymentMethod === "CASH") {
          const newCash = (Number(shift.totalSalesCash || 0) + Number(grandTotal)).toFixed(2);
          const newExpected = (Number(shift.openingAmount) + Number(newCash)).toFixed(2);
          await db.update(posShifts).set({ totalSalesCash: newCash, expectedAmount: newExpected }).where(eq(posShifts.id, shift.id));
        } else {
          const newCard = (Number(shift.totalSalesCard || 0) + Number(grandTotal)).toFixed(2);
          await db.update(posShifts).set({ totalSalesCard: newCard }).where(eq(posShifts.id, shift.id));
        }
      }
    }

    // 5. Loyalty Points processing — oran admin ayarlarından gelir
    if (customerId) {
      const earnedPoints = Math.floor((Number(grandTotal) / (loyaltyEarnRateTl || 100)) * (loyaltyEarnPoints || 10));
      const cust = (await db.select().from(customers).where(eq(customers.id, Number(customerId))).limit(1))[0];
      if (cust) {
        let newBalance = cust.loyaltyPoints + earnedPoints;
        if (spentPoints > 0) {
          newBalance = Math.max(0, newBalance - spentPoints);
          await db.insert(loyaltyTransactions).values({
            customerId: cust.id,
            points: -spentPoints,
            type: "SPEND",
            description: `Sipariş #${orderNumber} puan kullanımı`,
            orderId: newOrder.id,
          });
        }
        await db.insert(loyaltyTransactions).values({
          customerId: cust.id,
          points: earnedPoints,
          type: "EARN",
          description: `Sipariş #${orderNumber} alışverişinden kazanılan puan`,
          orderId: newOrder.id,
        });
        await db.update(customers).set({ loyaltyPoints: newBalance }).where(eq(customers.id, cust.id));
      }
    }

    // 5.5 FAZ 9: B2B cari hesap borç kaydı + vade
    if (orderType === "B2B" && customerId && b2bCredit) {
      const { accountTransactions } = await import("@/db/schema");
      const dueDate = new Date(Date.now() + (b2bCredit.paymentTermDays || 30) * 86400000);
      await db.update(customers).set({ balance: String(b2bCredit.newBalance) }).where(eq(customers.id, Number(customerId)));
      await db.insert(accountTransactions).values({
        customerId: Number(customerId),
        type: "DEBIT",
        amount: String(Number(grandTotal).toFixed(2)),
        balanceAfter: String(b2bCredit.newBalance),
        referenceType: "ORDER",
        referenceId: orderNumber,
        description: `Toptan satış · ${orderNumber} (${b2bCredit.paymentTermDays} gün vade)`,
        dueDate,
        createdBy: "B2B Portal",
      });
    }

    // 6. Durum geçmişi (audit trail)
    await db.insert(orderStatusHistory).values({
      orderId: newOrder.id,
      fromStatus: null,
      toStatus: newOrder.status,
      note: `Sipariş oluşturuldu (${orderType}) · Fatura ${erpInvoice.invoiceNumber}`,
      changedBy: orderType === "POS" ? "Kasiyer" : "Online Müşteri",
    });

    return NextResponse.json({
      success: true,
      message: "Sipariş ve fatura başarıyla oluşturuldu.",
      data: {
        order: newOrder,
        invoice: erpInvoice,
      },
    });
  } catch (error: any) {
    console.error("Order creation error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/** PATCH /api/orders — durum ilerletme, kargo bilgisi, iptal. */
export async function PATCH(request: Request) {
  const __gate = await requireStaff(request);
  if (!__gate.ok) return __gate.response;

  try {
    const body = await request.json();
    const id = Number(body.id);
    if (!id) {
      return NextResponse.json({ success: false, error: "Sipariş ID zorunludur." }, { status: 422 });
    }

    const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!order) {
      return NextResponse.json({ success: false, error: "Sipariş bulunamadı." }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    const changedBy = String(body.changedBy || "Sipariş Yönetimi");

    // Kargo alanlarını normalize et (trim + uzunluk sınırı, boş string = "yok say")
    const cleanCarrier =
      typeof body.carrier === "string" && body.carrier.trim() !== "" ? body.carrier.trim().slice(0, 80) : undefined;
    const cleanTracking =
      typeof body.trackingNumber === "string" && body.trackingNumber.trim() !== "" ? body.trackingNumber.trim().slice(0, 80) : undefined;

    // Durum geçişi
    if (body.status && body.status !== order.status) {
      const allowed = ORDER_FLOW[order.status] || [];
      if (!allowed.includes(body.status)) {
        return NextResponse.json(
          { success: false, error: `Geçersiz durum geçişi: ${order.status} → ${body.status}` },
          { status: 409 }
        );
      }
      updates.status = body.status;

      // Kargoya verilirken: admin'in girdiği firma/takip no önceliklidir;
      // takip no yoksa otomatik üret.
      if (body.status === "SHIPPED") {
        const effectiveTracking = cleanTracking || order.trackingNumber;
        if (!effectiveTracking) updates.trackingNumber = `YK-${Date.now().toString().slice(-8)}`;
        if (cleanCarrier) updates.carrier = cleanCarrier;
        else if (!order.carrier) updates.carrier = "Yurtiçi Kargo";
      }
      if (body.status === "CANCELLED") updates.paymentStatus = "REFUNDED";
      if (body.status === "REFUNDED") updates.paymentStatus = "REFUNDED";
    }

    // Kargo bilgisi güncelleme (yalnız dolu değerler; asla boşla üzerine yazma)
    if (cleanTracking) updates.trackingNumber = cleanTracking;
    if (cleanCarrier) updates.carrier = cleanCarrier;
    if (body.notes !== undefined) updates.notes = body.notes;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: "Güncellenecek alan yok." }, { status: 422 });
    }

    await db.update(orders).set(updates).where(eq(orders.id, id));
    const [updated] = await db.select().from(orders).where(eq(orders.id, id));

    if (updates.status) {
      let historyNote = typeof body.note === "string" && body.note.trim() !== "" ? body.note.trim() : undefined;
      if (!historyNote && updates.status === "SHIPPED") {
        const c = (updates.carrier as string) || cleanCarrier || order.carrier || "";
        const t = (updates.trackingNumber as string) || cleanTracking || order.trackingNumber || "";
        historyNote = `Kargoya verildi${c ? ` — ${c}` : ""}${t ? ` · Takip: ${t}` : ""}`;
      }
      if (!historyNote) historyNote = `Durum güncellendi: ${ORDER_STATUS_LABELS[String(updates.status)] || updates.status}`;
      await db.insert(orderStatusHistory).values({
        orderId: id,
        fromStatus: order.status,
        toStatus: String(updates.status),
        note: historyNote,
        changedBy,
      });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
