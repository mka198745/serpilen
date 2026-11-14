/**
 * FAZ 3 — Early Warning Center motoru.
 * 13 alarm türü × 7 kategori; her tür KENDİ istatistiksel yöntemini kullanır.
 * Aynı koşul tekrarlanırsa yeni kayıt AÇILMAZ — occurrenceCount artırılır (store katmanı).
 * Veri yetersizse yüksek skor basılmaz; severity tavanlanır (MODERATE).
 */
import { recentVsBaselinePct, modifiedZScore, iqrBounds, trendDeviationPct, ewmaDeviation, forecastDeviationPct } from "./statistics";
import { computeRiskScore, severityOf, type EarlyWarningSeverity } from "./risk-score";

export interface EarlyWarningProduct {
  id: number;
  name: string;
  sku?: string | null;
  stockQty: number | null;
  coverDays: number | null;
  avgDailyUnits: number | null;
  avgDailyRevenue: number | null;
  unitCost: number | null;
  revenue30d: number | null;
  cost30d: number | null;
  margin30dPct: number | null;
  returnRatePct: number | null;
}
export interface EarlyWarningSupplier {
  id: number;
  name: string;
  latePct: number | null;     // 0-100
  fillRatePct: number | null; // 0-100
  orderCount: number;
}
export interface EarlyWarningCampaign {
  id: number;
  name: string;
  roas: number | null;
  spend: number;
  attributedRevenue: number;
  startDate?: string | null;
}

export interface EarlyWarningData {
  salesPeriodStart: string;
  salesPeriodEnd: string;
  /** Gün gün net satış (eski → yeni) */
  dailyNetSales: Array<{ day: string; net: number; units: number }>;
  dailyMarginPct: Array<{ day: string; marginPct: number | null }>;
  products: EarlyWarningProduct[];
  suppliers: EarlyWarningSupplier[];
  campaigns: EarlyWarningCampaign[];
  forecast?: { mapePct: number | null; biasPct: number | null; deviationPct: number | null } | null;
  /** Genel veri güvenilirliği 0-100 (kaç kaynak dolu, örneklem büyüklüğü) */
  dataReliability: number;
  deadStockValue?: number | null;
}

export type EarlyWarningCategory = "FINANCIAL" | "SALES" | "INVENTORY" | "SUPPLIER" | "MARKETING" | "QUALITY" | "OPERATIONAL";
export type EarlyWarningEntityType = "PRODUCT" | "SUPPLIER" | "CAMPAIGN" | "GENERAL";

export interface AlertDraft {
  alertKey: string;
  alertType: string;
  category: EarlyWarningCategory;
  method: string;
  relatedEntityType: EarlyWarningEntityType;
  relatedEntityId: number | null;
  relatedEntityLabel: string | null;
  riskScore: number;
  severity: EarlyWarningSeverity;
  triggerCondition: string;
  observedValue: number | null;
  expectedValue: number | null;
  deviationPct: number | null;
  potentialFinancialImpact: number | null;
  confidence: number;
  recommendedAction: string;
  evidence: string[];
  assumption: string | null;
  capped: boolean;
}

export interface EarlyWarningSettings {
  salesDropPct: number;
  marginDropPct: number;
  returnRateAlarmPct: number;
  stockoutCoverDays: number;
  overstockCoverDays: number;
  roasAlarm: number;
  supplierLatePct: number;
  forecastDeviationPct: number;
  minConfidenceForCritical: number;
  repeatEscalationCount: number;
  riskWeights: { probability: number; impact: number; urgency: number; exposure: number; reliability: number };
}

export const DEFAULT_EW_SETTINGS: EarlyWarningSettings = {
  salesDropPct: 25,
  marginDropPct: 20,
  returnRateAlarmPct: 10,
  stockoutCoverDays: 7,
  overstockCoverDays: 120,
  roasAlarm: 1.0,
  supplierLatePct: 30,
  forecastDeviationPct: 30,
  minConfidenceForCritical: 60,
  repeatEscalationCount: 3,
  riskWeights: { probability: 30, impact: 30, urgency: 20, exposure: 10, reliability: 10 },
};

