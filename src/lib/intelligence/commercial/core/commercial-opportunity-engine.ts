/**
 * Commercial Opportunity ortak tipleri + fırsat nesnesi inşası.
 * Her fırsat: kanıt (evidence), varsayım (assumptions), hesaplama yöntemi ve
 * beklenen finansal etki ile inşa edilir — "neden, ne kadar" olmadan fırsat yok.
 */
import { priorityScore, severityFromPriority, type PriorityInputs, DEFAULT_PRIORITY_WEIGHTS } from "./priority-score";

export type OpportunityType =
  | "PRICING_OPPORTUNITY"
  | "MARGIN_IMPROVEMENT"
  | "CAMPAIGN_OPPORTUNITY"
  | "ADVERTISING_OPTIMIZATION"
  | "CROSS_SELLING"
  | "UPSELLING"
  | "BASKET_OPTIMIZATION"
  | "SUPPLIER_IMPROVEMENT"
  | "SUPPLIER_RISK"
  | "QUALITY_IMPROVEMENT"
  | "RETURN_REDUCTION"
  | "STOCK_OPTIMIZATION"
  | "PROCUREMENT_OPPORTUNITY"
  | "CASH_FLOW_OPTIMIZATION";

export type OpportunityStatus =
  | "NEW"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "EXPIRED"
  | "CANCELLED";

export const TERMINAL_STATUSES: OpportunityStatus[] = ["REJECTED", "COMPLETED", "EXPIRED", "CANCELLED"];

export interface OpportunityDraft {
  opportunityKey: string;
  opportunityType: OpportunityType;
  title: string;
  description: string;
  sourceModule: "pricing" | "campaigns" | "basket" | "suppliers" | "quality" | "procurement";
  relatedProductId?: number | null;
  relatedCategoryId?: number | null;
  relatedSupplierId?: number | null;
  relatedCampaignId?: number | null;
  estimatedRevenueImpact?: number;
  estimatedProfitImpact?: number;
  estimatedCostSaving?: number;
  estimatedCashImpact?: number;
  confidenceScore: number; // 0-100
  dataCoverage: number; // 0-100
  priorityInputs: Omit<PriorityInputs, "reliability"> & { reliability?: number };
  evidence: string[];
  assumptions: string[];
  calculationMethod: string;
  recommendedAction: string;
  dataPeriodStart?: string | null;
  dataPeriodEnd?: string | null;
  expiresInDays?: number | null;
}

export interface BuiltOpportunity extends Omit<OpportunityDraft, "estimatedRevenueImpact" | "estimatedProfitImpact" | "estimatedCostSaving" | "estimatedCashImpact"> {
  estimatedRevenueImpact: number;
  estimatedProfitImpact: number;
  estimatedCostSaving: number;
  estimatedCashImpact: number;
  priorityScore: number;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

/** Taslak fırsattan tam fırsat: öncelik + severity otomatik işlenir. */
export function buildOpportunity(draft: OpportunityDraft): BuiltOpportunity {
  const reliability = draft.priorityInputs.reliability ?? draft.confidenceScore;
  const priority = priorityScore({ ...draft.priorityInputs, reliability }, DEFAULT_PRIORITY_WEIGHTS);
  return {
    ...draft,
    estimatedRevenueImpact: draft.estimatedRevenueImpact ?? 0,
    estimatedProfitImpact: draft.estimatedProfitImpact ?? 0,
    estimatedCostSaving: draft.estimatedCostSaving ?? 0,
    estimatedCashImpact: draft.estimatedCashImpact ?? 0,
    priorityScore: priority,
    severity: severityFromPriority(priority),
  };
}
