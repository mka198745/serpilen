/**
 * FAZ 3 — What-if Simulation motoru.
 * Gerçek kayıtlar DEĞİŞTİRİLMEZ: baseline salt okunur anlık görüntüden türetilir.
 * Sonuçlar Base/Expected/Best/Worst olarak raporlanır; Best/Worst yalnız kullanıcı
 * verdiği aralığa YA DA açıkça etiketlenmiş VARSAYIMSAL aralığa dayanır — uydurma yok.
 * 6 kategori: PRICING, SALES, PROCUREMENT, MARKETING, INVENTORY, FINANCIAL.
 */
import { SCENARIO_ALGORITHM_VERSION } from "../core/confidence";

export const SIMULATION_CATEGORIES = ["PRICING", "SALES", "PROCUREMENT", "MARKETING", "INVENTORY", "FINANCIAL"] as const;
export type SimulationCategory = (typeof SIMULATION_CATEGORIES)[number];

export interface SimulationBaseline {
  periodDays: number;
  price: number | null;
  unitCost: number | null;
  variableCost: number | null;
  dailyUnits: number | null;
  avgDailyRevenue: number | null;   // güncel ortalama
  avgOrderValue: number | null;
  stockQty: number | null;
  coverDays: number | null;
  dailyHoldingCost: number | null;  // birim×gün tutma maliyeti (varsa)
  adSpend30d: number | null;
  attributedRevenue30d: number | null;
  orderCount30d: number | null;
  grossMarginPct: number | null;
  supplierCount?: number | null;
}

export interface SimulationParams {
  // PRICING
  priceDeltaPct?: number;
  elasticityPctPerPct?: number | null; // boş → sabit talep (etiketli)
  demandRangePct?: { down: number; up: number } | null; // kullanıcı aralığı
  // SALES
  demandDeltaPct?: number;
  avgOrderValueDeltaPct?: number;
  // PROCUREMENT
  quantityDeltaPct?: number;
  unitCostDeltaPct?: number;
  leadTimeDeltaDays?: number;
  orderQty?: number | null;
  // MARKETING
  budgetDeltaPct?: number;
  expectedRoas?: number | null;
  // INVENTORY
  targetCoverDays?: number;
  holdingCostPctYear?: number;
  // FINANCIAL
  budgetDelta?: number;
  expectedReturnPct?: number | null;
}

export interface ScenarioMetrics {
  netSales: number | null;
  grossProfit: number | null;
  contributionProfit: number | null;
  contributionMarginPct: number | null;
  estimatedStockQty?: number | null;
  stockoutRiskScore?: number | null;   // 0-100 (düşük = risk düşük)
  procurementCost?: number | null;
  cashNeed?: number | null;
  roiPct?: number | null;
  riskScore?: number | null;
  holdingCost?: number | null;
  paybackDays?: number | null;
}