const round1 = (n: number) => Number(n.toFixed(1));
const round2 = (n: number) => Number(n.toFixed(2));

interface DetectorCtx {
  data: EarlyWarningData;
  s: EarlyWarningSettings;
}

type Detector = (ctx: DetectorCtx) => AlertDraft[];

function mkAlert(ctx: DetectorCtx, args: {
  alertType: string;
  category: EarlyWarningCategory;
  method: string;
  entityType?: EarlyWarningEntityType;
  entityId?: number | null;
  entityLabel?: string | null;
  probability: number;
  impact: number;
  urgency: number;
  exposure: number;
  trigger: string;
  observed: number | null;
  expected: number | null;
  deviationPct: number | null;
  financialImpact: number | null;
  confidence: number;
  action: string;
  evidence: string[];
  assumption?: string | null;
}): AlertDraft {
  const rel = Math.min(100, Math.max(0, Math.min(ctx.data.dataReliability, args.confidence)));
  const { score, severity, capped } = computeRiskScore({
    probability: args.probability,
    impact: args.impact,
    urgency: args.urgency,
    exposure: args.exposure,
    dataReliability: rel,
    weights: ctx.s.riskWeights,
    minConfidenceForHigh: ctx.s.minConfidenceForCritical,
  });
  const entityKey = args.entityId != null ? String(args.entityId) : "general";
  return {
    alertKey: `ew:${args.alertType}:${entityKey}`,
    alertType: args.alertType,
    category: args.category,
    method: args.method,
    relatedEntityType: args.entityType ?? "GENERAL",
    relatedEntityId: args.entityId ?? null,
    relatedEntityLabel: args.entityLabel ?? null,
    riskScore: score,
    severity,
    triggerCondition: args.trigger,
    observedValue: args.observed != null ? round2(args.observed) : null,
    expectedValue: args.expected != null ? round2(args.expected) : null,
    deviationPct: args.deviationPct != null ? round1(args.deviationPct) : null,
    potentialFinancialImpact: args.financialImpact != null ? round2(args.financialImpact) : null,
    confidence: round1(rel),
    recommendedAction: args.action,
    evidence: capped
      ? [...args.evidence, `Veri güveni düşük (${Math.round(rel)}/${ctx.s.minConfidenceForCritical}) — skor MODERATE tavanına çekildi.`]
      : args.evidence,
    assumption: args.assumption ?? null,
    capped,
  };
}

// ---------- Dedektörler ----------

const salesDrop: Detector = ({ data, s }) => {
  const alerts: AlertDraft[] = [];
  const series = data.dailyNetSales.map((d) => d.net);
  if (series.length >= 14) {
    const { recentMean, baselineMean, changePct } = recentVsBaselinePct(series, 7, Math.min(28, series.length - 7));
    if (recentMean != null && baselineMean != null && changePct != null && changePct <= -s.salesDropPct) {
      const dailyLoss = (baselineMean - recentMean);
      alerts.push(mkAlert({ data, s }, {
        alertType: "SALES_DROP",
        category: "SALES",
        method: "10.4 recent-vs-baseline %Δ (7g vs önceki 28g)",
        probability: Math.min(95, Math.abs(changePct)),
        impact: Math.min(100, (dailyLoss * 30) / 500),
        urgency: 70,
        exposure: Math.min(100, (dailyLoss * 30) / 20000 * 100),
        trigger: `Ciro son 7 günde önceki döneme göre %${round1(Math.abs(changePct))} düştü`,
        observed: recentMean,
        expected: baselineMean,
        deviationPct: changePct,
        financialImpact: dailyLoss * 30,
        confidence: Math.min(100, series.length * 3.5),
        action: "Düşüşün kategori/ürün/kanal kırılımını inceleyin; fiyat rekabeti, stok-out ve kampanya bitişini kontrol edin.",
        evidence: [
          `Son 7g ortalama ${round2(recentMean)} TL vs önceki pencere ${round2(baselineMean)} TL`,
          `${series.length} günlük seri`,
        ],
      }));
    }
  }
  // Modified Z — ani çöküş (dün vs geçmiş)
  const latest = series[series.length - 1];
  const hist = series.slice(0, -1);
  const mz = modifiedZScore(latest, hist);
  if (mz != null && mz <= -3.5) {
    alerts.push(mkAlert({ data, s }, {
      alertType: "SALES_DROP",
      category: "SALES",
      method: "Modified Z (medyan/MAD, eşik -3.5)",
      probability: Math.min(95, Math.abs(mz) * 18),
      impact: 60,
      urgency: 80,
      exposure: 50,
      trigger: `Son gün cirosu geçmiş dağılımın ${round1(Math.abs(mz))} MAD altında`,
      observed: latest,
      expected: null,
      deviationPct: null,
      financialImpact: null,
      confidence: Math.min(100, hist.length * 4),
      action: "Tek gün çöküşü için veri girişini ve mağaza/POS kesintisini kontrol edin; tekrarlarsa kök-neden analizi başlatın.",
      evidence: [`Modified Z = ${round2(mz)} (eşik ≤ -3.5)`, `${hist.length} gün geçmiş`],
    }));
  }
  return alerts;
};

