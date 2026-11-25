import { NextResponse } from "next/server";
import { hasPosGrant, posLocked } from "@/lib/pos-screen-access";
import { createHash, randomUUID } from "node:crypto";
import { db, sqlite } from "@/db";
import { orders, orderItems, orderStatusHistory, customers, loyaltyTransactions, posShifts, promotions, coupons } from "@/db/schema";
import { adjustInventorySync, reservePaymentStock, finishPaymentHolds, StockShortage } from "@/lib/inventory-engine";
import { posQuote } from "@/lib/pos-quote";
import { applyPromotionsSync } from "@/lib/promotion-engine";
import { claimOrderDiscounts, releaseOrderDiscounts } from "@/lib/order-discounts";
import { processOrderQueueSync, processOrderQueue, hasEarlierStockWait, stockAvailableFor } from "@/lib/order-queue";
import { getSettingsSync } from "@/lib/settings";
import { getSiteSettingsSync } from "@/lib/site-settings";
import { parseCartSettings, parseCheckoutSettings, shippingCostFor, validTurkishIban } from "@/lib/site-settings-shared";
import { desc, eq, sql } from "drizzle-orm";

import { requireStaff, publicBaseUrl, getUserByToken } from "@/lib/auth";
import { readRoleMatrix, roleCanAccessModule } from "@/lib/role-matrix-server";
import { readCrmJson } from "@/lib/crm-write";
import { normalizeOrderNumber } from "@/lib/order-number";
import { claimOnlineOrderNumber } from "@/lib/order-number-server";
function isPositiveId(value: unknown): boolean {
  if (typeof value !== "number" && (typeof value !== "string" || !/^\d+$/.test(value))) return false;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0;
}

function paymentDeadline(id: number): string | null {
  const row = sqlite.prepare("SELECT MIN(expires_at) AS expires_at FROM inventory_reservations WHERE reference_type='PAYMENT_HOLD' AND status='ACTIVE' AND reference_id=?").get(String(id)) as {expires_at:number|null};
  return row.expires_at === null ? null : new Date(row.expires_at * 1000).toISOString();
}

class OrderProductUnavailable extends Error {
  constructor() { super("Sepetteki ürün veya varyant artık mevcut değil. Lütfen sepeti yenileyin."); }
}