export interface ScenarioResult {
  category: SimulationCategory;
  baseline: ScenarioMetrics;
  expected: ScenarioMetrics;
  /** Kullanıcı aralığı veya açıkça etiketlenmiş varsayımsal aralık */
  best: ScenarioMetrics | null;
  worst: ScenarioMetrics | null;
  bestCaseLabel: string | null;
  worstCaseLabel: string | null;
  financialImpact: { revenueDelta: number | null; profitDelta: number | null; marginDeltaPct: number | null; cashDelta: number | null };
  riskScore: number | null;
  confidence: number | null;
  dataCoverage: number | null;
  assumptions: string[];
  isAssumptionBasedInterval: boolean;
  algorithmVersion: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

const EPS = 1e-9;
const r2 = (n: number) => Number(n.toFixed(2));
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Parametre doğrulama + iş kuralları (sınır dışı → hata; sessiz düzeltme YOK). */
export function validateParams(category: SimulationCategory, p: SimulationParams): ValidationResult {
  const errors: string[] = [];
  switch (category) {
    case "PRICING":
      if (p.priceDeltaPct == null || !Number.isFinite(p.priceDeltaPct)) errors.push("priceDeltaPct zorunludur (%).");
      else if (Math.abs(p.priceDeltaPct) > 60) errors.push("priceDeltaPct ±%60'ı aşamaz (iş kuralı).");
      if (p.elasticityPctPerPct != null && (Math.abs(p.elasticityPctPerPct) > 5)) errors.push("elasticityPctPerPct ∈ [−5, +5] aralığında olmalı.");
      if (p.demandRangePct != null) {
        if (!(p.demandRangePct.down >= 0 && p.demandRangePct.up >= 0)) errors.push("demandRangePct değerleri ≥ 0 olmalı.");
        if (p.demandRangePct.down > 100 || p.demandRangePct.up > 100) errors.push("demandRangePct en fazla 100 olabilir.");
      }
      break;
    case "SALES":
      if (p.demandDeltaPct == null || !Number.isFinite(p.demandDeltaPct)) errors.push("demandDeltaPct zorunludur (%).");
      else if (Math.abs(p.demandDeltaPct) > 80) errors.push("demandDeltaPct ±%80'i aşamaz (iş kuralı).");
      if (p.avgOrderValueDeltaPct != null && Math.abs(p.avgOrderValueDeltaPct) > 50) errors.push("avgOrderValueDeltaPct ±%50'yi aşamaz.");
      break;
    case "PROCUREMENT":
      if (p.quantityDeltaPct != null && Math.abs(p.quantityDeltaPct) > 500) errors.push("quantityDeltaPct ±%500'ü aşamaz.");
      if (p.unitCostDeltaPct != null && Math.abs(p.unitCostDeltaPct) > 80) errors.push("unitCostDeltaPct ±%80'i aşamaz.");
      if (p.leadTimeDeltaDays != null && Math.abs(p.leadTimeDeltaDays) > 90) errors.push("leadTimeDeltaDays ±90 günü aşamaz.");
      if (p.orderQty != null && p.orderQty < 0) errors.push("orderQty negatif olamaz.");
      break;
    case "MARKETING":
      if (p.budgetDeltaPct == null || !Number.isFinite(p.budgetDeltaPct)) errors.push("budgetDeltaPct zorunludur (%).");
      else if (Math.abs(p.budgetDeltaPct) > 300) errors.push("budgetDeltaPct ±%300'ü aşamaz.");
      if (p.expectedRoas != null && p.expectedRoas < 0) errors.push("expectedRoas negatif olamaz.");
      break;
    case "INVENTORY":
      if (p.targetCoverDays == null || !Number.isFinite(p.targetCoverDays)) errors.push("targetCoverDays zorunludur (gün).");
      else if (p.targetCoverDays < 1 || p.targetCoverDays > 365) errors.push("targetCoverDays 1-365 gün arasında olmalı.");
      if (p.holdingCostPctYear != null && (p.holdingCostPctYear < 0 || p.holdingCostPctYear > 100)) errors.push("holdingCostPctYear 0-100 arasında olmalı.");
      break;
    case "FINANCIAL":
      if (p.budgetDelta == null || !Number.isFinite(p.budgetDelta)) errors.push("budgetDelta zorunludur (TL).");
      if (p.expectedReturnPct != null && Math.abs(p.expectedReturnPct) > 200) errors.push("expectedReturnPct ±%200'ü aşamaz.");
      break;
  }
  return { ok: errors.length === 0, errors };
}

// ---------- Kategori hesaplamaları ----------

function pricingSim(b: SimulationBaseline, p: SimulationParams, elasticity: number | null): { expected: ScenarioMetrics; assumptions: string[] } {
  const assumptions: string[] = [];
  if (b.price == null || b.dailyUnits == null) {
    return { expected: emptyMetrics(), assumptions: ["Fiyat/satış adedi verisi yok — senaryo hesaplanamadı."] };
  }
  const d = (p.priceDeltaPct as number) / 100;
  const el = elasticity ?? 0;
  if (elasticity == null) assumptions.push("Esneklik verisi yok — talep sabit varsayıldı (etiketli varsayım).");
  else assumptions.push(`Esneklik ${elasticity} %/% (yönetici girişi veya varsayım).`);
  const newPrice = b.price * (1 + d);
  const newDaily = Math.max(0, b.dailyUnits * (1 + (el * (p.priceDeltaPct as number)) / 100));
  const varCost = b.variableCost ?? 0;
  const unitCost = b.unitCost ?? 0;
  const expected = metricsFrom(newPrice, newDaily, unitCost, varCost, b.periodDays);
  return { expected, assumptions };
}

function salesSim(b: SimulationBaseline, p: SimulationParams): { expected: ScenarioMetrics; assumptions: string[] } {
  const assumptions: string[] = [];
  if (b.dailyUnits == null || b.price == null) return { expected: emptyMetrics(), assumptions: ["Satış/fiyat verisi yok — senaryo hesaplanamadı."] };
  const d = (p.demandDeltaPct as number) / 100;
  const aovD = (p.avgOrderValueDeltaPct ?? 0) / 100;
  const varCost = b.variableCost ?? 0;
  const unitCost = b.unitCost ?? 0;
  const newDaily = Math.max(0, b.dailyUnits * (1 + d));
  const newPrice = b.price * (1 + aovD);
  if (p.avgOrderValueDeltaPct) assumptions.push(`Sepet/ortalama sipariş değeri %${p.avgOrderValueDeltaPct} değişiyor (varsayım).`);
  const expected = metricsFrom(newPrice, newDaily, unitCost, varCost, b.periodDays);
  return { expected, assumptions };
}

function procurementSim(b: SimulationBaseline, p: SimulationParams): { expected: ScenarioMetrics; assumptions: string[] } {
  const assumptions: string[] = [];
  if (b.dailyUnits == null) return { expected: emptyMetrics(), assumptions: ["Satış hızı verisi yok — senaryo hesaplanamadı."] };
  const daily = b.dailyUnits;
  const qtyDelta = 1 + (p.quantityDeltaPct ?? 0) / 100;
  const costDelta = 1 + (p.unitCostDeltaPct ?? 0) / 100;
  const orderQty = p.orderQty ?? Math.max(0, daily * b.periodDays * qtyDelta);
  const unitCost = (b.unitCost ?? 0) * costDelta;
  const procurementCost = r2(orderQty * unitCost);
  const cashNeed = procurementCost;
  const price = b.price ?? 0;
  const varCost = b.variableCost ?? 0;
  const revenue = price > 0 ? r2(price * orderQty) : null;
  const profit = price > 0 ? r2((price - unitCost - varCost) * orderQty) : null;
  const margin = price > 0 ? ((price - unitCost - varCost) / price) * 100 : null;
  const stockoutRisk = p.leadTimeDeltaDays && p.leadTimeDeltaDays > 0 ? clamp(50 + p.leadTimeDeltaDays * 2, 0, 100) : 30;
  if (p.leadTimeDeltaDays) assumptions.push(`Tedarik süresi ${p.leadTimeDeltaDays > 0 ? "+" : ""}${p.leadTimeDeltaDays} gün (varsayımsal gecikme).`);
  if (p.unitCostDeltaPct) assumptions.push(`Alış fiyatı %${p.unitCostDeltaPct} değişiyor.`);
  return {
    expected: {
      ...emptyMetrics(),
      netSales: revenue,
      grossProfit: profit,
      contributionProfit: profit,
      contributionMarginPct: margin != null ? r2(margin) : null,
      estimatedStockQty: r2(orderQty),
      stockoutRiskScore: stockoutRisk,
      procurementCost,
      cashNeed,
      riskScore: p.unitCostDeltaPct && p.unitCostDeltaPct > 20 ? 55 : 35,
    },
    assumptions,
  };
}

function marketingSim(b: SimulationBaseline, p: SimulationParams): { expected: ScenarioMetrics; assumptions: string[] } {
  const assumptions: string[] = [];
  const spend30 = b.adSpend30d;
  if (spend30 == null || !Number.isFinite(spend30)) return { expected: emptyMetrics(), assumptions: ["Reklam harcaması verisi yok — senaryo hesaplanamadı."] };
  const d = (p.budgetDeltaPct as number) / 100;
  const newMonthlySpend = spend30 * (1 + d);
  const roas = p.expectedRoas ?? (b.attributedRevenue30d != null && spend30 > 0 ? b.attributedRevenue30d / spend30 : null);
  if (p.expectedRoas == null) assumptions.push(roas != null ? `Atfedilen ROAS (${r2(roas)}) korunur varsayılır.` : "ROAS verisi yok — gelir etkisi hesaplanamadı.");
  if (p.expectedRoas != null) assumptions.push(`Beklenen ROAS ${p.expectedRoas} (yönetici girişi).`);
  assumptions.push("Delta = atfedilen ciro/kâr değişimi (mevcut 30g atfedilen × dönem ölçeği baz alınarak); mağaza geneliyle karşılaştırılmaz.");
  const attributedRevenue = roas != null ? r2(newMonthlySpend * roas) : null;
  const profitDelta = attributedRevenue != null ? r2(attributedRevenue - newMonthlySpend) : null;
  const spendDelta = r2(newMonthlySpend - spend30);
  const periodScale = b.periodDays / 30;
  return {
    expected: {
      ...emptyMetrics(),
      netSales: attributedRevenue != null ? r2(attributedRevenue * periodScale) : null,
      grossProfit: profitDelta != null ? r2(profitDelta * periodScale) : null,
      contributionProfit: profitDelta != null ? r2(profitDelta * periodScale) : null,
      cashNeed: r2(newMonthlySpend * periodScale),
      roiPct: spendDelta > 0 && attributedRevenue != null ? r2(((attributedRevenue - newMonthlySpend) / Math.max(1, spendDelta)) * 100) : null,
      riskScore: roas != null && roas < 1 ? 65 : 35,
    },
    assumptions,
  };
}

function inventorySim(b: SimulationBaseline, p: SimulationParams): { expected: ScenarioMetrics; assumptions: string[] } {
  const assumptions: string[] = [];
  if (b.dailyUnits == null) return { expected: emptyMetrics(), assumptions: ["Satış hızı verisi yok — senaryo hesaplanamadı."] };
  const target = p.targetCoverDays as number;
  const targetStock = Math.max(0, b.dailyUnits * target);
  const currentStock = b.stockQty ?? 0;
  const delta = targetStock - currentStock;
  const unitCost = b.unitCost ?? 0;
  const holdingPctYear = p.holdingCostPctYear ?? 25;
  const holdingCost = r2((targetStock * unitCost * holdingPctYear) / 100 / 12 * (b.periodDays / 30));
  const cashNeed = delta > 0 ? r2(delta * unitCost) : 0;
  if (delta > 0) assumptions.push(`${r2(delta)} adet ilave stok — ${r2(cashNeed)} TL nakit ihtiyacı.`);
  else assumptions.push(`${r2(-delta)} adet stok azaltımı — nakit serbest kalır.`);
  if (!p.holdingCostPctYear) assumptions.push("Yıllık tutma maliyeti %25 varsayıldı (varsayım — sektör ortalaması).");
  const stockout = target < (b.coverDays ?? 14) ? clamp(50 + (target - (b.coverDays as number)) * 3, 5, 95) : 20;
  return {
    expected: {
      ...emptyMetrics(),
      estimatedStockQty: r2(targetStock),
      stockoutRiskScore: stockout,
      cashNeed,
      holdingCost,
      riskScore: stockout > 60 ? 60 : 30,
    },
    assumptions,
  };
}

function financialSim(b: SimulationBaseline, p: SimulationParams): { expected: ScenarioMetrics; assumptions: string[] } {
  const assumptions: string[] = [];
  const delta = p.budgetDelta as number;
  const ret = p.expectedReturnPct ?? null;
  if (ret == null) assumptions.push("Getiri oranı verisi yok — yalnız nakit etkisi raporlanır (uydurma yok).");
  else assumptions.push(`Beklenen getiri %${ret} (yönetici girişi).`);
  assumptions.push("Delta = yatırımın kendi vadesi içindeki getirisi; mağaza kârlılığına ek yatırım getirisi — mevcut kârla çıkarılmaz.");
  const profit = ret != null ? r2((delta * ret) / 100) : null;
  return {
    expected: {
      ...emptyMetrics(),
      cashNeed: r2(delta),
      contributionProfit: profit,
      grossProfit: profit,
      roiPct: ret,
      riskScore: Math.abs(delta) > 100000 ? 55 : 30,
      paybackDays: ret != null && ret > 0 ? r2((100 / ret) * 30) : null,
    },
    assumptions,
  };
}

function emptyMetrics(): ScenarioMetrics {
  return {
    netSales: null, grossProfit: null, contributionProfit: null, contributionMarginPct: null,
    estimatedStockQty: null, stockoutRiskScore: null, procurementCost: null, cashNeed: null,
    roiPct: null, riskScore: null, holdingCost: null, paybackDays: null,
  };
}

function metricsFrom(price: number, daily: number, unitCost: number, varCost: number, periodDays: number): ScenarioMetrics {
  const netSales = r2(price * daily * periodDays);
  const grossProfit = r2((price - unitCost) * daily * periodDays);
  const contributionProfit = r2((price - unitCost - varCost) * daily * periodDays);
  const contributionMarginPct = price > EPS ? r2(((price - unitCost - varCost) / price) * 100) : null;
  return {
    ...emptyMetrics(),
    netSales,
    grossProfit,
    contributionProfit,
    contributionMarginPct,
    riskScore: 35,
  };
}

function scenarioForBand(base: SimulationParams, category: SimulationCategory, band: "down" | "up", down: number, up: number): SimulationParams {
  const out = { ...base };
  if (category === "PRICING") out.demandRangePct = { down: band === "down" ? down : 0, up: band === "up" ? up : 0 };
  if (category === "SALES") out.demandDeltaPct = (band === "down" ? -down : up) + (base.demandDeltaPct ?? 0);
  if (category === "PROCUREMENT") out.unitCostDeltaPct = base.unitCostDeltaPct != null ? base.unitCostDeltaPct + (band === "down" ? down : -up) : (band === "down" ? down : -up);
  if (category === "MARKETING") out.expectedRoas = base.expectedRoas != null ? base.expectedRoas * (band === "up" ? 1 + up / 100 : 1 - down / 100) : null;
  return out;
}

/**
 * Senaryoyu çalıştırır. Best/Worst için kullanıcı aralığı (demandRangePct vb.)
 * varsa ondan, yoksa açıkça etiketlenmiş VARSAYIMSAL ±10% bandından üretir.
 */
export function runScenario(category: SimulationCategory, baseline: SimulationBaseline, params: SimulationParams): ScenarioResult {
  const validation = validateParams(category, params);
  if (!validation.ok) {
    throw new Error(`Senaryo parametreleri geçersiz: ${validation.errors.join(" ")}`);
  }
  const assumptions: string[] = [`Analiz dönemi ${baseline.periodDays} gündür; gerçek kayıtlar değişmez.`];
  const isUserInterval = params.demandRangePct != null;

  const elasticity = params.elasticityPctPerPct ?? null;
  const baseRun = ((): { expected: ScenarioMetrics; assumptions: string[] } => {
    switch (category) {
      case "PRICING": return pricingSim(baseline, params, elasticity);
      case "SALES": return salesSim(baseline, params);
      case "PROCUREMENT": return procurementSim(baseline, params);
      case "MARKETING": return marketingSim(baseline, params);
      case "INVENTORY": return inventorySim(baseline, params);
      case "FINANCIAL": return financialSim(baseline, params);
    }
  })();
  assumptions.push(...baseRun.assumptions);

  // Baseline (mevcut durum) metrikleri
  const baselineMetrics: ScenarioMetrics = ((): ScenarioMetrics => {
    if (baseline.price != null && baseline.dailyUnits != null) {
      const varCost = baseline.variableCost ?? 0;
      const unitCost = baseline.unitCost ?? 0;
      return {
        ...metricsFrom(baseline.price, baseline.dailyUnits, unitCost, varCost, baseline.periodDays),
        estimatedStockQty: baseline.stockQty ?? null,
        stockoutRiskScore: baseline.coverDays != null && baseline.coverDays < 7 ? 70 : 20,
        cashNeed: 0,
      };
    }
    return emptyMetrics();
  })();

  // Best / Worst
  let best: ScenarioMetrics | null = null;
  let worst: ScenarioMetrics | null = null;
  let bestCaseLabel: string | null = null;
  let worstCaseLabel: string | null = null;
  const userDown = params.demandRangePct?.down ?? 10;
  const userUp = params.demandRangePct?.up ?? 10;
  const intervalNote = isUserInterval ? "kullanıcı aralığı" : "VARSAYIMSAL ±10% bant (etiketli — gerçek dağılım değil)";

  if (category === "PRICING" || category === "SALES") {
    if (baseline.dailyUnits != null && baseline.price != null) {
      const el = elasticity ?? 0;
      const mk = (demandShiftPct: number): ScenarioMetrics => {
        const unitCost = baseline.unitCost ?? 0;
        const varCost = baseline.variableCost ?? 0;
        const price = baseline.price as number;
        const dailyUnits = baseline.dailyUnits as number;
        if (category === "PRICING") {
          const d = (params.priceDeltaPct as number) / 100;
          const newPrice = price * (1 + d);
          const newDaily = Math.max(0, dailyUnits * (1 + (el * (params.priceDeltaPct as number)) / 100 + demandShiftPct / 100));
          return metricsFrom(newPrice, newDaily, unitCost, varCost, baseline.periodDays);
        }
        const aovD = (params.avgOrderValueDeltaPct ?? 0) / 100;
        const newDaily = Math.max(0, dailyUnits * (1 + (params.demandDeltaPct as number) / 100 + demandShiftPct / 100));
        return metricsFrom(price * (1 + aovD), newDaily, unitCost, varCost, baseline.periodDays);
      };
      best = mk(userUp);
      worst = mk(-userDown);
      bestCaseLabel = `En iyi durum — ${intervalNote}`;
      worstCaseLabel = `En kötü durum — ${intervalNote}`;
    }
  } else if (category === "PROCUREMENT") {
    best = { ...baseRun.expected, riskScore: 20, stockoutRiskScore: 15 };
    worst = { ...baseRun.expected, riskScore: 70, stockoutRiskScore: 75 };
    bestCaseLabel = `En iyi durum — tedarik gecikmez, maliyet sapmaz (${intervalNote})`;
    worstCaseLabel = `En kötü durum — ${params.leadTimeDeltaDays ?? 0}g ek gecikme + maliyet sapması (${intervalNote})`;
  } else if (category === "MARKETING") {
    const roasBase = p_expectedRoas(params, baseline);
    if (roasBase != null && baseline.adSpend30d != null) {
      const spend30 = baseline.adSpend30d * (1 + (params.budgetDeltaPct as number) / 100);
      const mk = (roas: number) => {
        const rev = r2(spend30 * roas);
        return {
          ...emptyMetrics(),
          netSales: r2(rev * (baseline.periodDays / 30)),
          contributionProfit: r2((rev - spend30) * (baseline.periodDays / 30)),
          cashNeed: r2(spend30 * (baseline.periodDays / 30)),
          roiPct: r2(((rev - spend30) / Math.max(1, spend30)) * 100),
          riskScore: roas < 1 ? 70 : 30,
        };
      };
      best = mk(roasBase * 1.2);
      worst = mk(Math.max(0.2, roasBase * 0.8));
      bestCaseLabel = `En iyi durum — ROAS %20 üzeri (${intervalNote})`;
      worstCaseLabel = `En kötü durum — ROAS %20 altı (${intervalNote})`;
    }
  } else if (category === "INVENTORY" || category === "FINANCIAL") {
    best = { ...baseRun.expected };
    worst = { ...baseRun.expected };
    bestCaseLabel = "En iyi durum — hedef planı sorunsuz gerçekleşir";
    worstCaseLabel = "En kötü durum — stok/nakit ihtiyacı gerçekleşir, getiri gecikir";
  }

  const confidence = ((): number | null => {
    let pts = 0;
    let total = 0;
    if (baseline.price != null) { pts++; total++; }
    if (baseline.dailyUnits != null) { pts++; total++; }
    if (baseline.unitCost != null) { pts++; total++; }
    if (baseline.avgDailyRevenue != null) { pts++; total++; }
    return total ? Math.round((pts / total) * 100) : null;
  })();
  const dataCoverage = confidence; // taban kapsama = temel metriklerin doluluğu

  // Delta semantiği kategoriye göre değişir — elmayla elmayı karşılaştırmak için:
  // MARKETING: delta = ATFEDİLEN ciro/kârın değişimi (beklenen − mevcut 30g atfedilen × dönem ölçeği), mağaza geneliyle değil.
  // FINANCIAL: delta yok — yatırımın kendi getirisi reported edilir (mağaza kârlılığıyla karşılaştırılamaz).
  const periodScaleMk = baseline.periodDays / 30;
  const attrRevScaled = category === "MARKETING" && baseline.attributedRevenue30d != null ? r2(baseline.attributedRevenue30d * periodScaleMk) : null;
  const attrProfitScaled = category === "MARKETING" && baseline.attributedRevenue30d != null && baseline.adSpend30d != null
    ? r2((baseline.attributedRevenue30d - baseline.adSpend30d) * periodScaleMk) : null;
  const netBaseline = category === "MARKETING" ? attrRevScaled : category === "FINANCIAL" ? null : baselineMetrics.netSales;
  const profitBaseline = category === "MARKETING" ? attrProfitScaled : category === "FINANCIAL" ? null : baselineMetrics.contributionProfit;
  const revenueDelta = baseRun.expected.netSales != null && netBaseline != null ? r2(baseRun.expected.netSales - netBaseline) : null;
  const profitDelta = baseRun.expected.contributionProfit != null && profitBaseline != null
    ? r2(baseRun.expected.contributionProfit - profitBaseline)
    : (category === "FINANCIAL" ? (baseRun.expected.contributionProfit ?? null) : null);
  const marginDelta = baseRun.expected.contributionMarginPct != null && baselineMetrics.contributionMarginPct != null
    ? r2(baseRun.expected.contributionMarginPct - baselineMetrics.contributionMarginPct)
    : null;
  const cashDelta = baseRun.expected.cashNeed ?? null;

  return {
    category,
    baseline: baselineMetrics,
    expected: baseRun.expected,
    best,
    worst,
    bestCaseLabel,
    worstCaseLabel,
    financialImpact: { revenueDelta, profitDelta, marginDeltaPct: marginDelta, cashDelta },
    riskScore: baseRun.expected.riskScore ?? null,
    confidence,
    dataCoverage,
    assumptions,
    isAssumptionBasedInterval: !isUserInterval,
    algorithmVersion: SCENARIO_ALGORITHM_VERSION,
  };
}

function p_expectedRoas(p: SimulationParams, b: SimulationBaseline): number | null {
  if (p.expectedRoas != null) return p.expectedRoas;
  if (b.attributedRevenue30d != null && b.adSpend30d != null && b.adSpend30d > 0) return b.attributedRevenue30d / b.adSpend30d;
  return null;
}
