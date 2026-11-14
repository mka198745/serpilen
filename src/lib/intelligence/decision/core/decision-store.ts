/**
 * Karar kayıtları kalıcılığı — tek yazma noktası.
 * decisionKey unique → aynı analiz iki kez kaydedilmez. analysis_snapshot değiştirilemez.
 * Status iş akışı: RECOMMENDED → UNDER_REVIEW → APPROVED|REJECTED → IMPLEMENTED → MONITORING → COMPLETED → EVALUATED → ARCHIVED
 */
import { db } from "@/db";
import { decisionRecords, decisionAlternatives, auditLogs } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import type { DecisionRecommendation, DecisionStatus } from "./types";
import { DECISION_TERMINAL_STATUSES } from "./types";

const round2 = (n: number) => Number(n.toFixed(2));
const numStr = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : String(round2(v)));

export interface UpsertDecisionResult {
  id: number;
  created: boolean;
  decisionKey: string;
  status: string;
}

/** Değerlendirme sonucunu kaydeder/ günceller; aynı anahtar varsa analiz snapshot'ını TAZELER (immutable geçmişi: yalnız son analiz). */
export async function upsertDecision(rec: DecisionRecommendation, actor: string): Promise<UpsertDecisionResult> {
  const existing = await db.select().from(decisionRecords).where(eq(decisionRecords.decisionKey, rec.decisionKey)).limit(1);
  const values = {
    title: rec.title,
    decisionType: rec.context.decisionType,
    sourceModules: JSON.stringify(rec.context.sourceModules),
    relatedProductId: rec.context.relatedProductId ?? null,
    relatedCategoryId: rec.context.relatedCategoryId ?? null,
    relatedSupplierId: rec.context.relatedSupplierId ?? null,
    relatedCampaignId: rec.context.relatedCampaignId ?? null,
    analysisPeriodStart: rec.context.analysisPeriodStart ?? null,
    analysisPeriodEnd: rec.context.analysisPeriodEnd ?? null,
    recommendationSummary: rec.summary,
    expectedRevenueImpact: numStr(rec.expectedImpact.revenue) ?? "0",
    expectedProfitImpact: numStr(rec.expectedImpact.profit) ?? "0",
    expectedCashImpact: numStr(rec.expectedImpact.cash) ?? "0",
    riskScore: numStr(bestRisk(rec)) ?? "50",
    successProbability: numProb(bestProb(rec)),
    dataCoverage: numStr(rec.dataCoverage) ?? "0",
    confidenceLabel: confidenceLabelOf(rec.decisionConfidence),
    statisticalConfidence: numStr(rec.statisticalConfidence),
    confidenceComponents: JSON.stringify(rec.confidenceComponents),
    methodNote: rec.methodNote,
    evidence: JSON.stringify(rec.evidence),
    assumptions: JSON.stringify(rec.assumptions),
    explanation: rec.explanation,
    analysisSnapshot: JSON.stringify({ context: rec.context, alternatives: rec.alternatives, expectedImpact: rec.expectedImpact, algorithmVersion: rec.algorithmVersion }),
    opportunityKey: rec.opportunityKey ?? null,
    algorithmVersion: rec.algorithmVersion,
    updatedAt: new Date(),
  };

  if (existing.length) {
    const row = existing[0];
    if (DECISION_TERMINAL_STATUSES.includes(row.status as DecisionStatus)) {
      return { id: row.id, created: false, decisionKey: row.decisionKey, status: row.status };
    }
    await db.update(decisionRecords).set(values).where(eq(decisionRecords.id, row.id));
    await replaceAlternatives(row.id, rec);
    return { id: row.id, created: false, decisionKey: row.decisionKey, status: row.status };
  }

  const [inserted] = await db
    .insert(decisionRecords)
    .values({ ...values, decisionKey: rec.decisionKey, status: "RECOMMENDED", createdBy: actor })
    .returning({ id: decisionRecords.id });
  await replaceAlternatives(inserted.id, rec);
  await writeAudit("DECISION_RECOMMENDED", inserted.id, `Karar önerisi oluşturuldu: ${rec.title}`, actor);
  return { id: inserted.id, created: true, decisionKey: rec.decisionKey, status: "RECOMMENDED" };
}

async function replaceAlternatives(decisionId: number, rec: DecisionRecommendation) {
  await db.delete(decisionAlternatives).where(eq(decisionAlternatives.decisionId, decisionId));
  for (const alt of rec.alternatives) {
    await db.insert(decisionAlternatives).values({
      decisionId,
      kind: alt.kind,
      label: alt.label,
      description: alt.description,
      expectedRevenue: numStr(alt.expectedRevenue) ?? "0",
      expectedProfit: numStr(alt.expectedProfit) ?? "0",
      expectedCost: numStr(alt.expectedCost) ?? "0",
      cashNeed: numStr(alt.cashNeed) ?? "0",
      riskScore: numStr(alt.riskScore) ?? "50",
      successProbability: numProb(alt.successProbability),
      implementationDays: alt.implementationDays ?? null,
      resourceNote: alt.resourceNote ?? null,
      constraints: alt.constraints ?? null,
      score: numStr(alt.weightedScore),
      rank: alt.rank,
      criteriaScores: JSON.stringify(alt.criteria),
      assumptions: JSON.stringify(alt.assumptions),
    });
  }
}