// Sipariş yaşam döngüsü — geçerli durum geçişleri
const ORDER_FLOW: Record<string, string[]> = {
  BACKORDER: ["CANCELLED"],
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
  BACKORDER: "Stok Bekliyor",
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
    processOrderQueue();
    const { searchParams } = new URL(request.url);
    const orderType = searchParams.get("type"); // ONLINE_B2C, POS
    const customerId = searchParams.get("customerId");
    const orderNumber = searchParams.get("orderNumber"); // müşteri sipariş takibi
    const phone = searchParams.get("phone");

    // Toplu liste yalnız sipariş modülüne yetkili personele açıktır.
    const staff = await requireStaff(request);
    const matrix = staff.ok ? await readRoleMatrix() : null;
    const canOrders = staff.ok && !!matrix && roleCanAccessModule(matrix, staff.user.role, "orders");
    const canPos = staff.ok && !!matrix && roleCanAccessModule(matrix, staff.user.role, "pos");
    if (!orderNumber) {
      if (!staff.ok) return staff.response;
      if (!canOrders) return NextResponse.json({ success: false, error: "Sipariş erişim yetkiniz bulunmuyor." }, { status: 403 });
    }

    // Tekil sipariş takibi (müşteri): sipariş no + telefon eşleşmesi
    if (orderNumber) {
      const raw = orderNumber.trim();
      const [exact] = await db.select().from(orders).where(eq(orders.orderNumber, raw)).limit(1);
      let ord = exact;
      if (!ord) {
        // Türkçe İ veya Latin I ile yazılmış yeni numaraları aynı kayda yönlendir.
        const normalized = normalizeOrderNumber(raw);
        if (/^SIP\d{8,}$/.test(normalized)) {
          [ord] = await db.select().from(orders).where(eq(orders.orderNumber, `SİP${normalized.slice(3)}`)).limit(1);
        }
      }
      if (!ord) {
        return NextResponse.json({ success: false, error: "Sipariş bulunamadı. Numara/telefon kontrol edin." }, { status: 404 });
      }
      const phoneDigits = phone?.replace(/\D/g, "") || "";
      const phoneMatches = phoneDigits.length >= 7 && !!ord.customerPhone &&
        ord.customerPhone.replace(/\D/g, "") === phoneDigits;
      const posOnly = !canOrders && canPos;
      if(posOnly && staff.ok && !await hasPosGrant(request,staff.user.id)) return posLocked();
      if (!canOrders && !posOnly && phone && !phoneMatches) {
        return NextResponse.json({ success: false, error: "Sipariş bulunamadı. Numara/telefon kontrol edin." }, { status: 404 });
      }
      if (!canOrders && !posOnly && !phoneMatches) {
        // Sıralı numaralar tahmin edilebilir: telefon doğrulanmadan kişisel bilgiler gösterilmez.
        return NextResponse.json({ success: true, data: {
          orderNumber: ord.orderNumber, status: ord.status,
          statusLabel: ORDER_STATUS_LABELS[ord.status] || ord.status,
          detailsRestricted: true, paymentDeadline: ord.status === "PENDING" ? paymentDeadline(ord.id) : null,
        } }, { headers: { "Cache-Control": "private, no-store" } });
      }
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, ord.id));
      if (posOnly) {
        // POS iade araması için gerekli alanlarla sınırlı; adres, telefon, e-posta,
        // serbest notlar ve durum geçmişi verilmez. Online iadeler de desteklenir.
        return NextResponse.json({ success: true, data: {
          orderNumber: ord.orderNumber, customerName: ord.customerName, grandTotal: ord.grandTotal, createdAt: ord.createdAt,
          items: items.map(({ id, productId, variantId, productName, quantity, unitPrice }) => ({ id, productId, variantId, productName, quantity, unitPrice })),
        } }, { headers: { "Cache-Control": "private, no-store" } });
      }
      const history = await db.select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, ord.id));
      return NextResponse.json({
        success: true,
        data: { ...ord, paymentDeadline: ord.status === "PENDING" ? paymentDeadline(ord.id) : null, items, history: history.map((h) => ({ ...h, statusLabel: ORDER_STATUS_LABELS[h.toStatus] || h.toStatus })), statusLabel: ORDER_STATUS_LABELS[ord.status] || ord.status },
      }, { headers: { "Cache-Control": "private, no-store" } });
    }

    const query = db.select().from(orders).orderBy(desc(orders.id));
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
        paymentDeadline: ord.status === "PENDING" ? paymentDeadline(ord.id) : null,
        items,
        statusLabel: ORDER_STATUS_LABELS[ord.status] || ord.status,
      };
    });

    return NextResponse.json({ success: true, count: enriched.length, data: enriched }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      orderType = "ONLINE_B2C", // ONLINE_B2C, POS
      customerId = null,
      customerName,
      customerEmail = null,
      customerPhone = null,
      paymentMethod = "CREDIT_CARD", // CREDIT_CARD, CASH, SPLIT
      items = [], // Array of { productId, variantId, productName, variantName, sku, barcode, unitPrice, quantity, taxRate, totalPrice }
      subtotal,
      discountTotal: discountTotalIn = 0,
      taxTotal,
      shippingTotal: shippingTotalIn = 0,
      grandTotal: grandTotalIn,
      shippingAddress = null,
      notes: notesIn = null,
      warehouseId = orderType === "POS" ? 2 : 3, // POS ve online siparişin kendi deposu
      posShiftId = null,
      spentPoints = 0,
      couponCode = null,
      orderNumber: clientOrderNumberIn = null,
      orderNumberToken = null,
      posRequestKey = null,
      splitCash = null,
      splitCard = null,
    } = body;
    let posActorId: number | null = null;
    const requestHash = createHash("sha256").update(JSON.stringify(body)).digest("hex");

    const clientOrderNumber = typeof clientOrderNumberIn === "string" ? clientOrderNumberIn.trim().slice(0, 40) : null;

    let discountTotal = Number(discountTotalIn) || 0;
    let shippingTotal = Number(shippingTotalIn) || 0;
    let grandTotal = Number(grandTotalIn) || 0;
    let notes = notesIn;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, error: "Sepette ürün bulunamadı" }, { status: 400 });
    }

    // B2B satış kanalı sistemden kaldırıldı — eski istemcilerin kanal spoof etmesi engellenir.
    if (orderType === "B2B" || paymentMethod === "B2B_CREDIT") {
      return NextResponse.json(
        { success: false, error: "B2B satış kanalı sistemden kaldırıldı." },
        { status: 422 }
      );
    }

    if (orderType !== "POS" && orderType !== "ONLINE_B2C") return NextResponse.json({ success:false,error:"Geçersiz satış kanalı." },{status:422});
    if (orderType === "POS") {
      const gate = await requireStaff(request);
      if (!gate.ok) return gate.response;
      posActorId = gate.user.id;
      if (!roleCanAccessModule(await readRoleMatrix(), gate.user.role, "pos")) return NextResponse.json({success:false,error:"POS satış yetkiniz bulunmuyor."},{status:403});
      const origin = request.headers.get("origin");
      if ((origin && origin !== publicBaseUrl(request)) || request.headers.get("sec-fetch-site") === "cross-site") return NextResponse.json({success:false,error:"İstek kaynağı doğrulanamadı."},{status:403});
      if (!origin) {
        const auth = request.headers.get("authorization") || "";
        const actor = auth.startsWith("Bearer ") ? await getUserByToken(auth.slice(7).trim()) : null;
        if (!actor || actor.id !== gate.user.id) return NextResponse.json({success:false,error:"İstek kaynağı doğrulanamadı."},{status:403});
      }
      if (!["CASH","CREDIT_CARD","SPLIT"].includes(paymentMethod)) return NextResponse.json({success:false,error:"Geçersiz POS ödeme yöntemi."},{status:422});
      if (typeof posRequestKey !== "string" || !/^[a-f0-9-]{36}$/i.test(posRequestKey)) return NextResponse.json({success:false,error:"Geçerli POS işlem anahtarı gerekli."},{status:422});
      if (!isPositiveId(posShiftId)) return NextResponse.json({success:false,error:"Açık POS vardiyası gerekli."},{status:422});
      // Legacy POS calls may only replay a sale already committed before this workflow.
      // New sales MUST acquire a server-side intent before any physical payment.
      const prior=sqlite.prepare("SELECT request_hash,actor_id,order_id FROM pos_sale_requests WHERE request_key=?").get(posRequestKey) as {request_hash:string;actor_id:number;order_id:number}|undefined;
      if(prior && prior.request_hash===requestHash && prior.actor_id===posActorId) {
        const order=db.select().from(orders).where(eq(orders.id,prior.order_id)).get();
        if(order)return NextResponse.json({success:true,data:{order,documentNumber:order.orderNumber}});
      }
      return NextResponse.json({success:false,error:"POS satışı önce güvenli hazırlık üzerinden başlatılmalıdır; tahsilat yapmayın."},{status:409});
    } else {
      if (paymentMethod !== "EFT_HAVALE") return NextResponse.json({success:false,error:"Online kart ödemesi henüz kullanılamıyor; havale/EFT seçiniz."},{status:409});
      if (customerId || Number(spentPoints)) return NextResponse.json({success:false,error:"Online siparişte müşteri puanı kullanımı desteklenmiyor."},{status:422});
      if (Number(warehouseId) !== 3) return NextResponse.json({success:false,error:"Geçersiz online depo."},{status:422});
    }
    if (items.length > 100 || items.some((item:any) => !item || !isPositiveId(item.quantity) || Number(item.quantity) > 10000)) return NextResponse.json({success:false,error:"Geçersiz ürün miktarı."},{status:422});

    // All database effects of creating an order share one SQLite write transaction.
    // Never await inside this callback: better-sqlite3 transactions are synchronous.
    const newOrder = sqlite.transaction(() => {
      if (orderType === "POS") {
        const prior=sqlite.prepare("SELECT request_hash,actor_id,order_id FROM pos_sale_requests WHERE request_key=?").get(posRequestKey) as {request_hash:string;actor_id:number;order_id:number}|undefined;
        if (prior) {
          if (prior.request_hash!==requestHash || prior.actor_id!==posActorId) throw new StockShortage("Bu POS işlem anahtarı farklı bir satışa ait.");
          const order=db.select().from(orders).where(eq(orders.id,prior.order_id)).get();
          if(!order) throw new StockShortage("POS işlem kaydı tutarsız; yetkiliye başvurun.");
          return order;
        }
      }
      processOrderQueueSync();
      if (orderType === "POS") {
        const points = Number(spentPoints);
        if (!Number.isSafeInteger(points) || points < 0 || (points > 0 && !customerId)) throw new StockShortage("Geçersiz puan kullanımı.");
        if (customerId) {
          const customer = sqlite.prepare("SELECT loyalty_points FROM customers WHERE id=?").get(Number(customerId)) as {loyalty_points:number}|undefined;
          if (!customer || points > Math.max(0,customer.loyalty_points)) throw new StockShortage("Müşteri veya puan bakiyesi geçersiz.");
        }
        if (posShiftId) {
          const shift = sqlite.prepare("SELECT status,warehouse_id FROM pos_shifts WHERE id=?").get(Number(posShiftId)) as {status:string;warehouse_id:number}|undefined;
          if (!shift || shift.status !== "OPEN" || shift.warehouse_id !== Number(warehouseId)) throw new StockShortage("Açık ve ilgili depoya ait POS vardiyası gerekli.");
        }
      }
      const productExists = sqlite.prepare("SELECT category_id, brand_id, retail_price, is_active, name, sku, barcode FROM products WHERE id=?");
      const productDetails = new Map<number, { category_id: number | null; brand_id: number | null; retail_price:number|string; is_active:number; name:string; sku:string; barcode:string|null }>();
      const variantExists = sqlite.prepare("SELECT retail_price,is_active,sku,barcode,color_name,size,length FROM product_variants WHERE id=? AND product_id=?");
      for (const item of items) {
        if (!item || typeof item !== "object" || Array.isArray(item)) throw new OrderProductUnavailable();
        const productId = Number(item.productId);
        if (!isPositiveId(item.productId)) throw new OrderProductUnavailable();
        const product = productExists.get(productId) as { category_id: number | null; brand_id: number | null; retail_price:number|string; is_active:number; name:string; sku:string; barcode:string|null } | undefined;
        if (!product || (orderType === "ONLINE_B2C" && !product.is_active)) throw new OrderProductUnavailable();
        productDetails.set(productId, product);
        if (item.variantId !== null && item.variantId !== undefined && item.variantId !== "") {
          const variantId = Number(item.variantId);
          const variant = isPositiveId(item.variantId) ? variantExists.get(variantId, productId) as {retail_price:number|string; is_active:number; sku:string; barcode:string|null; color_name:string|null; size:string|null; length:string|null}|undefined : undefined;
          if (!variant || (orderType === "ONLINE_B2C" && !variant.is_active)) throw new OrderProductUnavailable();
          if (orderType === "ONLINE_B2C" && Math.round(Number(item.unitPrice)*100) !== Math.round(Number(variant.retail_price)*100)) throw new OrderProductUnavailable();
          if (orderType === "ONLINE_B2C") { item.unitPrice=Number(variant.retail_price); item.sku=variant.sku; item.barcode=variant.barcode; item.variantName=[variant.color_name,variant.size,variant.length].filter(Boolean).join(" · "); }
        } else if (orderType === "ONLINE_B2C") {
          if (Math.round(Number(item.unitPrice)*100) !== Math.round(Number(product.retail_price)*100)) throw new OrderProductUnavailable();
          item.unitPrice=Number(product.retail_price); item.sku=product.sku; item.barcode=product.barcode; item.variantName=null;
        }
        if (orderType === "ONLINE_B2C") item.productName=product.name;
      }
      let orderSubtotal = Number(subtotal), orderTaxTotal = Number(taxTotal);
      let claimedCouponId: number | null = null;
      if (orderType === "ONLINE_B2C") {
        const site = getSiteSettingsSync(), cart = parseCartSettings(site), checkout = parseCheckoutSettings(site);
        if (!cart.enabled || !checkout.paymentEftEnabled || !checkout.eftAccountName || !validTurkishIban(checkout.eftIban)) throw new StockShortage("Havale/EFT şu anda kullanılamıyor. Lütfen mağazayla iletişime geçin.");
        orderSubtotal = Math.round(items.reduce((sum:number,it:any) => sum + Number(it.unitPrice)*Number(it.quantity),0)*100)/100;
        orderTaxTotal = Math.round(orderSubtotal * 20)/100;
        shippingTotal = shippingCostFor(orderSubtotal,cart);
        discountTotal = 0;
        if (couponCode) {
          const coupon = db.select().from(coupons).where(eq(coupons.code,String(couponCode).toUpperCase().trim())).get();
          if (!coupon || !coupon.isActive || Number(coupon.usedCount || 0) >= Number(coupon.usageLimit || 0) || orderSubtotal < Number(coupon.minCartAmount || 0)) throw new StockShortage("Kupon geçersiz veya kullanım sınırına ulaştı.");
          claimedCouponId = coupon.id;
          discountTotal = coupon.discountType === "PERCENT" ? orderSubtotal * Number(coupon.discountValue)/100 : Number(coupon.discountValue);
          if (coupon.maxDiscount && discountTotal > Number(coupon.maxDiscount)) discountTotal = Number(coupon.maxDiscount);
          discountTotal = Math.min(orderSubtotal,Math.round(discountTotal*100)/100);
        }
        grandTotal = Math.max(0,orderSubtotal-discountTotal+shippingTotal);
      }
      const appliedPromoIds: number[] = [];
      if (orderType === "POS") {
        const quote=posQuote(items,discountTotalIn,true,couponCode,spentPoints,customerId);
        if (!Number.isFinite(Number(grandTotalIn)) || Math.round(Number(grandTotalIn)*100)!==Math.round(quote.grandTotal*100)) throw new StockShortage("Fiyat veya kampanya değişti; tahsilat öncesi sepeti yeniden hesaplayın.");
        orderSubtotal=quote.subtotal; discountTotal=quote.manualDiscount+quote.promotionDiscount+quote.couponDiscount+quote.pointsDiscount; grandTotal=quote.grandTotal; shippingTotal=0;orderTaxTotal=Math.round(grandTotal*20)/100;
        appliedPromoIds.push(...quote.promotions.map(p=>p.id));
        if(quote.promotions.length) notes=`${notes?notes+" | ":""}Kampanya: ${quote.promotions.map(p=>p.name).join(", ")}`;
        items.forEach((item:any,i:number)=>{item.unitPrice=quote.lines[i].unitPrice;item.totalPrice=quote.lines[i].unitPrice*quote.lines[i].quantity;});
      }
      if (orderType === "ONLINE_B2C") {
        const promo = applyPromotionsSync(items.map((it: any) => {
          const p = productDetails.get(Number(it.productId));
          return { productId: Number(it.productId), unitPrice: Number(it.unitPrice), quantity: Number(it.quantity), categoryId: p?.category_id ?? null, brandId: p?.brand_id ?? null };
        }));
        appliedPromoIds.push(...promo.appliedPromotions.map((a) => a.id));
        if (promo.totalDiscount > 0) {
          discountTotal += promo.totalDiscount;
          grandTotal = Math.max(0, grandTotal - promo.totalDiscount);
          notes = `${notes ? notes + " | " : ""}Kampanya: ${promo.appliedPromotions.map((a) => a.name).join(", ")}`;
        }
        if (promo.freeShipping && shippingTotal > 0) {
          notes = `${notes ? notes + " | " : ""}Ücretsiz kargo (kampanya)`;
          grandTotal = Math.max(0, grandTotal - shippingTotal);
          shippingTotal = 0;
        }
      }
      if (orderType === "ONLINE_B2C" && (!Number.isFinite(Number(grandTotalIn)) || Math.round(Number(grandTotalIn)*100) !== Math.round(grandTotal*100))) throw new StockShortage("Sepet toplamı değişti. Lütfen sepeti yenileyip tekrar kontrol edin.");
      const settings = getSettingsSync();
      const loyaltyEarnRateTl = Number(settings["loyalty.earn_rate_tl"] || 100);
      const loyaltyEarnPoints = Number(settings["loyalty.earn_points"] || 10);
      const needsStock = orderType === "ONLINE_B2C" && (hasEarlierStockWait(items) || !stockAvailableFor(items));
      if(needsStock && (typeof customerEmail !== "string" || customerEmail.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail) || /[\r\n]/.test(customerEmail))) throw new StockShortage("Stok bekleyen sipariş için geçerli e-posta adresi gereklidir.");
      const orderNumber = orderType === "POS"
        ? `POS-${new Date().getFullYear()}-${randomUUID().slice(0,12).toUpperCase()}`
        : claimOnlineOrderNumber(typeof orderNumberToken === "string" ? orderNumberToken : undefined, clientOrderNumber || undefined);
      const [{ id: __newOrder_id }] = db.insert(orders).values({
        orderNumber,
        orderType,
        customerId: customerId ? Number(customerId) : null,
        customerName: customerName || (orderType === "POS" ? "Mağaza Kasa Müşterisi" : "Misafir Müşteri"),
        customerEmail,
        customerPhone,
        status: orderType === "POS" ? "DELIVERED" : needsStock ? "BACKORDER" : "PENDING",
        paymentStatus: orderType === "POS" ? "PAID" : "PENDING",
        paymentMethod,
        subtotal: String(orderSubtotal),
        discountTotal: String(discountTotal),
        taxTotal: String(orderTaxTotal),
        shippingTotal: String(shippingTotal),
        grandTotal: String(grandTotal),
        shippingAddress,
        trackingNumber: null,
        carrier: null,
        posShiftId: posShiftId ? Number(posShiftId) : null,
        notes,
      }).returning({ id: orders.id }).all();
      if (orderType === "POS") {
        sqlite.prepare("INSERT INTO pos_sale_requests(request_key,request_hash,actor_id,order_id) VALUES(?,?,?,?)").run(posRequestKey,requestHash,posActorId,__newOrder_id);
      }
      for (const item of items) {
        db.insert(orderItems).values({
          orderId: __newOrder_id,
          productId: Number(item.productId),
          variantId: item.variantId ? Number(item.variantId) : null,
          productName: item.productName,
          variantName: item.variantName || null,
          sku: item.sku || `SKU-${item.productId}`,
          barcode: item.barcode || null,
          unitPrice: String(item.unitPrice),
          quantity: Number(item.quantity),
          taxRate: Number(item.taxRate || 20),
          totalPrice: String(orderType === "ONLINE_B2C" ? Number(item.unitPrice)*Number(item.quantity) : item.totalPrice),
        }).run();
      }
      for (const id of new Set(appliedPromoIds)) {
        db.update(promotions).set({ usedCount: sql`${promotions.usedCount} + 1` }).where(eq(promotions.id, id)).run();
      }
      if (couponCode) {
        db.update(coupons).set({ usedCount: sql`${coupons.usedCount} + 1` }).where(eq(coupons.code, String(couponCode).toUpperCase().trim())).run();
      }

      if (orderType === "ONLINE_B2C") claimOrderDiscounts(__newOrder_id,claimedCouponId,appliedPromoIds);
      for (const item of items) {
        if (orderType === "ONLINE_B2C") {
          if (needsStock) continue;
          reservePaymentStock({warehouseId:Number(warehouseId), productId:Number(item.productId), variantId:item.variantId ? Number(item.variantId) : null, qty:Number(item.quantity), referenceId:String(__newOrder_id), createdBy:"Online Müşteri"});
          continue;
        }
        adjustInventorySync({
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

      if (orderType === "POS" && posShiftId) {
        const totalCents=Math.round(grandTotal*100);
        const cash=paymentMethod==='CASH' ? totalCents : paymentMethod==='SPLIT' ? Math.round(Number(splitCash)*100) : 0;
        const card=paymentMethod==='CREDIT_CARD' ? totalCents : paymentMethod==='SPLIT' ? Math.round(Number(splitCard)*100) : 0;
        if (!Number.isSafeInteger(totalCents) || totalCents<0 || !Number.isSafeInteger(cash) || !Number.isSafeInteger(card) || cash<0 || card<0 || cash+card!==totalCents || (paymentMethod==='SPLIT' && (!cash || !card))) throw new StockShortage("Nakit ve kart tutarları sipariş toplamıyla eşleşmiyor.");
        sqlite.prepare("INSERT INTO pos_sale_payments(order_id,cash_amount,card_amount) VALUES(?,?,?)").run(__newOrder_id,cash,card);
        const shift=db.select().from(posShifts).where(eq(posShifts.id,Number(posShiftId))).get()!;
        db.update(posShifts).set({
          totalSalesCash:(Number(shift.totalSalesCash||0)+cash/100).toFixed(2),
          totalSalesCard:(Number(shift.totalSalesCard||0)+card/100).toFixed(2),
          totalSalesSplit:(Number(shift.totalSalesSplit||0)+(paymentMethod==='SPLIT'?totalCents/100:0)).toFixed(2),
          expectedAmount:(Number(shift.expectedAmount??shift.openingAmount)+cash/100).toFixed(2),
        }).where(eq(posShifts.id,shift.id)).run();
      }

      if (customerId) {
        const earnedPoints = Math.floor((Number(grandTotal) / (loyaltyEarnRateTl || 100)) * (loyaltyEarnPoints || 10));
        const cust = db.select().from(customers).where(eq(customers.id, Number(customerId))).get();
        if (cust) {
          let newBalance = cust.loyaltyPoints + earnedPoints;
          if (spentPoints > 0) {
            newBalance = Math.max(0, newBalance - spentPoints);
            db.insert(loyaltyTransactions).values({ customerId: cust.id, points: -spentPoints, type: "SPEND", description: `Sipariş #${orderNumber} puan kullanımı`, orderId: __newOrder_id }).run();
          }
          db.insert(loyaltyTransactions).values({ customerId: cust.id, points: earnedPoints, type: "EARN", description: `Sipariş #${orderNumber} alışverişinden kazanılan puan`, orderId: __newOrder_id }).run();
          db.update(customers).set({ loyaltyPoints: newBalance }).where(eq(customers.id, cust.id)).run();
        }
      }

      db.insert(orderStatusHistory).values({
        orderId: __newOrder_id,
        fromStatus: null,
        toStatus: orderType === "POS" ? "DELIVERED" : needsStock ? "BACKORDER" : "PENDING",
        note: needsStock ? "Stok bekleme sırasına alındı; stok ayrılana kadar ödeme yapmayın." : `Sipariş oluşturuldu (${orderType})`,
        changedBy: orderType === "POS" ? "Kasiyer" : "Online Müşteri",
      }).run();
      return db.select().from(orders).where(eq(orders.id, __newOrder_id)).get()!;
    }).immediate();

    return NextResponse.json({
      success: true,
      message: "Sipariş başarıyla oluşturuldu.",
      data: {
        order: { ...newOrder, paymentDeadline: newOrder.status === "PENDING" ? paymentDeadline(newOrder.id) : null },
        documentNumber: newOrder.orderNumber,
      },
    });
  } catch (error: any) {
    if (error instanceof StockShortage) return NextResponse.json({success:false,error:error.message},{status:409});
    if (error instanceof OrderProductUnavailable) return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    console.error("Order creation error:", error);
    return NextResponse.json({ success: false, error: "Sipariş kaydedilemedi. Lütfen tekrar deneyin." }, { status: 500 });
  }
}