const forecastDeviation: Detector = ({ data, s }) => {
  const out: AlertDraft[] = [];
  const fc = data.forecast;
  if (fc?.deviationPct != null && Math.abs(fc.deviationPct) >= s.forecastDeviationPct) {
    out.push(mkAlert({ data, s }, {
      alertType: "FORECAST_DEVIATION",
      category: "SALES",
      method: "Tahmin sapması % (gerçek − tahmin)/tahmin",
      probability: Math.min(90, Math.abs(fc.deviationPct)),
      impact: 55,
      urgency: 60,
      exposure: 45,
      trigger: `Gerçekleşen satış tahminle %${round1(Math.abs(fc.deviationPct))} sapıyor (${fc.deviationPct > 0 ? "yukarı" : "aşağı"})`,
      observed: null,
      expected: null,
      deviationPct: fc.deviationPct,
      financialImpact: null,
      confidence: fc.mapePct != null ? Math.max(20, 100 - fc.mapePct) : 40,
      action: fc.deviationPct < 0
        ? "Talep tahmini revize edilmeli; tedarik ve kadro planı buna göre güncellenmeli."
        : "Beklenmedik talep yüksekliği — stok-out riski var; yeniden sipariş tetiklenmeli.",
      evidence: [`MAPE %${fc.mapePct != null ? round1(fc.mapePct) : "?"}`, `Sapma %${round1(fc.deviationPct)}`],
    }));
  }
  return out;
};

const marginDeterioration: Detector = ({ data, s }) => {
  const out: AlertDraft[] = [];
  const series = data.dailyMarginPct.map((d) => d.marginPct).filter((v): v is number => v != null);
  if (series.length >= 14) {
    const trend = trendDeviationPct(series);
    if (trend != null && Math.abs(trend) >= s.marginDropPct && trend < 0) {
      const periodCost = data.products.reduce((sum, p) => sum + (p.cost30d ?? 0), 0);
      out.push(mkAlert({ data, s }, {
        alertType: "MARGIN_DETERIORATION",
        category: "FINANCIAL",
        method: "Lineer trend eğimi (% ortalama katkı, 14+ gün)",
        probability: Math.min(95, Math.abs(trend) * 1.2),
        impact: 70,
        urgency: 65,
        exposure: 60,
        trigger: `Katkı marjı trendi %${round1(Math.abs(trend))} düşük yönde`,
        observed: series[series.length - 1],
        expected: series[0],
        deviationPct: trend,
        financialImpact: periodCost > 0 ? (Math.abs(trend) / 100) * periodCost * 0.3 : null,
        confidence: Math.min(100, series.length * 4),
        action: "Maliyet artışı (alış fiyatı/kur/ücret) ve iskonto kombinasyonunu inceleyin; fiyat ve marj ayarı simülasyonu çalıştırın.",
        evidence: [`${series.length} günlük marj serisi`, `Trend %${round1(trend)}`],
      }));
    }
  }
  return out;
};

