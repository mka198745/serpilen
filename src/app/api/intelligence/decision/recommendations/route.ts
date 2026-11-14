import { requireStaff } from "@/lib/auth";
import { ok, fail, numParam } from "@/lib/intelligence/http";
import { db } from "@/db";
import { decisionRecords } from "@/db/schema";
import { desc, eq, and, inArray, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status")?.toUpperCase() || null;
    const decisionType = url.searchParams.get("type")?.toUpperCase() || null;
    const limit = numParam(url, "limit", 50, 1, 200);
    if ("error" in limit) return fail(400, "VALIDATION", limit.error);
    const offset = numParam(url, "offset", 0, 0, 100000);
    if ("error" in offset) return fail(400, "VALIDATION", offset.error);
    const where = and(
      status ? eq(decisionRecords.status, status) : undefined,
      decisionType ? eq(decisionRecords.decisionType, decisionType) : undefined,
    );
    const rows = await db.select({
      id: decisionRecords.id,
      decisionKey: decisionRecords.decisionKey,
      title: decisionRecords.title,
      decisionType: decisionRecords.decisionType,
      status: decisionRecords.status,
      sourceModules: decisionRecords.sourceModules,
      relatedProductId: decisionRecords.relatedProductId,
      relatedSupplierId: decisionRecords.relatedSupplierId,
      relatedCampaignId: decisionRecords.relatedCampaignId,
      recommendationSummary: decisionRecords.recommendationSummary,
      expectedRevenueImpact: decisionRecords.expectedRevenueImpact,
      expectedProfitImpact: decisionRecords.expectedProfitImpact,
      expectedCashImpact: decisionRecords.expectedCashImpact,
      riskScore: decisionRecords.riskScore,
      successProbability: decisionRecords.successProbability,
      dataCoverage: decisionRecords.dataCoverage,
      confidenceLabel: decisionRecords.confidenceLabel,
      statisticalConfidence: decisionRecords.statisticalConfidence,
      methodNote: decisionRecords.methodNote,
      algorithmVersion: decisionRecords.algorithmVersion,
      createdBy: decisionRecords.createdBy,
      createdAt: decisionRecords.createdAt,
      updatedAt: decisionRecords.updatedAt,
    }).from(decisionRecords).where(where).orderBy(desc(decisionRecords.createdAt)).limit(limit.value).offset(offset.value);
    const [countRow] = await db.select({ c: sql<number>`count(*)` }).from(decisionRecords).where(where);
    return ok({ items: rows.map((r) => ({ ...r, sourceModules: safeJson(r.sourceModules, []) })), total: Number(countRow?.c ?? 0) });
  } catch (err) {
    console.error("[intelligence/decision/recommendations]", err);
    return fail(500, "INTELLIGENCE_ERROR", "Öneri listesi alınamadı.");
  }
}
const safeJson = <T,>(raw: string | null | undefined, fallback: T): T => { try { return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; } };
