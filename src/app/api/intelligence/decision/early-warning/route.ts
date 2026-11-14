import { requireStaff } from "@/lib/auth";
import { ok, fail, numParam } from "@/lib/intelligence/http";
import { db } from "@/db";
import { earlyWarningEvents } from "@/db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  try {
    const url = new URL(request.url);
    const status = (url.searchParams.get("status") ?? "OPEN").toUpperCase();
    const category = url.searchParams.get("category")?.toUpperCase() || null;
    const severity = url.searchParams.get("severity")?.toUpperCase() || null;
    const limit = numParam(url, "limit", 50, 1, 200);
    if ("error" in limit) return fail(400, "VALIDATION", limit.error);
    const openStatuses = ["NEW", "ACKNOWLEDGED", "INVESTIGATING", "ACTION_REQUIRED"];
    const where = and(
      status === "OPEN" ? inArray(earlyWarningEvents.status, openStatuses) : status === "ALL" ? undefined : eq(earlyWarningEvents.status, status),
      category ? eq(earlyWarningEvents.category, category) : undefined,
      severity ? eq(earlyWarningEvents.severity, severity) : undefined,
    );
    const rows = await db.select().from(earlyWarningEvents).where(where).orderBy(desc(earlyWarningEvents.riskScore), desc(earlyWarningEvents.lastSeenAt)).limit(limit.value);
    const [countRow] = await db.select({ c: sql<number>`count(*)` }).from(earlyWarningEvents).where(where);
    return ok({
      items: rows.map((r) => ({
        ...r,
        riskScore: num(r.riskScore), observedValue: num(r.observedValue), expectedValue: num(r.expectedValue),
        deviationPct: num(r.deviationPct), potentialFinancialImpact: num(r.potentialFinancialImpact),
        confidence: num(r.confidence),
        evidence: safeJson(r.evidence, []),
      })),
      total: Number(countRow?.c ?? 0),
    });
  } catch (err) {
    console.error("[intelligence/decision/early-warning]", err);
    return fail(500, "INTELLIGENCE_ERROR", "Erken uyarı listesi alınamadı.");
  }
}
const num = (v: unknown) => (v == null ? null : Number(v));
const safeJson = <T,>(raw: string | null | undefined, fallback: T): T => { try { return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; } };