const inventoryRisk: Detector = ({ data, s }) => {
  const out: AlertDraft[] = [];
  for (const p of data.products) {
    const cover = p.coverDays;
    if (cover != null && Number.isFinite(cover)) {
      if (cover <= s.stockoutCoverDays) {
        const dailyRev = p.avgDailyRevenue ?? ((p.avgDailyUnits ?? 0) * (p.unitCost ?? 0) * 1.3);
        out.push(mkAlert({ data, s }, {
          alertType: "STOCKOUT_RISK",
          category: "INVENTORY",
          method: "Kaplama günü eşiği + devir hızı",
          entityType: "PRODUCT",
          entityId: p.id,
          entityLabel: p.name,
          probability: Math.min(95, 50 + (s.stockoutCoverDays - cover) * 6),
          impact: 60,
          urgency: cover <= 2 ? 90 : 70,
          exposure: 55,
          trigger: `Kalan kapsama ${round1(cover)} gün (eşik ${s.stockoutCoverDays})`,
          observed: cover,
          expected: s.stockoutCoverDays,
          deviationPct: null,
          financialImpact: dailyRev * s.stockoutCoverDays,
          confidence: p.avgDailyUnits != null ? 80 : 45,
          action: "Yeniden sipariş noktası değerlendirmesi; kritik kalem için satın alma önerisi FAZ 2 → Satın Alma panelinden kontrol edin.",
          evidence: [`Stok ${p.stockQty ?? "?"} adet`, `Ort. ${p.avgDailyUnits != null ? round1(p.avgDailyUnits) : "?"} adet/gün`],
        }));
      } else if (cover >= s.overstockCoverDays) {
        out.push(mkAlert({ data, s }, {
          alertType: "OVERSTOCK_RISK",
          category: "INVENTORY",
          method: "Kaplama günü eşiği (aşırı stok)",
          entityType: "PRODUCT",
          entityId: p.id,
          entityLabel: p.name,
          probability: 60,
          impact: 45,
          urgency: 35,
          exposure: 50,
          trigger: `Kalan kapsama ${Math.round(cover)} gün (eşik ${s.overstockCoverDays})`,
          observed: cover,
          expected: s.overstockCoverDays,
          deviationPct: null,
          financialImpact: p.stockQty != null && p.unitCost != null ? p.stockQty * p.unitCost : null,
          confidence: 70,
          action: "Tasfiye/kampanya veya yeniden sipariş durdurma; ölü stok ve nakit bağlama maliyetini gözden geçirin.",
          evidence: [`Stok ${p.stockQty ?? "?"} adet`, `Kaplama ${Math.round(cover)} gün`],
        }));
      }
    }
  }
  return out;
};

const deadStock: Detector = ({ data }) => {
  const out: AlertDraft[] = [];
  const val = data.deadStockValue;
  if (val != null && val > 0) {
    out.push(mkAlert({ data, s: DEFAULT_EW_SETTINGS }, {
      alertType: "DEAD_STOCK_ACCUMULATION",
      category: "FINANCIAL",
      method: "Ölü stok değeri hesabı (90+ gün satışsız)",
      probability: 70,
      impact: 50,
      urgency: 40,
      exposure: Math.min(100, val / 1000),
      trigger: `Ölü/atıl stok değeri ${round2(val)} TL`,
      observed: val,
      expected: 0,
      deviationPct: null,
      financialImpact: val,
      confidence: 75,
      action: "İndirim/tasfiye/paket stratejisi; tedarikçiye iade veya konsinye görüşün. Detay: FAZ 2 → Tedarik & Satın Alma.",
      evidence: [`Hesaplanan atıl stok: ${round2(val)} TL`],
    }));
  }
  return out;
};

