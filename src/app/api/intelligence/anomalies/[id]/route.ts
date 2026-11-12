import { db } from "@/db";
import { anomalyEvents, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireStaff } from "@/lib/auth";
import { ok, fail } from "@/lib/intelligence/http";
import { invalidateIntelligenceCache } from "@/lib/intelligence/service";

export const dynamic = "force-dynamic";

const STATUSES = new Set(["OPEN", "ACKNOWLEDGED", "RESOLVED"]);

// Anomali durumunu güncelle: OPEN → ACKNOWLEDGED → RESOLVED (veya geri alma)
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  try {
    const { id } = await params;
    const anomalyId = Number(id);
    if (!Number.isFinite(anomalyId) || anomalyId < 1) return fail(400, "VALIDATION", "Geçersiz anomali id.");

    const body = await request.json().catch(() => null);
    const status = String(body?.status ?? "").toUpperCase();
    if (!STATUSES.has(status)) return fail(400, "VALIDATION", "status OPEN, ACKNOWLEDGED veya RESOLVED olmalı.");

    const existing = await db.select().from(anomalyEvents).where(eq(anomalyEvents.id, anomalyId)).limit(1);
    if (!existing.length) return fail(404, "NOT_FOUND", "Anomali bulunamadı. Not: anomali listesi 'analyze' çalıştırılmadan kayıtlı olmayabilir.");

    await db.update(anomalyEvents).set({ status }).where(eq(anomalyEvents.id, anomalyId));
    await db.insert(auditLogs).values({
      userId: gate.user.name,
      userName: gate.user.name,
      action: "INTELLIGENCE_ANOMALY_STATUS",
      entity: "AnomalyEvent",
      entityId: String(anomalyId),
      details: `Anomali #${anomalyId} durumu → ${status}`,
    });
    invalidateIntelligenceCache();
    return ok({ id: anomalyId, status });
  } catch (err) {
    console.error("[intelligence/anomalies/:id]", err);
    return fail(500, "INTELLIGENCE_ERROR", "Anomali durumu güncellenemedi.");
  }
}
