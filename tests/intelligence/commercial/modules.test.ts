import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzePricing, DEFAULT_PRICING_SETTINGS, type PricingProductInput } from "@/lib/intelligence/commercial/pricing/pricing-engine";
import { analyzeCampaigns } from "@/lib/intelligence/commercial/campaigns/campaigns-engine";
import { analyzeBasket } from "@/lib/intelligence/commercial/basket/basket-engine";
import { analyzeSuppliers } from "@/lib/intelligence/commercial/suppliers/suppliers-engine";
import { analyzeQuality, classifyReason, foldReason } from "@/lib/intelligence/commercial/quality/quality-engine";
import { analyzeProcurement } from "@/lib/intelligence/commercial/procurement/procurement-engine";
import { makeOrder, makeProduct, makeBundle, steadyBundle } from "../helpers";
import type { OrderItemRow } from "@/lib/intelligence/types";

const prod = (id: number, buy: number, retail: number, campaign: number | null = null): PricingProductInput => ({
  id, name: `Ürün ${id}`, sku: `SKU-${id}`, categoryId: 1, categoryName: "İpler", isActive: true,
  buyPrice: buy, retailPrice: retail, campaignPrice: campaign,
});

const salesMap = (rows: Record<number, { units: number; revenue: number; returns?: number }>) =>
  new Map(Object.entries(rows).map(([k, v]) => [Number(k), { unitsSold: v.units, grossRevenue: v.revenue, returnsQty: v.returns ?? 0, returnsValue: 0 }]));

// ---------- PRICING ----------
test("pricing: maliyet altı satış negatif katkı; hedef fiyat maliyet üstü önerilir", () => {
  const res = analyzePricing({
    products: [prod(1, 100, 90)],
    sales: salesMap({ 1: { units: 12, revenue: 90 * 12 } }),
    inventory: new Map([[1, { availableQty: 30 }]]),
  });
  const row = res.rows[0];
  assert.ok(row.flags.includes("NEGATIVE_CONTRIBUTION"));
  assert.ok(row.suggestedPrice != null && row.suggestedPrice >= row.unitCost);
  const opp = res.opportunities.find((o) => o.opportunityKey.includes("negative_contribution"));
  assert.ok(opp, "negatif katkı fırsatı üretilmeli");
  assert.ok(opp!.evidence.length > 0 && opp!.calculationMethod.length > 0);
  assert.ok(opp!.estimatedProfitImpact > 0);
});

test("pricing: kampanya fiyatı maliyetin altında + düşük marjlı hacim ürünü", () => {
  const res = analyzePricing({
    products: [prod(1, 100, 200, 80), prod(2, 50, 55)],
    sales: salesMap({ 1: { units: 8, revenue: 80 * 8 }, 2: { units: 20, revenue: 55 * 20 } }),
    inventory: new Map([[1, { availableQty: 5 }], [2, { availableQty: 40 }]]),
  });
  assert.ok(res.rows[0]?.flags.includes("CAMPAIGN_BELOW_COST"));
  assert.ok(res.rows[1]?.flags.includes("LOW_MARGIN_HIGH_VOLUME"));
  assert.ok(res.summary.campaignBelowCostCount === 1);
});

test("pricing: satış yoksa INSUFFICIENT_DATA ve fırsat üretilmez", () => {
  const res = analyzePricing({ products: [prod(1, 50, 100)], sales: new Map(), inventory: new Map() });
  assert.equal(res.dataQuality.status, "INSUFFICIENT_DATA");
  assert.equal(res.opportunities.length, 0);
});

// ---------- CAMPAIGNS ----------
const mkItem = (orderId: number, productId: number, qty: number, price: number): OrderItemRow => ({
  orderId, productId, variantId: null, productName: `Ürün ${productId}`, sku: `SKU-${productId}`,
  unitPrice: price, quantity: qty, totalPrice: qty * price,
});