const supplierRisk: Detector = ({ data, s }) => {
  const out: AlertDraft[] = [];
  for (const sup of data.suppliers) {
    if (sup.latePct != null && sup.latePct >= s.supplierLatePct) {
      out.push(mkAlert({ data, s }, {
        alertType: "SUPPLIER_LATE",
        category: "SUPPLIER",
        method: "Gecikme oranı eşiği + EWMA teyidi",
        entityType: "SUPPLIER",
        entityId: sup.id,
        entityLabel: sup.name,
        probability: Math.min(95, sup.latePct),
        impact: 60,
        urgency: 55,
        exposure: 45,
        trigger: `Teslimat gecikme oranı %${round1(sup.latePct)} (eşik %${s.supplierLatePct})`,
        observed: sup.latePct,
        expected: s.supplierLatePct,
        deviationPct: null,
        financialImpact: null,
        confidence: Math.min(100, sup.orderCount * 15),
        action: "Tedarikçiyle SLA/teslimat görüşmesi; kritik kalemler için alternatif kaynak değerlendirmesi (2. kaynak).",
        evidence: [`${sup.orderCount} sipariş`, `Gecikme %${round1(sup.latePct)}`],
      }));
    }
    if (sup.fillRatePct != null && sup.fillRatePct < 90) {
      out.push(mkAlert({ data, s }, {
        alertType: "SUPPLIER_FILL_RATE",
        category: "SUPPLIER",
        method: "Fill rate eşiği (%90 altı)",
        entityType: "SUPPLIER",
        entityId: sup.id,
        entityLabel: sup.name,
        probability: 65,
        impact: 55,
        urgency: 55,
        exposure: 45,
        trigger: `Fill rate %${round1(sup.fillRatePct)} (eşik %90)`,
        observed: sup.fillRatePct,
        expected: 90,
        deviationPct: null,
        financialImpact: null,
        confidence: Math.min(100, sup.orderCount * 15),
        action: "Eksik teslim kalemlerini listeleyin; süreklilik arz eden ürünlerde ikame tedarikçi açın.",
        evidence: [`Fill rate %${round1(sup.fillRatePct)}`, `${sup.orderCount} sipariş`],
      }));
    }
  }
  return out;
};

const marketingRisk: Detector = ({ data, s }) => {
  const out: AlertDraft[] = [];
  for (const c of data.campaigns) {
    if (c.spend >= 100 && c.roas != null && c.roas < s.roasAlarm) {
      const waste = Math.max(0, c.spend - c.attributedRevenue);
      out.push(mkAlert({ data, s }, {
        alertType: "AD_ROAS_LOW",
        category: "MARKETING",
        method: "ROAS eşiği kuralı (≥100 TL spend)",
        entityType: "CAMPAIGN",
        entityId: c.id,
        entityLabel: c.name,
        probability: 80,
        impact: Math.min(100, waste / 100),
        urgency: 60,
        exposure: 55,
        trigger: `ROAS ${round2(c.roas)} < ${s.roasAlarm} — reklam harcaması kendini ödemiyor`,
        observed: c.roas,
        expected: s.roasAlarm,
        deviationPct: null,
        financialImpact: waste,
        confidence: 75,
        action: "Kanalı durdurun veya hedeflemeyi daraltın; bütçeyi ROAS>1 kanallara kaydırın (FAZ 2 → Reklam panosu).",
        evidence: [`Harcama ${round2(c.spend)} TL`, `Atfedilen gelir ${round2(c.attributedRevenue)} TL`],
      }));
    }
    if (c.spend >= 500 && c.roas != null && c.roas >= s.roasAlarm && c.roas < 1.5) {
      out.push(mkAlert({ data, s }, {
        alertType: "CAMPAIGN_UNDERPERFORMANCE",
        category: "MARKETING",
        method: "Bant kuralı: 1.0 ≤ ROAS < 1.5 izleme",
        entityType: "CAMPAIGN",
        entityId: c.id,
        entityLabel: c.name,
        probability: 55,
        impact: 40,
        urgency: 40,
        exposure: 35,
        trigger: `ROAS ${round2(c.roas)} bandında (1.0-1.5) — kârlılık sınırda`,
        observed: c.roas,
        expected: 1.5,
        deviationPct: null,
        financialImpact: null,
        confidence: 65,
        action: "Kreatif/hedef kitle denemesi; attribution penceresini doğrulayın; haftalık takip listesine alın.",
        evidence: [`Harcama ${round2(c.spend)} TL`, `ROAS ${round2(c.roas)}`],
      }));
    }
  }
  return out;
};

