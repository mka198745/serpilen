import { requireStaff } from "@/lib/auth";
import { ok, fail } from "@/lib/intelligence/http";
import { db } from "@/db";
import { decisionRecords, decisionAlternatives, decisionOutcomes } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function parseId(params: Promise<{ id: string }>) {
  const { id } = await params;
  const n = Number(id);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  try {
    const id = await parseId(params);
    if (id == null) return fail(400, "VALIDATION", "Geçersiz karar id.");
    const [record] = await db.select().from(decisionRecords).where(eq(decisionRecords.id, id)).limit(1);
    if (!record) return fail(404, "NOT_FOUND", "Karar bulunamadı.");
    const alternatives = await db.select().from(decisionAlternatives).where(eq(decisionAlternatives.decisionId, id));
    const outcomes = await db.select().from(decisionOutcomes).where(eq(decisionOutcomes.decisionId, id)).orderBy(desc(decisionOutcomes.measuredAt));
    return ok({
      ...record,
      sourceModules: safeJson(record.sourceModules, []),
      evidence: safeJson(record.evidence, []),
      assumptions: safeJson(record.assumptions, []),
      confidenceComponents: record.confidenceComponents ? safeJson(record.confidenceComponents, null) : null,
      analysisSnapshot: record.analysisSnapshot ? safeJson(record.analysisSnapshot, null) : null,
      alternatives: alternatives.map((a) => ({
        ...a,
        criteriaScores: safeJson(a.criteriaScores, []),
        assumptions: safeJson(a.assumptions, []),
        expectedRevenue: num(a.expectedRevenue), expectedProfit: num(a.expectedProfit), expectedCost: num(a.expectedCost),
        cashNeed: num(a.cashNeed), riskScore: num(a.riskScore), successProbability: num(a.successProbability), score: a.score != null ? num(a.score) : null,
      })),
      outcomes,
    });
  } catch (err) {
    console.error("[intelligence/decision/:id]", err);
    return fail(500, "INTELLIGENCE_ERROR", "Karar detayı alınamadı.");
  }
}
const safeJson = <T,>(raw: string | null | undefined, fallback: T): T => { try { return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; } };
const num = (v: unknown) => (v == null ? null : Number(v));
