/**
 * Karar gerçekleşen sonuçları — beklenen vs gerçekleşen, gerçekleşme oranı,
 * karar etkinliği (effectiveness) metrikleri. Kaynak ticari kayıtlar DEĞİŞMEZ.
 */
import { db } from "@/db";
import { decisionOutcomes, decisionRecords, auditLogs } from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

const round2 = (n: number) => Number(n.toFixed(2));
const num = (v: unknown) => (v == null ? null : Number(v));

export interface DecisionEffectiveness {
  decisionsTotal: number;
  approved: number;
  rejected: number;
  implemented: number;
  acceptanceRatePct: number | null;     // approved / (approved+rejected)
  implementationRatePct: number | null; // implemented / approved
  withOutcome: number;
  successCount: number;
  failureCount: number;
  successRatePct: number | null;
  avgRealizationPct: number | null;     // beklenen kârın gerçekleşen yüzdesi (ort.)
  totalExpectedProfit: number;
  totalActualProfit: number;
  financialRealizationPct: number | null;
  avgCompletionDays: number | null;     // approvedAt → completedAt
  byType: Array<{ decisionType: string; count: number; successRatePct: number | null; avgRealizationPct: number | null }>;
  note: string | null;
}

export interface OutcomeRecordInput {
  decisionId: number;
  actualProfitImpact: number;
  evaluationWindowStart?: string | null;
  evaluationWindowEnd?: string | null;
  note?: string | null;
  actor: string;
}

/** Gerçekleşen etkiyi kaydeder; kararı COMPLETED → (yönetici) EVALUATED akışına alır. */
export async function recordOutcome(input: OutcomeRecordInput): Promise<{ ok: true; realizationRate: number | null; outcomeId: number } | { ok: false; error: string }> {
  const [row] = await db.select().from(decisionRecords).where(eq(decisionRecords.id, input.decisionId)).limit(1);
  if (!row) return { ok: false, error: "Karar bulunamadı." };
  if (!["IMPLEMENTED", "MONITORING", "COMPLETED"].includes(row.status)) {
    return { ok: false, error: `"${row.status}" durumundaki kararın gerçekleşen sonucu kaydedilemez (uygulandıktan sonra kaydedilir).` };
  }
  const expected = num(row.expectedProfitImpact) ?? 0;
  const realization = expected !== 0 ? (input.actualProfitImpact / expected) * 100 : null;
  const [inserted] = await db.insert(decisionOutcomes).values({
    decisionId: row.id,
    expectedProfitImpact: String(round2(expected)),
    actualProfitImpact: String(round2(input.actualProfitImpact)),
    realizationRate: realization != null ? String(round2(realization)) : null,
    evaluationWindowStart: input.evaluationWindowStart ?? null,
    evaluationWindowEnd: input.evaluationWindowEnd ?? null,
    note: input.note ?? null,
    measuredBy: input.actor,
  }).returning({ id: decisionOutcomes.id });
  await db.update(decisionRecords).set({ status: "COMPLETED", completedAt: row.completedAt ?? new Date(), updatedAt: new Date() }).where(eq(decisionRecords.id, row.id));
  await db.insert(auditLogs).values({
    userId: input.actor, userName: input.actor, action: "DECISION_OUTCOME_RECORDED",
    entity: "DecisionRecord", entityId: String(row.id),
    details: `Beklenen ${round2(expected)} TL → gerçekleşen ${round2(input.actualProfitImpact)} TL (gerçekleşme ${realization != null ? round2(realization) + "%" : "n/a"})`,
  });
  return { ok: true, realizationRate: realization != null ? round2(realization) : null, outcomeId: inserted.id };
}

