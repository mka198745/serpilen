/**
 * FAZ 3 — Decision Intelligence ortak tipleri.
 * Deterministik, açıklanabilir karar destek tipleri. Hiçbir tip LLM çağrısı içermez.
 */

export const DECISION_TYPES = [
  "PRICING",
  "INVENTORY",
  "PROCUREMENT",
  "SUPPLIER",
  "CAMPAIGN",
  "MARKETING",
  "FINANCIAL",
  "QUALITY",
  "CUSTOMER",
  "ASSORTMENT",
  "CASH_FLOW",
  "RETURNS",
  "FORECAST",
  "OPERATIONAL",
] as const;
export type DecisionType = (typeof DECISION_TYPES)[number];

export const DECISION_TYPE_LABELS: Record<DecisionType, string> = {
  PRICING: "Fiyatlandırma",
  INVENTORY: "Stok Politikası",
  PROCUREMENT: "Satın Alma",
  SUPPLIER: "Tedarikçi",
  CAMPAIGN: "Kampanya",
  MARKETING: "Pazarlama / Reklam",
  FINANCIAL: "Finans",
  QUALITY: "Kalite",
  CUSTOMER: "Müşteri",
  ASSORTMENT: "Ürün Gamı",
  CASH_FLOW: "Nakit Akışı",
  RETURNS: "İade / Tersine Lojistik",
  FORECAST: "Talep Tahmini",
  OPERATIONAL: "Operasyonel",
};

export const ALTERNATIVE_KINDS = ["CURRENT_STATE", "CONSERVATIVE", "BALANCED", "AGGRESSIVE", "CUSTOM"] as const;
export type AlternativeKind = (typeof ALTERNATIVE_KINDS)[number];

export const DECISION_STATUSES = [
  "RECOMMENDED",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
  "SCHEDULED",
  "IMPLEMENTED",
  "MONITORING",
  "COMPLETED",
  "EVALUATED",
  "ARCHIVED",
] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

/** Yönetici onayı olmadan hiçbir karar uygulanmaz; onay ≠ uygulama. */
export const DECISION_TERMINAL_STATUSES: DecisionStatus[] = ["REJECTED", "EVALUATED", "ARCHIVED"];

export interface DecisionContext {
  decisionType: DecisionType;
  relatedProductId?: number | null;
  relatedCategoryId?: number | null;
  relatedSupplierId?: number | null;
  relatedCampaignId?: number | null;
  sourceModules: string[];
  analysisPeriodStart?: string | null;
  analysisPeriodEnd?: string | null;
  /** Karar tetikleyicisi (örn. "FAZ2_OPPORTUNITY:pricing:123") */
  trigger?: string | null;
}

export interface AlternativeDraft {
  kind: AlternativeKind;
  label: string;
  description: string;
  /** null = hesaplanamadı (veri yetersiz) — 0 gibi GÖSTERİLMEZ */
  expectedRevenue: number | null;
  expectedProfit: number | null;
  expectedCost: number | null;
  cashNeed: number | null;
  riskScore: number | null; // 0-100
  successProbability: number | null; // 0-1
  implementationDays: number | null;
  resourceNote?: string | null;
  constraints?: string | null;
  assumptions: string[];
  evidence: string[];
  /** Karar kategorisine özgü ek metrik (what-if ile işlenir) */
  meta?: Record<string, number | string | null>;
}

export interface EvaluationCriterion {
  key: string;
  label: string;
  weight: number; // yönetici düzenleyebilir (faz3.criteria.*)
  score: number | null; // 0-100; null = veri yok
  note?: string;
}

export interface ScoredAlternative extends AlternativeDraft {
  criteria: EvaluationCriterion[];
  weightedScore: number | null; // null = puanlanamadı
  coverage: number; // 0-100 ağırlık kapsaması
  costBenefitRatio: number | null; // (beklenen kâr) / (maliyet + nakit ihtiyacı); null = tanımsız
  goalAlignment: number | null; // -100..+100 (goals servisi doldurur; yoksa null)
  rank: number;
}

export interface DecisionRecommendation {
  decisionKey: string;
  context: DecisionContext;
  title: string;
  summary: string;
  alternatives: ScoredAlternative[];
  bestAlternativeKind: AlternativeKind | null; // puanı en yüksek VE hedefler/kısıtlarla uyumlu
  runnerUpKind: AlternativeKind | null;
  currentStateKind: "CURRENT_STATE";
  rationale: string;
  expectedImpact: { revenue: number | null; profit: number | null; cash: number | null };
  risks: string[];
  assumptions: string[];
  evidence: string[];
  /** ÜÇ AYRI güven kavramı — birbirine karıştırılmaz */
  dataCoverage: number; // 0-100
  statisticalConfidence: number | null; // 0-100; tahmin yoksa null
  decisionConfidence: number; // 0-100
  confidenceComponents: Array<{ key: string; label: string; contribution: number; note: string }>;
  methodNote: string;
  explanation: string; // explanation report metni
  opportunityKey?: string | null;
  algorithmVersion: string;
}

export interface DecisionConflict {
  conflictKey: string;
  conflictType:
    | "PRICE_UP_VS_PROMOTION"
    | "DEAD_STOCK_CLEARANCE_VS_REORDER"
    | "MARGIN_VS_VOLUME"
    | "STOCKOUT_RISK_VS_CASH_FREEZE"
    | "AD_BUDGET_OVERALLOCATION"
    | "GOAL_VS_GOAL";
  title: string;
  description: string;
  relatedProductId?: number | null;
  items: Array<{ source: string; refKey: string; recommendation: string; expectedProfit: number | null }>;
  financialImpactDifference: number | null;
  resolutionOptions: string[];
}
