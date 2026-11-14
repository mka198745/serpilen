import { requireStaff } from "@/lib/auth";
import { ok, fail } from "@/lib/intelligence/http";
import { db } from "@/db";
import { decisionRecords, earlyWarningEvents } from "@/db/schema";
import { sql } from "drizzle-orm";
import { listGoalsWithProgress } from "@/lib/intelligence/decision/goals/store";
import { computeEffectiveness } from "@/lib/intelligence/decision/outcomes/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  try {
    const statusRows = await db.select({ status: decisionRecords.status, c: sql<number>`count(*)` }).from(decisionRecords).groupBy(decisionRecords.status);
    const alertRows = await db.select({ severity: earlyWarningEvents.severity, c: sql<number>`count(*)` })
      .from(earlyWarningEvents)
      .where(sql`${earlyWarningEvents.status} in ('NEW','ACKNOWLEDGED','INVESTIGATING','ACTION_REQUIRED')`)
      .groupBy(earlyWarningEvents.severity);
    const totalOpenAlerts = alertRows.reduce((s, r) => s + Number(r.c), 0);
    const criticalAlerts = Number(alertRows.find((r) => r.severity === "CRITICAL")?.c ?? 0);
    const highAlerts = Number(alertRows.find((r) => r.severity === "HIGH")?.c ?? 0);
    const { goals } = await listGoalsWithProgress();
    const activeGoals = goals.filter((g) => g.status === "ACTIVE");
    const avgGoalProgress = activeGoals.length
      ? Math.round(activeGoals.reduce((s, g) => s + (g.progressPct ?? 0), 0) / activeGoals.length)
      : null;
    const goalsAtRisk = activeGoals.filter((g) => (g.progressPct ?? 100) < 50).length;
    const effectiveness = await computeEffectiveness();
    return ok({
      decisionStatusCounts: Object.fromEntries(statusRows.map((r) => [r.status, Number(r.c)])),
      openRecommendations: statusRows.filter((r) => ["RECOMMENDED", "UNDER_REVIEW"].includes(r.status)).reduce((s, r) => s + Number(r.c), 0),
      openAlerts: totalOpenAlerts,
      criticalAlerts,
      highAlerts,
      activeGoals: activeGoals.length,
      goalsAtRisk,
      avgGoalProgress,
      effectiveness: {
        decisionsTotal: effectiveness.decisionsTotal,
        acceptanceRatePct: effectiveness.acceptanceRatePct,
        implementationRatePct: effectiveness.implementationRatePct,
        successRatePct: effectiveness.successRatePct,
        financialRealizationPct: effectiveness.financialRealizationPct,
      },
    });
  } catch (err) {
    console.error("[intelligence/decision/overview]", err);
    return fail(500, "INTELLIGENCE_ERROR", "Karar zekâsı özeti hesaplanamadı.");
  }
}
