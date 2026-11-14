/**
 * FAZ 2 scratch eki — yalnızca "scratch" içeren DATABASE_URL ile çalışır.
 * scratch-intelligence-seed çalıştıktan SONRA çalıştırılır.
 * Deterministik (mulberry32) — sentetik test verisi.
 */
import "dotenv/config";
import { db } from "../src/db";
import {
  products,
  promotions,
  coupons,
  suppliers,
  purchaseOrders,
  purchaseOrderItems,
  goodsReceipts,
  goodsReceiptItems,
  orderReturns,
  orderReturnItems,
  orders,
  orderItems,
  productReviews,
  advertisingPerformance,
  inventory,
  warehouses,
} from "../src/db/schema";
import { eq, inArray } from "drizzle-orm";

const url = process.env.DATABASE_URL || "";
if (!url.includes("scratch")) {
  console.error("GÜVENLİK: Bu script yalnızca 'scratch' içeren DATABASE_URL ile çalışır. Çıkılıyor.");
  process.exit(1);
}

const day = 86400000;
const now = Date.now();
const dAgo = (days: number) => new Date(now - days * day);
const iso = (d: Date) => d.toISOString().slice(0, 10);

async function main() {
  console.log("FAZ 2 scratch seed başlıyor:", url);

  const allProducts = await db.select().from(products);
  const bySku = new Map(allProducts.map((p) => [p.sku ?? "", p]));
  const p1 = bySku.get("SCR-0001")!, p2 = bySku.get("SCR-0002")!, p3 = bySku.get("SCR-0003")!, p4 = bySku.get("SCR-0004")!;
  const p8 = bySku.get("SCR-0008")!, p9 = bySku.get("SCR-0009")!;
  if (!p1 || !p2 || !p3) throw new Error("Önce scratch-intelligence-seed çalıştırılmalı.");

  // P2'yi düşük marjlı yap (buy 110, retail 120 → katkı ~8.3%) → LOW_MARGIN_HIGH_VOLUME
  await db.update(products).set({ buyPrice: "110.00", retailPrice: "120.00" }).where(eq(products.id, p2.id));
  // P3'e maliyet altı kampanya fiyatı (buy 65) → CAMPAIGN_BELOW_COST
  await db.update(products).set({ campaignPrice: "50.00" }).where(eq(products.id, p3.id));
  // P4'e DISCOUNT_MARGIN_LEAK için kampanya yok ama gerçekleşen fiyatları zaten indirimli olabilir — dokunma.

  const [wh] = await db.select().from(warehouses).limit(1);
  const warehouseId = wh?.id ?? 1;

  // --- Tedarikçiler ---
  const [supA] = await db.insert(suppliers).values({
    name: "Anadolu İplik A.Ş.", contactPerson: "Ayşe", phone: "0212 555 0101",
    leadTimeDays: 4, paymentTerms: "30 Gün Vade", rating: "4.7", isActive: true,
  }).returning({ id: suppliers.id });
  const [supB] = await db.insert(suppliers).values({
    name: "Geç Teslimat Tekstil", contactPerson: "Mehmet", phone: "0212 555 0202",
    leadTimeDays: 3, paymentTerms: "Peşin", rating: "2.1", isActive: true,
  }).returning({ id: suppliers.id });
  const [supC] = await db.insert(suppliers).values({
    name: "Hiç Alınmadı Toptan", contactPerson: "—", phone: "0212 555 0303",
    leadTimeDays: 7, paymentTerms: "45 Gün Vade", rating: "4.0", isActive: true,
  }).returning({ id: suppliers.id });

  // --- PO'lar: A zamanında + dolu, B geç + eksik ---
  const mkPo = async (supplierId: number, poNumber: string, created: Date, expected: string, qty: number, received: number, unitCost: number, receiptDate: Date | null) => {
    const [po] = await db.insert(purchaseOrders).values({
      poNumber, supplierId, warehouseId, status: received > 0 ? "RECEIVED" : "ORDERED",
      totalAmount: (qty * unitCost).toFixed(2), expectedDate: expected, createdAt: created,
    }).returning({ id: purchaseOrders.id });
    const [item] = await db.insert(purchaseOrderItems).values({
      purchaseOrderId: po.id, productId: p1.id, quantity: qty, unitCost: unitCost.toFixed(2),
      receivedQty: received, totalCost: (qty * unitCost).toFixed(2),
    }).returning({ id: purchaseOrderItems.id });
    if (receiptDate && received > 0) {
      const [receipt] = await db.insert(goodsReceipts).values({
        receiptNumber: `MK-${poNumber}`, purchaseOrderId: po.id, warehouseId,
        receivedBy: "Scratch Mal Kabul", createdAt: receiptDate,
      }).returning({ id: goodsReceipts.id });
      await db.insert(goodsReceiptItems).values({
        receiptId: receipt.id, purchaseOrderItemId: item.id, productId: p1.id, qty: received,
      });
    }
    return po.id;
  };
  // A: 2 PO, zamanında ve tam teslim
  await mkPo(supA.id, "PO-2026-101", dAgo(40), iso(dAgo(36)), 100, 100, 32, dAgo(37));
  await mkPo(supA.id, "PO-2026-107", dAgo(15), iso(dAgo(11)), 120, 120, 33, dAgo(12));
  // B: 1 PO, geç ve kısmi teslim (%71)
  await mkPo(supB.id, "PO-2026-103", dAgo(25), iso(dAgo(22)), 70, 50, 50, dAgo(15));

  // --- Kampanyalar ---
  await db.insert(promotions).values([
    {
      name: "Scratch %10 Bayram", ruleType: "PERCENT_CATEGORY", categoryId: p1.categoryId,
      percentValue: "10", minQty: 1, priority: 50, startDate: dAgo(20), endDate: new Date(now + 10 * day),
      isActive: true, usedCount: 34,
    },
    {
      name: "Scratch Eski Kampanya", ruleType: "PERCENT_PRODUCT", productId: p1.id,
      percentValue: "15", minQty: 1, priority: 40, startDate: dAgo(60), endDate: dAgo(10), // bitti ama aktif
      isActive: true, usedCount: 12,
    },
    {
      name: "Scratch Hiç Kullanılmadı", ruleType: "PERCENT_BRAND",
      percentValue: "20", minQty: 1, priority: 30, startDate: dAgo(45), endDate: new Date(now + 30 * day),
      isActive: true, usedCount: 0,
    },
  ]);

  // --- Kuponlar ---
  await db.insert(coupons).values([
    { code: "SCR10", discountType: "PERCENT", discountValue: "10", usageLimit: 50, usedCount: 40, isActive: true },
    { code: "SCR50", discountType: "FIXED", discountValue: "50", usageLimit: 10, usedCount: 10, isActive: true },
  ]);

  // --- Onaylı yorumlar (kalite sinyali) --- P2 zayıf puan
  await db.insert(productReviews).values([
    { productId: p2.id, customerName: "Yorum 1", customerEmail: null, rating: 2, title: null, comment: "Kalitesi Aynı Kaldı", verifiedPurchase: true, status: "APPROVED" },
    { productId: p2.id, customerName: "Yorum 2", customerEmail: null, rating: 3, title: null, comment: "idare eder", verifiedPurchase: true, status: "APPROVED" },
    { productId: p2.id, customerName: "Yorum 3", customerEmail: null, rating: 2, title: null, comment: "memnun kalmadım", verifiedPurchase: true, status: "APPROVED" },
    { productId: p1.id, customerName: "Yorum 4", customerEmail: null, rating: 5, title: null, comment: "çok iyi", verifiedPurchase: true, status: "APPROVED" },
  ]);

  // --- İade kayıtları (P2 yüksek oran için) ---
  const p2Items = await db.select().from(orderItems).where(eq(orderItems.productId, p2.id));
  const p2Orders = await db.select().from(orders);
  const orderIds = new Set(p2Orders.map((o) => o.id));
  const matched = p2Items.filter((i) => orderIds.has(i.orderId)).slice(0, 6);
  for (let i = 0; i < matched.length; i++) {
    const it = matched[i];
    const reason = i < 3 ? "Beden küçüktü" : i < 5 ? "Kumaş defolu" : "Beğenmedim";
    const refund = Number(it.totalPrice);
    const [ret] = await db.insert(orderReturns).values({
      returnNumber: `IAD-2026-${String(100 + i)}`, orderId: it.orderId, orderNumber: `SCR-REF-${100 + i}`,
      reason, status: "REFUNDED", refundAmount: refund.toFixed(2), restock: i % 2 === 0, createdAt: dAgo(5 + i * 3),
      createdBy: "Scratch Müşteri Hizmetleri",
    }).returning({ id: orderReturns.id });
    await db.insert(orderReturnItems).values({
      returnId: ret.id, orderItemId: it.id, productId: p2.id, productName: it.productName, quantity: 1, refundAmount: refund.toFixed(2),
    });
  }

  // --- Manuel reklam kayıtları ---
  await db.insert(advertisingPerformance).values([
    {
      name: "Scratch Google İplik Reklamı", channel: "GOOGLE_ADS", spend: "1500.00",
      impressions: 20000, clicks: 900, conversions: 12, revenueAttributed: "3750.00",
      startsOn: iso(dAgo(30)), endsOn: null, enteredBy: "Scratch Seed",
    },
    {
      name: "Scratch Meta Kayıp Reklam", channel: "META_ADS", spend: "1200.00",
      impressions: 8000, clicks: 120, conversions: 2, revenueAttributed: "480.00",
      startsOn: iso(dAgo(20)), endsOn: iso(dAgo(5)), enteredBy: "Scratch Seed",
    },
  ]);

  // --- Kasıtlı birliktelik (basket demo): iki niş ürün çoğu sepette birlikte ---
  const cat = allProducts[0]?.categoryId ?? 1;
  const [demoA] = await db.insert(products).values({
    name: "Scratch Demo Niş Kumas", slug: "scratch-demo-nis-kumas", sku: "SCR-DEMO-A",
    categoryId: cat, buyPrice: "80.00", retailPrice: "150.00", isActive: true,
  }).returning({ id: products.id });
  const [demoB] = await db.insert(products).values({
    name: "Scratch Demo Niş Tela", slug: "scratch-demo-nis-tela", sku: "SCR-DEMO-B",
    categoryId: cat, buyPrice: "40.00", retailPrice: "85.00", isActive: true,
  }).returning({ id: products.id });

  const [c] = await db.select().from((await import("../src/db/schema")).customers).limit(1);
  let cpOrder = 0;
  const mkBasket = async (lines: Array<{ productId: number; qty: number; price: number }>, dAgoN: number) => {
    cpOrder += 1;
    const date = dAgo(dAgoN);
    const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
    const [o] = await db.insert(orders).values({
      orderNumber: `SCR-CP-${String(cpOrder).padStart(4, "0")}`,
      orderType: "ONLINE_B2C",
      customerId: c?.id ?? null,
      customerName: "Scratch Basket",
      status: "DELIVERED",
      paymentStatus: "PAID",
      paymentMethod: "CREDIT_CARD",
      subtotal: subtotal.toFixed(2),
      discountTotal: "0.00",
      taxTotal: "0.00",
      shippingTotal: "0.00",
      grandTotal: subtotal.toFixed(2),
      createdAt: date,
    }).returning({ id: orders.id });
    for (const l of lines) {
      await db.insert(orderItems).values({
        orderId: o.id, productId: l.productId, variantId: null,
        productName: "Scratch Demo", sku: `SCR-DEMO`,
        unitPrice: l.price.toFixed(2), quantity: l.qty, taxRate: 20,
        totalPrice: (l.qty * l.price).toFixed(2),
      });
    }
  };
  for (let i = 0; i < 26; i++) await mkBasket([{ productId: demoA.id, qty: 1, price: 150 }, { productId: demoB.id, qty: 2, price: 85 }], 8 + (i % 75));
  for (let i = 0; i < 4; i++) await mkBasket([{ productId: demoA.id, qty: 1, price: 150 }], 12 + (i % 70));
  for (let i = 0; i < 3; i++) await mkBasket([{ productId: demoB.id, qty: 1, price: 85 }], 20 + (i % 65));

  console.log("FAZ 2 scratch seed tamam: 3 tedarikçi, 3 PO, 3 kampanya, 2 kupon, 4 yorum, 6 iade, 2 reklam kaydı.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