const TRANSITION_TARGETS = {
  review: "UNDER_REVIEW",
  approve: "APPROVED",
  reject: "REJECTED",
  schedule: "SCHEDULED",
  implement: "IMPLEMENTED",
  monitoring: "MONITORING",
  complete: "COMPLETED",
  evaluate: "EVALUATED",
  archive: "ARCHIVED",
} as const;
export type DecisionTransitionAction = keyof typeof TRANSITION_TARGETS;

const ALLOWED: Record<DecisionTransitionAction, DecisionStatus[]> = {
  review: ["RECOMMENDED"],
  approve: ["RECOMMENDED", "UNDER_REVIEW"],
  reject: ["RECOMMENDED", "UNDER_REVIEW"],
  schedule: ["APPROVED"],
  implement: ["APPROVED", "SCHEDULED"],
  monitoring: ["IMPLEMENTED"],
  complete: ["IMPLEMENTED", "MONITORING"],
  evaluate: ["COMPLETED"],
  archive: ["EVALUATED", "REJECTED"],
};

export async function transitionDecision(opts: { id: number; action: DecisionTransitionAction; actor: string; note?: string }):
  Promise<{ ok: true; status: DecisionStatus } | { ok: false; error: string }> {
  const [row] = await db.select().from(decisionRecords).where(eq(decisionRecords.id, opts.id)).limit(1);
  if (!row) return { ok: false, error: "Karar bulunamadı." };
  const target: DecisionStatus = TRANSITION_TARGETS[opts.action];
  if (!ALLOWED[opts.action].includes(row.status as DecisionStatus)) {
    return { ok: false, error: `"${row.status}" durumundan "${target}" durumuna geçilemez.` };
  }
  const now = new Date();
  const patch: Record<string, unknown> = { status: target, updatedAt: now };
  if (opts.action === "approve") { patch.approvedBy = opts.actor; patch.approvedAt = now; }
  if (opts.action === "implement") patch.implementedAt = now;
  if (opts.action === "complete") patch.completedAt = now;
  await db.update(decisionRecords).set(patch).where(eq(decisionRecords.id, row.id));
  await writeAudit(`DECISION_${opts.action.toUpperCase()}`, row.id, `${row.status} → ${target}${opts.note ? ` — ${opts.note}` : ""}`, opts.actor);
  return { ok: true, status: target };
}

export async function archiveOldDecisions(olderThanDays: number, actor = "Sistem"): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 86400000);
  const rows = await db.select({ id: decisionRecords.id, status: decisionRecords.status }).from(decisionRecords)
    .where(inArray(decisionRecords.status, ["EVALUATED", "REJECTED"]));
  let n = 0;
  for (const r of rows) {
    // completedAt/createdAt kontrolü — completedAt yoksa updatedAt üzerinden
    const [full] = await db.select({ updatedAt: decisionRecords.updatedAt, completedAt: decisionRecords.completedAt }).from(decisionRecords).where(eq(decisionRecords.id, r.id)).limit(1);
    const ref = full?.completedAt ?? full?.updatedAt ?? cutoff;
    if (ref < cutoff) {
      await db.update(decisionRecords).set({ status: "ARCHIVED", updatedAt: new Date() }).where(eq(decisionRecords.id, r.id));
      n++;
    }
  }
  if (n > 0) await writeAudit("DECISIONS_ARCHIVED_BULK", 0, `${n} karar arşivlendi (>${olderThanDays} gün)`, actor);
  return n;
}

async function writeAudit(action: string, entityId: number, details: string, actor: string) {
  await db.insert(auditLogs).values({ userId: actor, userName: actor, action, entity: "DecisionRecord", entityId: String(entityId), details });
}

function bestRisk(rec: DecisionRecommendation): number | null {
  const best = rec.alternatives.find((a) => a.kind === rec.bestAlternativeKind);
  return best?.riskScore ?? null;
}
function bestProb(rec: DecisionRecommendation): number | null {
  const best = rec.alternatives.find((a) => a.kind === rec.bestAlternativeKind);
  return best?.successProbability ?? null;
}
function numProb(v: number | null | undefined): string | null {
  if (v == null || !Number.isFinite(v)) return null;
  return String(Math.min(1, Math.max(0, v)));
}
function confidenceLabelOf(decisionConfidence: number): "HIGH" | "MEDIUM" | "LOW" {
  return decisionConfidence >= 75 ? "HIGH" : decisionConfidence >= 45 ? "MEDIUM" : "LOW";
}
