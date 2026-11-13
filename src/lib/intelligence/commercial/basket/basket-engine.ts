/**
 * MARKET BASKET ENGINE — tamamlanmış (geçerli) siparişlerden ilişki madenciliği.
 * Sepet/kararı/terk olay verisi YOKTUR → fiyat/funnel çıkarımı yapılmaz.
 * Kurallar: destek (support), güven (confidence), kaldıraç (lift) — saf istatistik.
 */
import { buildOpportunity } from "../core/commercial-opportunity-engine";
import type { BuiltOpportunity } from "../core/commercial-opportunity-engine";
import { combinedConfidence } from "../core/confidence-engine";
import { financialImpactScale } from "../core/priority-score";
import { isValidOrder, type OrderItemRow, type OrderRow, type ProductDim } from "../../types";

const n = (v: unknown) => Number(v ?? 0) || 0;
const r2 = (v: number) => Number(v.toFixed(2));

export interface BasketSettings {
  minPairOrders: number;  // asgari birliktelik
  minLift: number;        // öneri için asgari lift
  attachUpliftPct: number; // ek teşhir/çapraz satış ile beklenen ek bağlanma % (varsayım)
}

export const DEFAULT_BASKET_SETTINGS: BasketSettings = {
  minPairOrders: 3,
  minLift: 1.2,
  attachUpliftPct: 10,
};

export interface BasketPair {
  productA: { id: number; name: string };
  productB: { id: number; name: string };
  pairOrders: number;
  countA: number;
  countB: number;
  supportPct: number;
  confidenceAtoB: number;  // P(B|A) %
  confidenceBtoA: number;  // P(A|B) %
  lift: number;
  marginB: number | null;  // B katkı/birim (maliyet varsa)
}

export interface BasketAnalysis {
  generatedAt: string;
  settings: BasketSettings;
  totals: {
    validOrders: number;
    avgBasketValue: number;
    avgItemsPerOrder: number;
    singleItemOrderPct: number;
  };
  pairs: BasketPair[]; // lifte göre sıralı, en iyi 30
  opportunities: BuiltOpportunity[];
  dataQuality: { status: "VERIFIED" | "PARTIAL" | "INSUFFICIENT_DATA"; notes: string[] };
}