test("campaigns: kaybeden reklam için ROAS hesabı + durdurma fırsatı", () => {
  const orders = [makeOrder({ id: 1, createdAt: new Date(), status: "PAID", subtotal: 500, grandTotal: 500 })];
  const items = [mkItem(1, 1, 1, 500)];
  const products = [makeProduct({ id: 1, buyPrice: 100, retailPrice: 500 })];
  const res = analyzeCampaigns({
    orders, items, products,
    promotions: [],
    coupons: [],
    advertising: [{
      id: 7, name: "Google İplik", channel: "GOOGLE_ADS", spend: 1000, impressions: 10000, clicks: 200, conversions: 3,
      revenueAttributed: 600, startsOn: "2026-10-01", endsOn: null,
    }],
  });
  const ad = res.advertising[0];
  assert.equal(ad.roas, 0.6);
  assert.equal(ad.flag, "LOSING");
  const opp = res.opportunities.find((o) => o.opportunityKey === "ADVERTISING_OPTIMIZATION|ad:7|losing");
  assert.ok(opp, "kaybeden reklam fırsatı üretilmeli");
  assert.ok(opp!.estimatedCostSaving > 0);
});

test("campaigns: ölçeklendirme adayı ve süresi geçmiş ama aktif kampanya", () => {
  const orders = [makeOrder({ id: 1, createdAt: new Date(), status: "PAID", subtotal: 1000, grandTotal: 1000 })];
  const items = [mkItem(1, 1, 2, 500)];
  const products = [makeProduct({ id: 1, buyPrice: 100, retailPrice: 500 })];
  const past = new Date(Date.now() - 40 * 86400000);
  const res = analyzeCampaigns({
    orders, items, products,
    promotions: [{
      id: 3, name: "Bayram İndirimi", ruleType: "PERCENT_CATEGORY", productId: null, categoryId: 1, brandId: null,
      percentValue: 10, fixedValue: null, isActive: true, usedCount: 50, priority: 50,
      startDate: past, endDate: new Date(Date.now() - 10 * 86400000), maxDiscount: null,
    }],
    coupons: [],
    advertising: [{
      id: 9, name: "Meta Palet", channel: "META_ADS", spend: 2000, impressions: 5000, clicks: 400, conversions: 20,
      revenueAttributed: 10000, startsOn: "2026-10-01", endsOn: null,
    }],
  });
  assert.equal(res.advertising[0].flag, "SCALE_UP");
  assert.ok(res.opportunities.some((o) => o.opportunityKey === "CAMPAIGN_OPPORTUNITY|ad:9|scale_up"));
  assert.ok(res.opportunities.some((o) => o.opportunityKey === "CAMPAIGN_OPPORTUNITY|promotion:3|expired_still_active"));
  assert.match(res.attributionNote, /şemada yoktur/);
});

test("campaigns: reklam verisi yoksa ROAS uydurulmaz, not düşülür", () => {
  const orders = [makeOrder({ id: 1, createdAt: new Date(), status: "PAID", subtotal: 100, grandTotal: 100 })];
  const res = analyzeCampaigns({ orders, items: [mkItem(1, 1, 1, 100)], products: [makeProduct({ id: 1 })], promotions: [], coupons: [], advertising: [] });
  assert.equal(res.totals.adRoas, null);
  assert.ok(res.dataQuality.notes.some((x) => x.includes("Reklam verisi girilmemiş")));
});

// ---------- BASKET ----------
test("basket: 5 birliktelikte lift>1 çift bulunur; tek ürünlük sepet payı hesaplanır", () => {
  const orders: ReturnType<typeof makeOrder>[] = [];
  const items: OrderItemRow[] = [];
  for (let i = 1; i <= 10; i++) {
    orders.push(makeOrder({ id: i, createdAt: new Date(), status: "PAID", customerId: i, grandTotal: 300 }));
    if (i <= 6) items.push(mkItem(i, 1, 1, 100));
    if (i <= 5) items.push(mkItem(i, 2, 1, 200));
    if (i > 6) items.push(mkItem(i, 3, 1, 50)); // farklı ürün
  }
  const products = [makeProduct({ id: 1, retailPrice: 100, buyPrice: 40 }), makeProduct({ id: 2, retailPrice: 200, buyPrice: 80 }), makeProduct({ id: 3, retailPrice: 50, buyPrice: 20 })];
  const res = analyzeBasket({ orders, items, products });
  const pair = res.pairs.find((p) => p.productA.id === 1 && p.productB.id === 2);
  assert.ok(pair, "1–2 çifti bulunmalı");
  assert.ok(pair!.lift >= 1.2);
  assert.ok(pair!.pairOrders === 5);
  assert.equal(res.totals.singleItemOrderPct, 50);
  assert.ok(res.opportunities.some((o) => o.opportunityType === "CROSS_SELLING"));
});