/** Karar etkinliği — tüm zamanlar veya tür kırılımı. */
export async function computeEffectiveness(): Promise<DecisionEffectiveness> {
  const rows = await db.select().from(decisionRecords);
  const outcomes = await db.select().from(decisionOutcomes);
  const outcomeByDecision = new Map(outcomes.map((o) => [o.decisionId, o]));

  const total = rows.length;
  const approved = rows.filter((r) => ["APPROVED", "SCHEDULED", "IMPLEMENTED", "MONITORING", "COMPLETED", "EVALUATED", "ARCHIVED"].includes(r.status)).length;
  const rejected = rows.filter((r) => r.status === "REJECTED").length;
  const implemented = rows.filter((r) => ["IMPLEMENTED", "MONITORING", "COMPLETED", "EVALUATED", "ARCHIVED"].includes(r.status)).length;

  const withOutcomeRows = rows.filter((r) => outcomeByDecision.has(r.id));
  const successOf = (expected: number, actual: number): boolean => expected !== 0 ? actual >= expected * 0.5 : actual > 0;
  let success = 0;
  let failure = 0;
  let realizationSum = 0;
  let realizationN = 0;
  let expectedSum = 0;
  let actualSum = 0;
  for (const r of withOutcomeRows) {
    const o = outcomeByDecision.get(r.id)!;
    const e = num(o.expectedProfitImpact) ?? 0;
    const a = num(o.actualProfitImpact) ?? 0;
    expectedSum += e;
    actualSum += a;
    if (successOf(e, a)) success++; else failure++;
    const rr = num(o.realizationRate);
    if (rr != null && Number.isFinite(rr)) { realizationSum += rr; realizationN++; }
  }
  const acceptanceRatePct = approved + rejected > 0 ? round2((approved / (approved + rejected)) * 100) : null;
  const implementationRatePct = approved > 0 ? round2((implemented / approved) * 100) : null;
  const successRatePct = success + failure > 0 ? round2((success / (success + failure)) * 100) : null;
  const avgRealizationPct = realizationN > 0 ? round2(realizationSum / realizationN) : null;
  const financialRealizationPct = Math.abs(expectedSum) > 0 ? round2((actualSum / expectedSum) * 100) : null;

  // Ortalama tamamlanma süresi (approvedAt → completedAt)
  const durations = rows
    .filter((r) => r.approvedAt && r.completedAt)
    .map((r) => (r.completedAt!.getTime() - r.approvedAt!.getTime()) / 86400000);
  const avgCompletionDays = durations.length ? round2(durations.reduce((s, d) => s + d, 0) / durations.length) : null;

  // Tür kırılımı
  const byTypeMap = new Map<string, { count: number; success: number; total: number; realizationSum: number; realizationN: number }>();
  for (const r of withOutcomeRows) {
    const t = r.decisionType;
    const o = outcomeByDecision.get(r.id)!;
    const e = num(o.expectedProfitImpact) ?? 0;
    const a = num(o.actualProfitImpact) ?? 0;
    const bucket = byTypeMap.get(t) ?? { count: 0, success: 0, total: 0, realizationSum: 0, realizationN: 0 };
    bucket.count++;
    bucket.total++;
    if (successOf(e, a)) bucket.success++;
    const rr = num(o.realizationRate);
    if (rr != null && Number.isFinite(rr)) { bucket.realizationSum += rr; bucket.realizationN++; }
    byTypeMap.set(t, bucket);
  }
  const byType = [...byTypeMap.entries()].map(([decisionType, b]) => ({
    decisionType,
    count: b.count,
    successRatePct: b.total > 0 ? round2((b.success / b.total) * 100) : null,
    avgRealizationPct: b.realizationN > 0 ? round2(b.realizationSum / b.realizationN) : null,
  }));

  return {
    decisionsTotal: total,
    approved,
    rejected,
    implemented,
    acceptanceRatePct,
    implementationRatePct,
    withOutcome: withOutcomeRows.length,
    successCount: success,
    failureCount: failure,
    successRatePct,
    avgRealizationPct,
    totalExpectedProfit: round2(expectedSum),
    totalActualProfit: round2(actualSum),
    financialRealizationPct,
    avgCompletionDays,
    byType,
    note: withOutcomeRows.length === 0 ? "Henüz ölçülmüş karar yok — sonuçlar uygulandıktan sonra kaydedilir." : null,
  };
}

/**
 * Sayaç karşı-olgusal (counterfactual): karar sonrası N gün vs karar öncesi N gün.
 * NEDENsel iddia YOKTUR; kontrol grubu yoktur; "önceki dönem" karşılaştırmasıdır.
 */
export async function comparePeriodsPrePost(opts: {
  windowStart: string; // karar tarihi (ISO)
  windowDays: number;
  productId?: number | null;
}): Promise<{
  before: { revenue: number; units: number; grossProfit: number; orders: number } | null;
  after: { revenue: number; units: number; grossProfit: number; orders: number } | null;
  deltaPct: { revenue: number | null; units: number | null; grossProfit: number | null; orders: number | null };
  disclaimer: string;
}> {
  const { orders, orderItems, products } = await import("@/db/schema");
  const start = new Date(opts.windowStart);
  const beforeStart = new Date(start.getTime() - opts.windowDays * 86400000);
  const afterEnd = new Date(start.getTime() + opts.windowDays * 86400000);
  const now = new Date();
  const effectiveAfterEnd = afterEnd > now ? now : afterEnd;

  const agg = async (from: Date, to: Date) => {
    const rows = await db.select().from(orders).where(sql`${orders.createdAt} >= ${Math.floor(from.getTime() / 1000)} AND ${orders.createdAt} < ${Math.floor(to.getTime() / 1000)}`);
    const ids = rows.map((r) => r.id);
    const items = ids.length ? await db.select().from(orderItems).where(inArray(orderItems.orderId, ids)) : [];
    const productIds = [...new Set(items.map((i) => i.productId))];
    const prods = productIds.length ? await db.select({ id: products.id, buyPrice: products.buyPrice }).from(products).where(inArray(products.id, productIds)) : [];
    const costById = new Map(prods.map((p) => [p.id, num(p.buyPrice) ?? 0]));
    let revenue = 0, units = 0, grossProfit = 0;
    for (const it of items) {
      const lineRev = Number(it.totalPrice ?? 0) || Number(it.unitPrice ?? 0) * it.quantity;
      revenue += lineRev;
      units += it.quantity;
      grossProfit += lineRev - (costById.get(it.productId) ?? 0) * it.quantity;
    }
    return { revenue: round2(revenue), units, grossProfit: round2(grossProfit), orders: rows.length };
  };

  const before = await agg(beforeStart, start);
  const after = await agg(start, effectiveAfterEnd);
  const dpct = (a: number, b: number) => (Math.abs(a) < 1e-9 ? null : round2(((b - a) / Math.abs(a)) * 100));
  return {
    before,
    after,
    deltaPct: {
      revenue: before && after ? dpct(before.revenue, after.revenue) : null,
      units: before && after ? dpct(before.units, after.units) : null,
      grossProfit: before && after ? dpct(before.grossProfit, after.grossProfit) : null,
      orders: before && after ? dpct(before.orders, after.orders) : null,
    },
    disclaimer: "Önceki dönem karşılaştırmasıdır; kontrol grubu yoktur, nedensellik/DiD iddiası YOKTUR. Sezonsallık ve dış faktörler düzeltilmemiştir.",
  };
}
