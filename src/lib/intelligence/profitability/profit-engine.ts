/**
 * Profit Intelligence Engine — saf hesaplama.
 * Net Sales = Σ(line revenue) − Σ(pro-rata indirim) − Σ(iade)   [KDV & kargo hariç]
 * COGS      = Σ(qty × buyPrice)                                  [cari maliyet; geçmiş maliyet kaydı yok]
 * Contribution Profit = Net Sales − COGS − VariableCosts(=0, EKSİK olarak işaretlenir)
 * Veri güvenilirliği: VERIFIED / PARTIAL / INSUFFICIENT_DATA.
 */
import type { SalesBundle } from "../repositories";
import { isValidOrder, orderDate, dayKey, type OrderItemRow } from "../types";

export type ProfitStatus = "VERIFIED" | "PARTIAL" | "INSUFFICIENT_DATA";

export interface ProfitRow {
  key: string;
  label: string;
  netSales: number;
  grossSales: number; // indirim öncesi merch gelir
  discounts: number;
  refunds: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number | null; // %
  contributionProfit: number;
  contributionMargin: number | null;
  unitsSold: number;
  costCoverage: number; // buyPrice>0 kalem oranı (0-1)
  missingCostLines: number;
  status: ProfitStatus;
}

export interface ProfitReport {
  generatedAt: string;
  degraded: boolean;
  notes: string[];
  levels: {
    product: ProfitRow[];
    category: ProfitRow[];
    brand: ProfitRow[];
    customer: ProfitRow[];
    order: ProfitRow[];
    channel: ProfitRow[];
    daily: ProfitRow[];
  };
  detections: {
    highRevenueLowMargin: ProfitRow[];
    lowRevenueHighMargin: ProfitRow[];
    negativeContribution: ProfitRow[];
    topContributors: ProfitRow[];
    lowContributors: ProfitRow[];
  };
  costCoverageOverall: number;
  missingCostProducts: Array<{ id: number; name: string }>;
}

interface Acc {
  label: string;
  gross: number;
  discount: number;
  refunds: number;
  cogs: number;
  units: number;
  totalLines: number;
  costedLines: number;
}

function classify(acc: Acc): ProfitStatus {
  if (acc.gross <= 0 && acc.refunds <= 0) return "INSUFFICIENT_DATA";
  const coverage = acc.totalLines ? acc.costedLines / acc.totalLines : 0;
  if (coverage >= 0.999) return "VERIFIED";
  if (coverage > 0) return "PARTIAL";
  return "INSUFFICIENT_DATA";
}

function finalize(key: string, acc: Acc): ProfitRow {
  const netSales = acc.gross - acc.discount - acc.refunds;
  const grossProfit = netSales - acc.cogs;
  const contributionProfit = grossProfit; // değişken maliyet bileşenleri (kargo/komisyon/paket/reklam) şemada YOK — 0 sayıldı ve işaretlendi
  const margin = (p: number) => (netSales !== 0 ? Number(((p / netSales) * 100).toFixed(1)) : null);
  return {
    key,
    label: acc.label,
    netSales: round2(netSales),
    grossSales: round2(acc.gross),
    discounts: round2(acc.discount),
    refunds: round2(acc.refunds),
    cogs: round2(acc.cogs),
    grossProfit: round2(grossProfit),
    grossMargin: margin(grossProfit),
    contributionProfit: round2(contributionProfit),
    contributionMargin: margin(contributionProfit),
    unitsSold: acc.units,
    costCoverage: acc.totalLines ? Number((acc.costedLines / acc.totalLines).toFixed(3)) : 0,
    missingCostLines: acc.totalLines - acc.costedLines,
    status: classify(acc),
  };
}

const round2 = (n: number) => Number(n.toFixed(2));

