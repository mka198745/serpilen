/**
 * FAZ 3 — Merkezi Karar Orkestratörü.
 * Veri kaynakları → FAZ 1 → FAZ 2 → hedefler → riskler → alternatifler → çelişki → öneri → kayıt → onay → outcome.
 * İç mantık KOPYALANMAZ; FAZ 1/2 servisleri çağrılır. Mod: yalnız MANUAL (ilk sürüm).
 * Otomatik uygulama YOK: kayıt RECOMMENDED durumunda doğar; yönetici onaylar.
 */
import { loadSalesBundle } from "../../repositories";
import { listOpportunities, getCampaignAnalysis, getSupplierAnalysis } from "../../commercial/service";
import { getAccuracy } from "../../service";
import { db } from "@/db";
import { intelligenceSettings, decisionConflicts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { listGoalsWithProgress } from "../goals/store";
import { goalAlignmentScore } from "../goals/goals-engine";
import { evaluateDecision } from "../core/decision-engine";
import { upsertDecision } from "../core/decision-store";
import { detectConflicts, type ConflictCandidate } from "../core/conflicts";
import { scanEarlyWarnings, DEFAULT_EW_SETTINGS, type EarlyWarningData, type AlertDraft } from "../early-warning/engine";
import { upsertAlerts } from "../early-warning/store";
import { productMetricsFromBundle, globalBaselineFromBundle, dailyNetSalesFromBundle, dailyMarginPctFromBundle } from "../data-bridge";
import { mergeFaz3Settings, parseNumSetting as pns3 } from "../core/settings";
import type { DecisionRecommendation, DecisionType } from "../core/types";

export type OrchestratorMode = "MANUAL" | "SCHEDULED" | "EVENT_DRIVEN";

export interface OrchestratorRunResult {
  mode: OrchestratorMode;
  startedAt: string;
  finishedAt: string;
  summary: {
    opportunitiesConsidered: number;
    decisionsCreated: number;
    decisionsUpdated: number;
    alertsCreated: number;
    alertsUpdated: number;
    conflictsDetected: number;
    warnings: string[];
  };
  decisions: Array<{
    decisionId: number | null;
    decisionKey: string;
    decisionType: DecisionType;
    title: string;
    bestAlternativeKind: string | null;
    weightedScore: number | null;
    expectedProfitImpact: number | null;
    decisionConfidence: number;
    dataCoverage: number;
    goalAlignment: number | null;
    opportunityKey: string | null;
  }>;
  conflicts: Array<{ conflictType: string; title: string; financialImpactDifference: number | null; relatedProductId: number | null }>;
  alerts: Array<{ alertKey: string; alertType: string; severity: string; riskScore: number; entityLabel: string | null }>;
  notes: string[];
}

const OPP_TO_DECISION: Record<string, { type: DecisionType; tags: string[] }> = {
  PRICING_OPPORTUNITY: { type: "PRICING", tags: ["INCREASE"] },
  MARGIN_IMPROVEMENT: { type: "PRICING", tags: ["INCREASE"] },
  STOCK_OPTIMIZATION: { type: "INVENTORY", tags: ["RESTOCK"] },
  SUPPLIER_IMPROVEMENT: { type: "SUPPLIER", tags: [] },
  SUPPLIER_RISK: { type: "SUPPLIER", tags: [] },
  CAMPAIGN_OPPORTUNITY: { type: "CAMPAIGN", tags: [] },
  ADVERTISING_OPTIMIZATION: { type: "MARKETING", tags: [] },
  QUALITY_IMPROVEMENT: { type: "QUALITY", tags: [] },
  RETURN_REDUCTION: { type: "RETURNS", tags: [] },
  CROSS_SELLING: { type: "CUSTOMER", tags: [] },
  CASH_FLOW_OPTIMIZATION: { type: "CASH_FLOW", tags: [] },
};

/** Fırsatın karar tipini çıkarır (bilinmiyorsa başlıktan sezer, yoksa OPERATIONAL). */
export function mapOpportunityType(opportunityType: string, title: string): { type: DecisionType; tags: string[] } {
  const exact = OPP_TO_DECISION[opportunityType];
  if (exact) return exact;
  const t = `${opportunityType} ${title}`.toLowerCase();
  if (/(tasfiye|dead.?stock|atıl|atil)/.test(t)) return { type: "ASSORTMENT", tags: ["DEAD_STOCK"] };
  if (/(reorder|sipariş|siparis|takviye|stok)/.test(t)) return { type: "INVENTORY", tags: ["RESTOCK"] };
  if (/(fiyat|price|marj|kâr)/.test(t)) return { type: "PRICING", tags: ["INCREASE"] };
  if (/(kampanya|indirim)/.test(t)) return { type: "CAMPAIGN", tags: [] };
  if (/(reklam|roas|ads)/.test(t)) return { type: "MARKETING", tags: [] };
  if (/(iade|refund)/.test(t)) return { type: "RETURNS", tags: [] };
  if (/(tedarik|supplier)/.test(t)) return { type: "SUPPLIER", tags: [] };
  return { type: "OPERATIONAL", tags: [] };
}

export async function runDecisionAnalysis(opts: { actor: string; mode?: OrchestratorMode; persist?: boolean }): Promise<OrchestratorRunResult> {
  const mode = opts.mode ?? "MANUAL";
  if (mode !== "MANUAL") {
    throw new Error(`"${mode}" modu bu sürümde etkin değil. İlk sürüm yalnız MANUAL destekler (SCHEDULED/EVENT_DRIVEN altyapısı yok — bilinçli tasarım kararı).`);
  }
  const persist = opts.persist !== false;
  const startedAt = new Date().toISOString();
  const warnings: string[] = [];
  const notes: string[] = [];

  // 0) FAZ 3 ayarları (intelligence_settings; yoksa varsayılanlar)
  let faz3Map: Record<string, string>;
  try {
    const rows = await db.select({ key: intelligenceSettings.key, value: intelligenceSettings.value }).from(intelligenceSettings);
    faz3Map = mergeFaz3Settings(rows);
  } catch {
    faz3Map = mergeFaz3Settings(null);
    warnings.push("intelligence_settings okunamadı — FAZ 3 varsayılanları kullanılıyor.");
  }
  const pns = (k: string) => pns3(faz3Map, k);

  // 1) FAZ 1 yükleme + doğruluk
  const bundle = await loadSalesBundle();
  const orderCount = bundle.orders.length;
  let forecastAccuracyPct: number | null = null;
  let bestModelMape: number | null = null;
  try {
    const acc = await getAccuracy(bundle);
    const best = acc.bestModel;
    const bestRow = acc.models.find((m) => m.model === best?.model);
    if (bestRow?.mape != null) bestModelMape = bestRow.mape;
    if (bestRow?.wape != null) forecastAccuracyPct = Math.max(0, Math.min(100, 100 - bestRow.wape));
    notes.push(`FAZ 1 doğruluk: en iyi model ${best?.model ?? "yok"} (WAPE ${best?.wape ?? "?"}%), örneklem ${acc.storeSampleSize} gün.`);
  } catch {
    warnings.push("FAZ 1 doğruluk hesabı başarısız — tahmin isabeti bileşeni kullanılamadı.");
  }

  // 2) FAZ 2 fırsat havuzu (NEW)
  const { items: newOpportunities } = await listOpportunities({ status: ["NEW"], limit: 25, offset: 0 });
  notes.push(`FAZ 2 fırsat havuzu: ${newOpportunities.length} açık (NEW) fırsat değerlendirildi.`);

  // 3) Hedefler
  const { goals: activeGoals } = await listGoalsWithProgress({ status: "ACTIVE" });
  notes.push(`Aktif hedef sayısı: ${activeGoals.length}.`);

  // 4) Karar adayları üret + değerlendir
  const recommendations: DecisionRecommendation[] = [];
  const candidateTags: string[][] = [];
  for (const opp of newOpportunities) {
    const mapped = mapOpportunityType(opp.opportunityType, opp.title);
    const baseline = opp.relatedProductId != null
      ? productMetricsFromBundle(bundle, opp.relatedProductId)
      : globalBaselineFromBundle(bundle);
    const decisionType = mapped.type;
    const alignment = goalAlignmentScore(decisionType, activeGoals.map((g) => ({
      id: g.id, name: g.name, kpi: g.kpi, direction: g.direction, priority: g.priority, status: g.status,
    })));
    const sampleN = opp.relatedProductId != null ? Math.max(1, baseline.orderCount ?? 1) : Math.max(1, orderCount);
    const dataCoverage = Math.min(100, Math.round(
      Math.min(100, opp.dataCoverage) * 0.6 +
      (baseline.dailyUnits != null ? 20 : 0) +
      (baseline.marginPct30d != null || baseline.unitCost != null ? 10 : 0) +
      (orderCount >= 14 ? 10 : (orderCount / 14) * 10),
    ));
    const periodEnd = new Date().toISOString().slice(0, 10);
    const periodStart = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    try {
      const rec = evaluateDecision({
        context: {
          decisionType,
          relatedProductId: opp.relatedProductId,
          relatedCategoryId: null,
          relatedSupplierId: opp.relatedSupplierId,
          relatedCampaignId: opp.relatedCampaignId,
          sourceModules: [opp.sourceModule],
          analysisPeriodStart: periodStart,
          analysisPeriodEnd: periodEnd,
        },
        baseline: {
          periodDays: 90,
          price: baseline.price,
          unitCost: baseline.unitCost,
          variableCost: baseline.variableCost,
          dailyUnits: baseline.dailyUnits,
          revenuePerDay: baseline.avgDailyRevenue,
          marginPct: baseline.marginPct30d,
          stockQty: baseline.stockQty,
          coverDays: baseline.coverDays,
          deadStockValue: null,
          adSpendPerDay: null,
          campaignRoiPct: null,
          campaignRevenue30d: null,
          returnRatePct: baseline.returnRatePct,
          returnCost30d: baseline.returnCost30d,
          supplierLatePct: null,
          supplierFillRatePct: null,
          forecastMapePct: bestModelMape,
        },
        settings: faz3Map,
        goalAlignment: alignment.score,
        forecastAccuracyPct: forecastAccuracyPct ?? null,
        statisticalConfidence: bestModelMape != null ? Math.max(0, 100 - bestModelMape) : null,
        sampleN,
        dataCoverage,
        constraints: null,
        title: opp.title,
        trigger: `faz2:${opp.opportunityType}`,
        opportunityKey: opp.opportunityKey,
      });
      recommendations.push(rec);
      candidateTags.push(mapped.tags);
    } catch (e) {
      warnings.push(`"${opp.title}" değerlendirmesi atlandı: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  notes.push(`Değerlendirilen aday: ${recommendations.length}.`);

  // 5) Çelişki tespiti (adaylar arası)
  const conflictCandidates: ConflictCandidate[] = recommendations.map((rec, i) => {
    const best = rec.alternatives.find((a) => a.kind === rec.bestAlternativeKind);
    return {
      source: "decision",
      refKey: rec.decisionKey,
      decisionType: rec.context.decisionType,
      productId: rec.context.relatedProductId ?? null,
      campaignId: rec.context.relatedCampaignId ?? null,
      title: rec.title,
      recommendation: best?.label ?? rec.summary,
      expectedProfit: rec.expectedImpact.profit,
      tags: candidateTags[i] ?? [],
    };
  });
  const conflicts = detectConflicts(conflictCandidates);
  notes.push(`Tespit edilen çelişki: ${conflicts.length}.`);

  // 6) Erken uyarı taraması
  let alerts: AlertDraft[] = [];
  try {
    const campaignAnalysis = await getCampaignAnalysis().catch(() => null) as unknown as { advertising?: Array<{ id: number; name: string; spend: number; revenueAttributed: number; roas: number | null }> } | null;
    const supplierAnalysis = await getSupplierAnalysis().catch(() => null) as unknown as { suppliers?: Array<{ supplierId?: number; id?: number; supplierName?: string; name?: string; latePct?: number | null; fillRatePct?: number | null; orderCount?: number }> } | null;
    const adInsights = campaignAnalysis?.advertising ?? [];
    const supplierRows = supplierAnalysis?.suppliers ?? [];
    const topByRevenue = bundle.products
      .map((p) => ({ productId: p.id, metrics: productMetricsFromBundle(bundle, p.id) }))
      .filter((x) => (x.metrics.revenue30d ?? 0) > 0)
      .sort((a, b) => (b.metrics.revenue30d ?? 0) - (a.metrics.revenue30d ?? 0))
      .slice(0, 40);
    const products: EarlyWarningData["products"] = topByRevenue.map(({ productId, metrics }) => {
      const p = bundle.products.find((pp) => pp.id === productId)!;
      return {
        id: productId,
        name: p.name,
        sku: p.sku,
        stockQty: metrics.stockQty,
        coverDays: metrics.coverDays,
        avgDailyUnits: metrics.dailyUnits,
        avgDailyRevenue: metrics.avgDailyRevenue,
        unitCost: metrics.unitCost,
        revenue30d: metrics.revenue30d,
        cost30d: metrics.cost30d,
        margin30dPct: metrics.marginPct30d,
        returnRatePct: metrics.returnRatePct,
      };
    });
    const dataReliability = Math.max(10, Math.min(100,
      (orderCount >= 30 ? 40 : (orderCount / 30) * 40) +
      (products.some((p) => p.unitCost != null) ? 25 : 0) +
      (bundle.inventory.length > 0 ? 20 : 0) +
      (adInsights.length > 0 ? 15 : 0),
    ));
    const ewData: EarlyWarningData = {
      salesPeriodStart: new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10),
      salesPeriodEnd: new Date().toISOString().slice(0, 10),
      dailyNetSales: dailyNetSalesFromBundle(bundle),
      dailyMarginPct: dailyMarginPctFromBundle(bundle),
      products,
      suppliers: supplierRows.map((s) => ({
        id: s.supplierId ?? s.id ?? 0,
        name: s.supplierName ?? s.name ?? "Tedarikçi",
        latePct: s.latePct ?? null,
        fillRatePct: s.fillRatePct ?? null,
        orderCount: s.orderCount ?? 0,
      })),
      campaigns: adInsights.map((a) => ({ id: a.id, name: a.name, roas: a.roas, spend: a.spend, attributedRevenue: a.revenueAttributed })),
      forecast: bestModelMape != null ? { mapePct: bestModelMape, biasPct: null, deviationPct: null } : null,
      dataReliability,
      deadStockValue: null,
    };
    alerts = scanEarlyWarnings(ewData, {
      ...DEFAULT_EW_SETTINGS,
      salesDropPct: pns("faz3.earlywarning.sales_drop_pct"),
      marginDropPct: pns("faz3.earlywarning.margin_drop_pct"),
      returnRateAlarmPct: pns("faz3.earlywarning.return_rate_alarm_pct"),
      stockoutCoverDays: pns("faz3.earlywarning.stockout_cover_days"),
      overstockCoverDays: pns("faz3.earlywarning.overstock_cover_days"),
      roasAlarm: pns("faz3.earlywarning.roas_alarm"),
      supplierLatePct: pns("faz3.earlywarning.supplier_late_pct"),
      forecastDeviationPct: pns("faz3.earlywarning.forecast_deviation_pct"),
      minConfidenceForCritical: pns("faz3.earlywarning.min_confidence_for_critical"),
      repeatEscalationCount: pns("faz3.earlywarning.repeat_escalation_count"),
      riskWeights: {
        probability: pns("faz3.risk.weight_probability"),
        impact: pns("faz3.risk.weight_impact"),
        urgency: pns("faz3.risk.weight_urgency"),
        exposure: pns("faz3.risk.weight_exposure"),
        reliability: pns("faz3.risk.weight_reliability"),
      },
    });
    notes.push(`Erken uyarı taraması: ${alerts.length} alarm üretildi.`);
  } catch (e) {
    warnings.push(`Erken uyarı taraması başarısız: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 7) Kaydet (persist)
  let decisionsCreated = 0;
  let decisionsUpdated = 0;
  let alertsCreated = 0;
  let alertsUpdated = 0;
  const decisionOutputs: OrchestratorRunResult["decisions"] = [];
  for (const rec of recommendations) {
    const best = rec.alternatives.find((a) => a.kind === rec.bestAlternativeKind) ?? null;
    if (persist) {
      const res = await upsertDecision(rec, opts.actor);
      if (res.created) decisionsCreated++; else decisionsUpdated++;
      decisionOutputs.push({
        decisionId: res.id,
        decisionKey: rec.decisionKey,
        decisionType: rec.context.decisionType,
        title: rec.title,
        bestAlternativeKind: rec.bestAlternativeKind,
        weightedScore: best?.weightedScore ?? null,
        expectedProfitImpact: rec.expectedImpact.profit,
        decisionConfidence: rec.decisionConfidence,
        dataCoverage: rec.dataCoverage,
        goalAlignment: best?.goalAlignment ?? null,
        opportunityKey: rec.opportunityKey ?? null,
      });
    } else {
      decisionOutputs.push({
        decisionId: null,
        decisionKey: rec.decisionKey,
        decisionType: rec.context.decisionType,
        title: rec.title,
        bestAlternativeKind: rec.bestAlternativeKind,
        weightedScore: best?.weightedScore ?? null,
        expectedProfitImpact: rec.expectedImpact.profit,
        decisionConfidence: rec.decisionConfidence,
        dataCoverage: rec.dataCoverage,
        goalAlignment: best?.goalAlignment ?? null,
        opportunityKey: rec.opportunityKey ?? null,
      });
    }
  }

  if (persist) {
    for (const c of conflicts) {
      try {
        await db.insert(decisionConflicts).values({
          conflictKey: c.conflictKey,
          conflictType: c.conflictType,
          title: c.title,
          description: c.description,
          relatedProductId: c.relatedProductId ?? null,
          items: JSON.stringify(c.items),
          financialImpactDifference: c.financialImpactDifference != null ? String(c.financialImpactDifference) : null,
          resolutionOptions: JSON.stringify(c.resolutionOptions),
          status: "OPEN",
        });
      } catch {
        // Aynı conflictKey zaten kayıtlı — güncelleme gerekmez (idempotent)
      }
    }
    const alertResults = await upsertAlerts(alerts, opts.actor, pns("faz3.earlywarning.repeat_escalation_count"));
    alertsCreated = alertResults.filter((r) => r.created).length;
    alertsUpdated = alertResults.filter((r) => !r.created).length;
  }

  return {
    mode,
    startedAt,
    finishedAt: new Date().toISOString(),
    summary: {
      opportunitiesConsidered: newOpportunities.length,
      decisionsCreated,
      decisionsUpdated,
      alertsCreated,
      alertsUpdated,
      conflictsDetected: conflicts.length,
      warnings,
    },
    decisions: decisionOutputs,
    conflicts: conflicts.map((c) => ({ conflictType: c.conflictType, title: c.title, financialImpactDifference: c.financialImpactDifference, relatedProductId: c.relatedProductId ?? null })),
    alerts: alerts.map((a) => ({ alertKey: a.alertKey, alertType: a.alertType, severity: a.severity, riskScore: a.riskScore, entityLabel: a.relatedEntityLabel })),
    notes,
  };
}