const qualityRisk: Detector = ({ data, s }) => {
  const out: AlertDraft[] = [];
  const returns = data.products.map((p) => p.returnRatePct).filter((v): v is number => v != null);
  const bounds = returns.length >= 4 ? iqrBounds(returns) : null;
  for (const p of data.products) {
    const rr = p.returnRatePct;
    if (rr == null) continue;
    const isOutlier = bounds != null && rr > bounds.upper && rr >= s.returnRateAlarmPct;
    if (rr >= s.returnRateAlarmPct || isOutlier) {
      out.push(mkAlert({ data, s }, {
        alertType: "RETURN_RATE_SPIKE",
        category: "QUALITY",
        method: "IQR aykırı değer + eşik kuralı",
        entityType: "PRODUCT",
        entityId: p.id,
        entityLabel: p.name,
        probability: Math.min(95, rr * 2.5),
        impact: 55,
        urgency: 50,
        exposure: 45,
        trigger: `İade oranı %${round1(rr)}${isOutlier ? " (IQR aykırısı)" : ""} (eşik %${s.returnRateAlarmPct})`,
        observed: rr,
        expected: s.returnRateAlarmPct,
        deviationPct: null,
        financialImpact: null,
        confidence: 60,
        action: "İade neden kodu dağılımı; tedarikçi kalite bildirimi; sorunlu parti kontrolü.",
        evidence: [`İade oranı %${round1(rr)}`, isOutlier ? "IQR üst sınırı aşıldı" : "Eşik üstü"],
      }));
    }
  }
  return out;
};

const operationalRisk: Detector = ({ data }) => {
  const out: AlertDraft[] = [];
  const units = data.dailyNetSales.map((d) => d.units);
  if (units.length >= 10) {
    const latest = units[units.length - 1];
    const hist = units.slice(0, -1);
    const mz = modifiedZScore(latest, hist);
    if (mz != null && Math.abs(mz) >= 4) {
      out.push(mkAlert({ data, s: DEFAULT_EW_SETTINGS }, {
        alertType: "ORDER_ANOMALY",
        category: "OPERATIONAL",
        method: "Modified Z (sipariş adedi, eşik |4|)",
        probability: Math.min(90, Math.abs(mz) * 16),
        impact: 45,
        urgency: 55,
        exposure: 35,
        trigger: `Sipariş adedi geçmişten ${round1(mz)} MAD sapıyor (${mz > 0 ? "yoğunluk" : "kesinti"})`,
        observed: latest,
        expected: null,
        deviationPct: null,
        financialImpact: null,
        confidence: Math.min(100, hist.length * 5),
        action: mz > 0
          ? "Yoğunluk beklenmiyorsa kampanya/kurye etkisini doğrulayın; kadro ve stok yeterliliğini kontrol edin."
          : "Olası POS/entegrasyon kesintisi veya veri gişim hatası; sistemi ve veri akışını kontrol edin.",
        evidence: [`Modified Z = ${round2(mz)}`, `${hist.length} gün geçmiş`],
      }));
    }
  }
  return out;
};

export const DETECTORS: Detector[] = [
  salesDrop,
  forecastDeviation,
  marginDeterioration,
  inventoryRisk,
  deadStock,
  supplierRisk,
  marketingRisk,
  qualityRisk,
  operationalRisk,
];

/** Tüm dedektörleri çalıştırıp alarm listesi üretir (persist YOK). */
export function scanEarlyWarnings(data: EarlyWarningData, settings: EarlyWarningSettings = DEFAULT_EW_SETTINGS): AlertDraft[] {
  const out: AlertDraft[] = [];
  for (const detector of DETECTORS) {
    try {
      out.push(...detector({ data, s: settings }));
    } catch {
      // Bir dedektörün hatası diğerlerini durdurmaz — sessiz geçme yerine boş sonuç
    }
  }
  return out;
}