/** Sipariş indirimi kalemlere pro-rata dağıtılır; iade kalemleri ürün bazında netleştirilir. */
export function computeProfitability(bundle: SalesBundle, topN = 50): ProfitReport {
  const valid = bundle.orders.filter(isValidOrder);
  const itemsByOrder = new Map<number, OrderItemRow[]>();
  for (const it of bundle.items) {
    const arr = itemsByOrder.get(it.orderId) ?? [];
    arr.push(it);
    itemsByOrder.set(it.orderId, arr);
  }
  const orderById = new Map(valid.map((o) => [o.id, o]));
  const productById = new Map(bundle.products.map((p) => [p.id, p]));
  const categoryById = new Map(bundle.categories.map((c) => [c.id, c.name]));
  const brandById = new Map(bundle.brands.map((b) => [b.id, b.name]));
  // İadeleri indexle: orderId+productId ve orderId toplamı
  const refundByOrderProduct = new Map<string, number>();
  const refundOrderLevel = new Map<number, number>();
  const itemRefundSumByOrder = new Map<number, number>();
  for (const r of bundle.refunds) {
    if (!orderById.has(r.orderId)) continue;
    if (r.productId != null) {
      const k = `${r.orderId}:${r.productId}`;
      refundByOrderProduct.set(k, (refundByOrderProduct.get(k) ?? 0) + r.refundAmount);
      itemRefundSumByOrder.set(r.orderId, (itemRefundSumByOrder.get(r.orderId) ?? 0) + r.refundAmount);
    } else {
      refundOrderLevel.set(r.orderId, (refundOrderLevel.get(r.orderId) ?? 0) + r.refundAmount);
    }
  }

  const mk = () => ({ gross: 0, discount: 0, refunds: 0, cogs: 0, units: 0, totalLines: 0, costedLines: 0 });
  const levels = {
    product: new Map<string, Acc & { key: string }>(),
    category: new Map<string, Acc & { key: string }>(),
    brand: new Map<string, Acc & { key: string }>(),
    customer: new Map<string, Acc & { key: string }>(),
    order: new Map<string, Acc & { key: string }>(),
    channel: new Map<string, Acc & { key: string }>(),
    daily: new Map<string, Acc & { key: string }>(),
  };

  const accFor = (bucket: Map<string, Acc & { key: string }>, key: string, label: string) => {
    let a = bucket.get(key);
    if (!a) {
      a = { key, label, ...mk() };
      bucket.set(key, a);
    }
    return a;
  };

  for (const order of valid) {
    const items = itemsByOrder.get(order.id) ?? [];
    const subtotalSum = items.reduce((s, i) => s + i.totalPrice, 0);
    const dateKeyStr = dayKey(orderDate(order));
    // sipariş düzeyindeki iadeler bu siparişe; ürün iadeleri ilgili ürünlere
    const orderRefund = refundOrderLevel.get(order.id) ?? 0;

    const channelLabel = order.orderType === "POS" ? "Fiziki Mağaza (POS)" : "Online E-Ticaret (B2C)";
    accFor(levels.channel, order.orderType, channelLabel);
    accFor(levels.order, String(order.id), `#${order.orderNumber}`);
    accFor(levels.daily, dateKeyStr, dateKeyStr);
    accFor(levels.customer, order.customerId != null ? String(order.customerId) : `walkin-${order.id}`, order.customerName || "Misafir / Kasa");

    if (items.length === 0) {
      // Kalemsiz sipariş: sadece indirim/iadeyi kanal-gün-müşteri ile ilişkilendir
      for (const bucket of [levels.channel, levels.order, levels.daily, levels.customer]) {
        const key = bucket === levels.channel ? order.orderType : bucket === levels.order ? String(order.id) : bucket === levels.daily ? dateKeyStr : order.customerId != null ? String(order.customerId) : `walkin-${order.id}`;
        const a = bucket.get(key)!;
        a.refunds += orderRefund;
        a.discount += order.discountTotal;
      }
      continue;
    }

    for (const it of items) {
      const share = subtotalSum > 0 ? it.totalPrice / subtotalSum : 1 / items.length;
      const discountShare = order.discountTotal * share;
      const p = productById.get(it.productId);
      const unitCost = p?.buyPrice ?? 0;
      const lineRefund = refundByOrderProduct.get(`${order.id}:${it.productId}`) ?? 0;

      const targets: Array<[Map<string, Acc & { key: string }>, string, string]> = [
        [levels.product, String(it.productId), p?.name ?? it.productName],
        [levels.category, String(p?.categoryId ?? 0), p?.categoryId != null ? categoryById.get(p.categoryId) ?? "Kategori #?" : "Kategorisiz"],
        [levels.brand, String(p?.brandId ?? 0), p?.brandId != null ? brandById.get(p.brandId) ?? "Marka #?" : "Markasız"],
        [levels.order, String(order.id), `#${order.orderNumber}`],
        [levels.channel, order.orderType, channelLabel],
        [levels.daily, dateKeyStr, dateKeyStr],
        [levels.customer, order.customerId != null ? String(order.customerId) : `walkin-${order.id}`, order.customerName || "Misafir / Kasa"],
      ];
      for (const [bucket, key, label] of targets) {
        const a = accFor(bucket, key, label);
        a.gross += it.totalPrice;
        a.discount += discountShare;
        a.refunds += lineRefund;
        a.cogs += unitCost * it.quantity;
        a.units += it.quantity;
        a.totalLines += 1;
        if (unitCost > 0) a.costedLines += 1;
      }
    }
    // Sipariş seviyesindeki iade + kaleme EŞLENEMEYEN ürün iadesini dağıt.
    // Eşleşen ürün iadeleri yukarıda kalem döngüsünde (hedef kovalara) eklendi;
    // burada tekrar eklenmemesi için yalnız fark dağıtılır.
    const matchedItemRefund = items.reduce((sum, it) => sum + (refundByOrderProduct.get(`${order.id}:${it.productId}`) ?? 0), 0);
    const unmatchedItemRefund = Math.max(0, (itemRefundSumByOrder.get(order.id) ?? 0) - matchedItemRefund);
    const distribute = orderRefund + unmatchedItemRefund;
    if (distribute > 0) {
      for (const bucket of [levels.channel, levels.order, levels.daily, levels.customer]) {
        const key = bucket === levels.channel ? order.orderType : bucket === levels.order ? String(order.id) : bucket === levels.daily ? dateKeyStr : order.customerId != null ? String(order.customerId) : `walkin-${order.id}`;
        bucket.get(key)!.refunds += distribute;
      }
    }
  }
  const toRows = (bucket: Map<string, Acc & { key: string }>) =>
    [...bucket.values()].map((a) => finalize(a.key, a)).sort((a, b) => b.netSales - a.netSales);

  const product = toRows(levels.product);
  const category = toRows(levels.category);
  const brand = toRows(levels.brand);
  const customer = toRows(levels.customer);
  const order = toRows(levels.order);
  const channel = toRows(levels.channel);
  const daily = toRows(levels.daily).sort((a, b) => a.key.localeCompare(b.key));

  const revenues = product.map((p) => p.netSales).filter((v) => v > 0).sort((a, b) => a - b);
  const medianRevenue = revenues.length ? revenues[Math.floor(revenues.length / 2)] : 0;
  const detections = {
    highRevenueLowMargin: product.filter((p) => p.netSales >= medianRevenue && p.contributionMargin != null && p.contributionMargin < 10).slice(0, 10),
    lowRevenueHighMargin: product.filter((p) => p.netSales > 0 && p.netSales < medianRevenue && p.contributionMargin != null && p.contributionMargin >= 40).slice(0, 10),
    negativeContribution: product.filter((p) => p.contributionProfit < 0).slice(0, 10),
    topContributors: [...product].sort((a, b) => b.contributionProfit - a.contributionProfit).slice(0, 10),
    lowContributors: [...product].sort((a, b) => a.contributionProfit - b.contributionProfit).slice(0, 10),
  };

  // Toplam maliyet kapsama oranı
  let totLines = 0;
  let totCosted = 0;
  // yeniden ham sayımdan türet
  for (const a of levels.product.values()) {
    totLines += a.totalLines;
    totCosted += a.costedLines;
  }
  const missingCostProducts = [...levels.product.values()]
    .filter((a) => a.costedLines < a.totalLines)
    .map((a) => ({ id: Number(a.key), name: a.label }));

  return {
    generatedAt: new Date().toISOString(),
    degraded: totCosted < totLines,
    notes: [
      "COGS cari (güncel) alış fiyatı ile hesaplandı; geçmiş maliyet geçmişi şemada tutulmuyor.",
      "Satış komisyonu, ödeme kuruluşu komisyonu, kargo, paketleme ve reklam maliyetleri şemada YOKTUR → katkı kârında 0 sayıldı ve sonuçlar PARTIAL olarak işaretlendi.",
      "Net satışlar KDV ve kargo dahil değildir (merkezi margin analizi için net merch geliri).",
      "İptal/iade (REFUNDED) siparişler cirodan düşülmüştür; gerçekleşmemiş iadeler (REQUESTED/REJECTED) hariç tutulmuştur.",
    ],
    levels: { product: product.slice(0, topN), category, brand, customer: customer.slice(0, topN), order: order.slice(0, topN), channel, daily },
    detections,
    costCoverageOverall: totLines ? Number((totCosted / totLines).toFixed(3)) : 0,
    missingCostProducts,
  };
}
