/**
 * Fırsat havuzu kalıcılığı (tek yazma noktası) + yaşam döngüsü geçişleri.
 * Dedup: opportunity_key unique. Aynı açık fırsata ikinci kez rastlanırsa
 * yeni kayıt açılmaz; mevcut kayıt güncellenir (updatedAt + tarih/kanıt tazeleme).
 */
import { db } from "@/db";
import { commercialOpportunities, opportunityHistory, opportunityImpactResults, auditLogs } from "@/db/schema";
import { and, eq, inArray, lt } from "drizzle-orm";
import { TERMINAL_STATUSES, type BuiltOpportunity, type OpportunityStatus } from "./commercial-opportunity-engine";

const num = (v: unknown) => Number(v ?? 0) || 0;
const round2 = (n: number) => Number(n.toFixed(2));

export interface UpsertResult {
  id: number;
  created: boolean;
  opportunityKey: string;
}

/** Aynı fırsat tekrar raporlanırsa mevcut açık kaydı günceller. */
export async function upsertOpportunity(draft: BuiltOpportunity, actor: string): Promise<UpsertResult> {
  const existing = await db
    .select()
    .from(commercialOpportunities)
    .where(eq(commercialOpportunities.opportunityKey, draft.opportunityKey))
    .limit(1);

  const values = {
    title: draft.title,
    description: draft.description,
    estimatedRevenueImpact: String(round2(draft.estimatedRevenueImpact ?? 0)),
    estimatedProfitImpact: String(round2(draft.estimatedProfitImpact ?? 0)),
    estimatedCostSaving: String(round2(draft.estimatedCostSaving ?? 0)),
    estimatedCashImpact: String(round2(draft.estimatedCashImpact ?? 0)),
    confidenceScore: String(round2(draft.confidenceScore)),
    dataCoverage: String(round2(draft.dataCoverage)),
    priorityScore: String(round2(draft.priorityScore)),
    severity: draft.severity,
    evidence: JSON.stringify(draft.evidence ?? []),
    assumptions: JSON.stringify(draft.assumptions ?? []),
    calculationMethod: draft.calculationMethod,
    recommendedAction: draft.recommendedAction,
    relatedProductId: draft.relatedProductId ?? null,
    relatedCategoryId: draft.relatedCategoryId ?? null,
    relatedSupplierId: draft.relatedSupplierId ?? null,
    relatedCampaignId: draft.relatedCampaignId ?? null,
    dataPeriodStart: draft.dataPeriodStart ?? null,
    dataPeriodEnd: draft.dataPeriodEnd ?? null,
    expiresAt: draft.expiresInDays ? new Date(Date.now() + draft.expiresInDays * 86400000) : null,
    updatedAt: new Date(),
  };

  if (existing.length) {
    const row = existing[0];
    if (TERMINAL_STATUSES.includes(row.status as OpportunityStatus)) {
      // Terminaldeki fırsata aynı sinyal yeniden geldi → kayıt yeniden AÇILMAZ ve kopya da
      // üretilmez (gürültü). Sinyal kalıcıysa yönetici fırsatı manuel olarak yeniden açar (reopen).
      return { id: row.id, created: false, opportunityKey: row.opportunityKey };
    }
    await db.update(commercialOpportunities).set(values).where(eq(commercialOpportunities.id, row.id));
    await logHistory(row.id, "UPDATED", row.status, row.status, "Fırsat yeniden hesaplanarak tazeleme güncellendi", actor);
    return { id: row.id, created: false, opportunityKey: row.opportunityKey };
  }

  const [inserted] = await db
    .insert(commercialOpportunities)
    .values({ ...values, opportunityKey: draft.opportunityKey, opportunityType: draft.opportunityType, sourceModule: draft.sourceModule, status: "NEW" })
    .returning({ id: commercialOpportunities.id });
  await logHistory(inserted.id, "CREATED", null, "NEW", draft.title, actor);
  return { id: inserted.id, created: true, opportunityKey: draft.opportunityKey };
}

export async function logHistory(opportunityId: number, action: string, fromStatus: string | null, toStatus: string | null, details: string, actor: string) {
  await db.insert(opportunityHistory).values({ opportunityId, action, fromStatus, toStatus, details, actorName: actor });
}

export async function writeAudit(action: string, entityId: string | number, details: string, actor: string) {
  await db.insert(auditLogs).values({ userId: actor, userName: actor, action, entity: "CommercialOpportunity", entityId: String(entityId), details });
}

/** Süresi dolmuş açık fırsatları EXPIRED'a çeker (sistem bakımı). */
export async function expireStaleOpportunities(actor = "Sistem"): Promise<number> {
  const now = new Date();
  const stale = await db
    .select({ id: commercialOpportunities.id, status: commercialOpportunities.status })
    .from(commercialOpportunities)
    .where(and(lt(commercialOpportunities.expiresAt, now), inArray(commercialOpportunities.status, ["NEW", "UNDER_REVIEW", "APPROVED", "IN_PROGRESS"])));
  for (const row of stale) {
    await db.update(commercialOpportunities).set({ status: "EXPIRED", updatedAt: now }).where(eq(commercialOpportunities.id, row.id));
    await logHistory(row.id, "EXPIRED", row.status, "EXPIRED", "Fırsat geçerlilik süresi doldu", actor);
  }
  return stale.length;
}

/** Beklenen vs gerçekleşen etkiyi kaydeder ve fırsatı COMPLETED yapar. */
export async function completeOpportunity(opts: { id: number; actualProfitImpact: number; note?: string; evaluationWindowStart?: string; evaluationWindowEnd?: string; actor: string }) {
  const [row] = await db.select().from(commercialOpportunities).where(eq(commercialOpportunities.id, opts.id)).limit(1);
  if (!row) throw new Error("Fırsat bulunamadı.");
  const expected = num(row.estimatedProfitImpact);
  const realizationRate = expected !== 0 ? (opts.actualProfitImpact / expected) * 100 : null;
  const [inserted] = await db
    .insert(opportunityImpactResults)
    .values({
      opportunityId: row.id,
      expectedProfitImpact: String(round2(expected)),
      actualProfitImpact: String(round2(opts.actualProfitImpact)),
      realizationRate: realizationRate != null ? String(round2(realizationRate)) : null,
      evaluationWindowStart: opts.evaluationWindowStart ?? null,
      evaluationWindowEnd: opts.evaluationWindowEnd ?? null,
      note: opts.note ?? null,
      measuredBy: opts.actor,
    })
    .returning({ id: opportunityImpactResults.id });
  await db.update(commercialOpportunities).set({ status: "COMPLETED", updatedAt: new Date() }).where(eq(commercialOpportunities.id, row.id));
  await logHistory(row.id, "COMPLETED", row.status, "COMPLETED", `Gerçekleşen etki: ${round2(opts.actualProfitImpact)} TL (gerçekleşme ${realizationRate != null ? round2(realizationRate) + "%" : "n/a"})`, opts.actor);
  await writeAudit("COMMERCIAL_OPPORTUNITY_COMPLETED", row.id, `Fırsat #${row.id} tamamlandı; beklenen ${round2(expected)} TL, gerçekleşen ${round2(opts.actualProfitImpact)} TL`, opts.actor);
  return { impactResultId: inserted.id, realizationRate };
}