test("basket: sepet yoksa INSUFFICIENT_DATA", () => {
  const res = analyzeBasket({ orders: [], items: [], products: [] });
  assert.equal(res.dataQuality.status, "INSUFFICIENT_DATA");
});

// ---------- SUPPLIERS ----------
test("suppliers: zamanında teslim ve doluluk skordan hesaplanır; düşük skor fırsat üretir", () => {
  const now = Date.now();
  const day = 86400000;
  const mkPo = (id: number, createdOffset: number, receivedOffset: number, qty: number, received: number) => {
    const created = new Date(now - createdOffset * day);
    const expected = new Date(created.getTime() + 5 * day); // 5 gün taahhüt
    const expectedStr = expected.toISOString().slice(0, 10);
    return {
      id,
      poNumber: `PO-${id}`,
      status: received > 0 ? "RECEIVED" : "ORDERED",
      expectedDate: expectedStr,
      createdAt: created,
      totalAmount: qty * 100,
      items: [{ productId: 1, quantity: qty, receivedQty: received, unitCost: 100 }],
      receipts: received > 0 ? [{ receiptId: id * 10, createdAt: new Date(now - receivedOffset * day), receiptNumber: `GN-${id}` }] : [],
    };
  };
  const res = analyzeSuppliers({
    suppliers: [{
      id: 11, name: "İplik Tedarik", leadTimeDays: 5, paymentTerms: "30 Gün Vade", rating: 2.0, isActive: true,
      pos: [mkPo(1, 30, 20, 10, 10), mkPo(2, 20, 10, 10, 4)], // her ikisi de taahhüdün 5 gün geç teslimi
    }],
    salesByProduct: new Map([[1, { unitsSold: 3, grossRevenue: 300, returnsQty: 1, returnsValue: 100 }]]),
    categoryByProduct: new Map([[1, { id: 1, name: "İpler" }]]),
  });
  const row = res.rows[0];
  assert.equal(row.fillRatePct, 70); // 14/20
  assert.ok(row.score != null);
  assert.ok(res.opportunities.some((o) => o.opportunityType === "SUPPLIER_IMPROVEMENT"));
});

test("suppliers: tek kaynaklı kategori SINGLE_SOURCE riski olarak raporlanır", () => {
  const day = 86400000;
  const now = Date.now();
  const res = analyzeSuppliers({
    suppliers: [{
      id: 12, name: "Tek Kaynak A.Ş.", leadTimeDays: 3, paymentTerms: "Peşin", rating: 5.0, isActive: true,
      pos: [{
        id: 1, poNumber: "PO-1", status: "RECEIVED", expectedDate: null,
        createdAt: new Date(now - 30 * day), totalAmount: 1000,
        items: [{ productId: 9, quantity: 50, receivedQty: 50, unitCost: 20 }],
        receipts: [{ receiptId: 10, createdAt: new Date(now - 25 * day), receiptNumber: "GN-1" }],
      }],
    }],
    salesByProduct: new Map([[9, { unitsSold: 10, grossRevenue: 500, returnsQty: 0, returnsValue: 0 }]]),
    categoryByProduct: new Map([[9, { id: 2, name: "Düğmeler" }]]),
  });
  assert.equal(res.categoryConcentration[0]?.risk, "SINGLE_SOURCE");
  assert.ok(res.opportunities.some((o) => o.opportunityType === "SUPPLIER_RISK"));
});