/** PATCH /api/orders — durum ilerletme, kargo bilgisi, iptal. */
export async function PATCH(request: Request) {
  const __gate = await requireStaff(request);
  if (!__gate.ok) return __gate.response;
  const matrix = await readRoleMatrix();
  if (!roleCanAccessModule(matrix, __gate.user.role, "orders")) return NextResponse.json({ success: false, error: "Sipariş değiştirme yetkiniz bulunmuyor." }, { status: 403 });
  const origin = request.headers.get("origin");
  if ((origin && origin !== publicBaseUrl(request)) || request.headers.get("sec-fetch-site") === "cross-site") return NextResponse.json({ success: false, error: "İstek kaynağı doğrulanamadı." }, { status: 403 });
  if (!origin) {
    const auth = request.headers.get("authorization") || "";
    const actor = auth.startsWith("Bearer ") ? await getUserByToken(auth.slice(7).trim()) : null;
    if (!actor || actor.id !== __gate.user.id) return NextResponse.json({ success: false, error: "İstek kaynağı doğrulanamadı." }, { status: 403 });
  }
  if (!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get("content-type") || "")) return NextResponse.json({ success: false, error: "Geçersiz istek türü." }, { status: 415 });
  if (Number(request.headers.get("content-length") || 0) > 16384) return NextResponse.json({ success: false, error: "İstek çok büyük." }, { status: 413 });
  const parsed = await readCrmJson(request);
  if (!parsed.ok) return parsed.response;
  if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) return NextResponse.json({ success: false, error: "Geçersiz istek gövdesi." }, { status: 400 });

  try {
    const body = parsed.value as Record<string, any>;
    const id = Number(body.id);
    if (!id) {
      return NextResponse.json({ success: false, error: "Sipariş ID zorunludur." }, { status: 422 });
    }

    // Manual bank verification and cancellation must settle the matching hold once,
    // under the same write lock as the status and audit history.
    if (body.status === "PAID" || body.status === "CANCELLED") {
      if (body.status === "PAID" && !["SUPER_ADMIN", "STORE_MANAGER"].includes(__gate.user.role)) return NextResponse.json({success:false,error:"Banka ödemesini onaylama yetkiniz bulunmuyor."},{status:403});
      try {
        const result = sqlite.transaction(() => {
          processOrderQueueSync();
          const current = db.select().from(orders).where(eq(orders.id,id)).get();
          if (!current || !["PENDING", "BACKORDER"].includes(current.status) || current.paymentMethod !== "EFT_HAVALE" || current.orderType !== "ONLINE_B2C") return null;
          const paid = body.status === "PAID";
          if (paid && current.status !== "PENDING") throw new StockShortage("Stok henüz ayrılmadı; ödeme onaylanamaz.");
          if (current.status === "PENDING") finishPaymentHolds(id, paid ? "CONSUMED" : "RELEASED",current.orderNumber,__gate.user.name);
          if (!paid) releaseOrderDiscounts(id);
          db.update(orders).set({status:paid ? "PAID" : "CANCELLED",paymentStatus:paid ? "PAID" : "CANCELLED"}).where(eq(orders.id,id)).run();
          db.insert(orderStatusHistory).values({orderId:id,fromStatus:current.status,toStatus:paid ? "PAID" : "CANCELLED",note:paid ? "Banka hareketi yetkili tarafından doğrulandı" : "Ödenmemiş sipariş iptal edildi",changedBy:`${__gate.user.name} (#${__gate.user.id})`}).run();
          if (!paid) processOrderQueueSync();
          return db.select().from(orders).where(eq(orders.id,id)).get()!;
        }).immediate();
        if (result) return NextResponse.json({success:true,data:result});
      } catch (error) {
        if (error instanceof StockShortage) return NextResponse.json({success:false,error:error.message},{status:409});
        throw error;
      }
    }

    const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!order) {
      return NextResponse.json({ success: false, error: "Sipariş bulunamadı." }, { status: 404 });
    }

    if (body.status === "CANCELLED" && order.paymentStatus === "PAID") return NextResponse.json({success:false,error:"Ödenmiş siparişin iptal ve iadesi ayrı inceleme gerektirir; ödeme veya stok otomatik iade edilmedi."},{status:409});
    if (["PENDING", "BACKORDER"].includes(order.status) && (body.status === "PAID" || body.status === "CANCELLED")) return NextResponse.json({success:false,error:"Bu siparişin güvenli ödeme rezervasyonu bulunmuyor; manuel inceleme gerekli."},{status:409});
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
      // Cancelling an already-paid order does not prove that a refund occurred.
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