export function analyzeBasket(opts: {
  orders: OrderRow[];
  items: OrderItemRow[];
  products: ProductDim[];
  settings?: Partial<BasketSettings>;
}): BasketAnalysis {
  const settings: BasketSettings = { ...DEFAULT_BASKET_SETTINGS, ...(opts.settings ?? {}) };
  const notes: string[] = [];
  const validOrders = opts.orders.filter(isValidOrder);
  const validIds = new Set(validOrders.map((o) => o.id));
  const validItems = opts.items.filter((i) => validIds.has(i.orderId));
  const productById = new Map(opts.products.map((p) => [p.id, p]));

  // Sipariş → ürün seti
  const orderProducts = new Map<number, Set<number>>();
  for (const i of validItems) {
    if (!orderProducts.has(i.orderId)) orderProducts.set(i.orderId, new Set());
    orderProducts.get(i.orderId)!.add(i.productId);
  }
  const baskets = [...orderProducts.values()];
  const totalBaskets = baskets.length;

  const productCount = new Map<number, number>();
  for (const b of baskets) for (const pid of b) productCount.set(pid, (productCount.get(pid) ?? 0) + 1);

  const pairCount = new Map<string, number>();
  for (const b of baskets) {
    const arr = [...b].sort((a, c) => a - c);
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const key = `${arr[i]}|${arr[j]}`;
        pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
      }
    }
  }

  const pairs: BasketPair[] = [];
  for (const [key, cnt] of pairCount) {
    if (cnt < settings.minPairOrders) continue;
    const [aStr, bStr] = key.split("|");
    const aId = Number(aStr), bId = Number(bStr);
    const cA = productCount.get(aId) ?? 0;
    const cB = productCount.get(bId) ?? 0;
    if (cA === 0 || cB === 0 || totalBaskets === 0) continue;
    const lift = (cnt * totalBaskets) / (cA * cB);
    if (lift < settings.minLift) continue;
    const pB = productById.get(bId);
    const pA = productById.get(aId);
    const marginB = pB && n(pB.buyPrice) > 0 ? r2(n(pB.retailPrice) - n(pB.buyPrice)) : null;
    pairs.push({
      productA: { id: aId, name: pA?.name ?? `Ürün #${aId}` },
      productB: { id: bId, name: pB?.name ?? `Ürün #${bId}` },
      pairOrders: cnt,
      countA: cA,
      countB: cB,
      supportPct: r2((cnt / totalBaskets) * 100),
      confidenceAtoB: r2((cnt / cA) * 100),
      confidenceBtoA: r2((cnt / cB) * 100),
      lift: r2(lift),
      marginB,
    });
  }
  pairs.sort((a, b) => b.lift - a.lift || b.pairOrders - a.pairOrders);

  // Sepet metrikleri
  const basketUnits = new Map<number, number>();
  const basketRev = new Map<number, number>();
  for (const i of validItems) {
    basketUnits.set(i.orderId, (basketUnits.get(i.orderId) ?? 0) + i.quantity);
    basketRev.set(i.orderId, (basketRev.get(i.orderId) ?? 0) + i.totalPrice);
  }
  // Gerçek sepet geliri: sipariş grandTotal (indirim sonrası) daha doğrudur
  const validOrdersById = new Map(opts.orders.filter((o) => validIds.has(o.id)).map((o) => [o.id, o]));
  const avgBasketValue = totalBaskets > 0
    ? r2([...validOrdersById.values()].reduce((s, o) => s + o.grandTotal, 0) / validOrdersById.size)
    : 0;
  const avgItemsPerOrder = totalBaskets > 0 ? r2([...basketUnits.values()].reduce((s, v) => s + v, 0) / totalBaskets) : 0;
  const singleItemOrders = [...basketUnits.values()].filter((v) => v === 1).length;
  const singleItemOrderPct = totalBaskets > 0 ? r2((singleItemOrders / totalBaskets) * 100) : 0;

  const status: "VERIFIED" | "PARTIAL" | "INSUFFICIENT_DATA" =
    totalBaskets === 0 ? "INSUFFICIENT_DATA"
    : totalBaskets < 30 || pairs.length === 0 ? "PARTIAL"
    : "VERIFIED";
  if (totalBaskets === 0) notes.push("Geçerli sepet/sipariş yok — ilişki madenciliği yapılamaz.");
  else if (totalBaskets < 30) notes.push(`Örneklem küçük (${totalBaskets} sepet); birliktelikler geçici olabilir.`);
  notes.push("Sepet terk/checkout olay verisi şemada yok — funnel metrikleri bu modülde yoktur.");

  // Fırsatlar: en güçlü 5 çift için çapraz satış
  const opportunities: BuiltOpportunity[] = [];
  const period = { start: daysAgoISO(90), end: new Date().toISOString().slice(0, 10) };
  for (const pair of pairs.slice(0, 5)) {
    const pB = productById.get(pair.productB.id);
    const unitPriceB = pB ? n(pB.retailPrice) : 0;
    const assumedAttach = (settings.attachUpliftPct / 100) * pair.countA; // teşhirle eklenen bağlanma (varsayım)
    const estRevenue = r2(assumedAttach * unitPriceB);
    const estProfit = pair.marginB != null ? r2(assumedAttach * pair.marginB) : 0;
    opportunities.push(buildOpportunity({
      opportunityKey: `CROSS_SELLING|pair:${pair.productA.id}-${pair.productB.id}|lift`,
      opportunityType: "CROSS_SELLING",
      title: `"${pair.productA.name}" + "${pair.productB.name}" birlikte satılıyor (lift ${pair.lift})`,
      description: `${pair.pairOrders} sepette birlikte alındılar; B'ye bağlanma olasılığı A alındığında %${pair.confidenceAtoB}. Teşhir/öneri A müşterisine B'yi öne çıkarabilir.`,
      sourceModule: "basket",
      relatedProductId: pair.productB.id,
      estimatedRevenueImpact: estRevenue,
      estimatedProfitImpact: estProfit,
      confidenceScore: combinedConfidence(75, pair.pairOrders, 15),
      dataCoverage: 75,
      priorityInputs: {
        financialImpact: financialImpactScale(Math.max(estProfit, 1), 30000),
        feasibility: 80,
        urgency: 35,
        strategic: 60,
      },
      evidence: [
        `Lift ${pair.lift} · destek %${pair.supportPct} · güven A→B %${pair.confidenceAtoB}`,
        `Son dönemde birlikte ${pair.pairOrders} siparişte yer aldılar`,
        `A ürünü ${pair.countA} sepette, B ürünü ${pair.countB} sepette`,
      ],
      assumptions: [
        `Ek bağlanma oranı %${settings.attachUpliftPct} varsayıldı (ölçülmüş etki DEĞİL; teşhir sonrası gerçek oran izlenmeli).`,
        "Talep korelasyonu nedensellik değildir.",
        "Etki = ek bağlanma × B fiyatı/marjı.",
      ],
      calculationMethod: `beklenen ek adet = %${settings.attachUpliftPct} × A sepet sayısı (${pair.countA}); gelir = ek adet × B etkin fiyat; kâr = ek adet × B katkısı (maliyet varsa).`,
      recommendedAction: `"${pair.productA.name}" sayfasında ve sepette "${pair.productB.name}" önerisini gösterin; 4 hafta sonra attach oranını ölçün.`,
      dataPeriodStart: period.start,
      dataPeriodEnd: period.end,
      expiresInDays: 60,
    }));
  }

  return {
    generatedAt: new Date().toISOString(),
    settings,
    totals: { validOrders: totalBaskets, avgBasketValue, avgItemsPerOrder, singleItemOrderPct },
    pairs: pairs.slice(0, 30),
    opportunities,
    dataQuality: { status, notes },
  };
}

function daysAgoISO(days: number): string {
  const d = new Date(Date.now() - days * 86400000);
  return d.toISOString().slice(0, 10);
}