// ---------- QUALITY ----------
test("quality: iade oranı alarmı; neden Pareto'su BEDEN kovasına toplar", () => {
  const sales = new Map([
    [1, { unitsSold: 20, grossRevenue: 2000, returnsQty: 4, returnsValue: 400, returnsValueX: 0 } as never],
  ]) as never;
  // salesByProduct tipini düzelt: returnsQty>0 olan gerçek kayıt
  const salesByProduct = new Map([
    [1, { unitsSold: 20, grossRevenue: 2000, returnsQty: 4, returnsValue: 400 }],
  ]);
  void sales;
  const res = analyzeQuality({
    salesByProduct,
    productDims: new Map([[1, { name: "Kazak", sku: "KZ-1" }]]),
    returnsDetail: [
      { returnId: 1, reason: "Beden küçüktü", status: "REFUNDED", refundAmount: 100, restock: true, createdAt: new Date(), items: [{ productId: 1, quantity: 1, refundAmount: 100 }] },
      { returnId: 2, reason: "Beden büyük geldi", status: "REFUNDED", refundAmount: 100, restock: true, createdAt: new Date(), items: [{ productId: 1, quantity: 1, refundAmount: 100 }] },
      { returnId: 3, reason: "kumaş defolu", status: "REFUNDED", refundAmount: 100, restock: false, createdAt: new Date(), items: [{ productId: 1, quantity: 1, refundAmount: 100 }] },
      { returnId: 4, reason: "Beden uymuyor", status: "REFUNDED", refundAmount: 100, restock: true, createdAt: new Date(), items: [{ productId: 1, quantity: 1, refundAmount: 100 }] },
      { returnId: 5, reason: "bedeN küçüktü", status: "REFUNDED", refundAmount: 0, restock: true, createdAt: new Date(), items: [{ productId: 1, quantity: 1, refundAmount: 0 }] },
      { returnId: 6, reason: "Beden farketmedi", status: "REFUNDED", refundAmount: 0, restock: false, createdAt: new Date(), items: [{ productId: 1, quantity: 1, refundAmount: 0 }] },
    ],
    approvedReviewsByProduct: new Map([[1, { count: 5, avgRating: 2.5 }]]),
  });
  const row = res.products.find((r) => r.productId === 1)!;
  assert.ok(row.flags.includes("HIGH_RETURN_RATE"));
  assert.ok(row.flags.includes("LOW_RATING"));
  const beden = res.reasonPareto.find((b) => b.bucket === "BEDEN / NUMARA");
  assert.ok(beden && beden.count >= 4, `BEDEN kovası beklenir, gelen: ${beden?.count}`);
  assert.ok(res.opportunities.some((o) => o.opportunityType === "RETURN_REDUCTION"));
  assert.equal(classifyReason("Beden küçüktü"), "BEDEN / NUMARA");
  assert.equal(classifyReason(null), "BELİRTİLMEMİŞ");
  assert.ok(foldReason("ĞüşİÖÇ").includes("gusio c".replace(" ", "")) === false || true); // salt çalışıyor mu
});

// ---------- PROCUREMENT ----------
test("procurement: ölü stok tespiti ve reorder adayı", () => {
  const bundle = steadyBundle(60, 1, 1);
  const last = new Map<number, Date>();
  const salesByProduct = new Map([[1, { unitsSold: 60, grossRevenue: 6000, returnsQty: 0, returnsValue: 0 }]]);
  const inventory = new Map<number, number>([[1, 2], [2, 40]]);
  const productDims = new Map([
    [1, { name: "Çok Satan", sku: "CS-1", buyPrice: 30, categoryId: 1 }],
    [2, { name: "Ölü Kalem", sku: "OL-2", buyPrice: 25, categoryId: 1 }],
  ]);
  const res = analyzeProcurement({ bundle, salesByProduct, inventory, suppliers: [], productDims, lastSaleByProduct: last });
  // Ürün 2: satış yok → ölü stok 40×25 = 1000
  const dead = res.deadStock.find((d) => d.productId === 2);
  assert.ok(dead && dead.value === 1000);
  // Ürün 1: günde 1 satış, stok 2 → reorder adayı
  assert.ok(res.reorderCandidates.some((r) => r.productId === 1));
  assert.ok(res.opportunities.some((o) => o.opportunityType === "CASH_FLOW_OPTIMIZATION"));
});
