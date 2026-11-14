/**
 * Erken uyarı kalıcılığı — alertKey unique. Aynı koşul tekrarlanırsa yeni kayıt açılmaz,
 * mevcut kaydın occurrenceCount'u artar, lastSeenAt tazelenir ve geçmişe satır düşülür.
 * Yaşam döngüsü: NEW → ACKNOWLEDGED → INVESTIGATING → ACTION_REQUIRED → RESOLVED | FALSE_POSITIVE | EXPIRED
 * Süreklilik: occurrenceCount ≥ eşik ve hâlâ NEW/ACK → severity bir kademe yükselir (eskalasyon).
 */
import { db } from "@/db";
import { earlyWarningEvents, earlyWarningHistory, auditLogs } from "@/db/schema";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import type { AlertDraft } from "./engine";
import type { EarlyWarningSeverity } from "./risk-score";

const SEV_ORDER: EarlyWarningSeverity[] = ["LOW", "MODERATE", "HIGH", "CRITICAL"];
const bumpSeverity = (s: EarlyWarningSeverity): EarlyWarningSeverity => SEV_ORDER[Math.min(SEV_ORDER.length - 1, SEV_ORDER.indexOf(s) + 1)];

export interface UpsertAlertResult {
  id: number;
  created: boolean;
  occurrenceCount: number;
  escalated: boolean;
  status: string;
}

export async function upsertAlerts(alerts: AlertDraft[], actor: string, repeatEscalationCount = 3): Promise<UpsertAlertResult[]> {
  const results: UpsertAlertResult[] = [];
  for (const alert of alerts) {
    results.push(await upsertAlert(alert, actor, repeatEscalationCount));
  }
  return results;
}

async function upsertAlert(alert: AlertDraft, actor: string, repeatEscalationCount: number): Promise<UpsertAlertResult> {
  const existing = await db.select().from(earlyWarningEvents).where(eq(earlyWarningEvents.alertKey, alert.alertKey)).limit(1);
  const now = new Date();
  const values = {
    alertType: alert.alertType,
    category: alert.category,
    relatedEntityType: alert.relatedEntityType,
    relatedEntityId: alert.relatedEntityId,
    relatedEntityLabel: alert.relatedEntityLabel,
    riskScore: String(alert.riskScore),
    triggerCondition: alert.triggerCondition,
    observedValue: num(alert.observedValue),
    expectedValue: num(alert.expectedValue),
    deviationPct: num(alert.deviationPct),
    potentialFinancialImpact: num(alert.potentialFinancialImpact),
    confidence: String(alert.confidence),
    recommendedAction: alert.recommendedAction,
    evidence: JSON.stringify(alert.evidence),
    assumption: alert.assumption,
    updatedAt: now,
    lastSeenAt: now,
  };

  if (existing.length) {
    const row = existing[0];
    if (["RESOLVED", "FALSE_POSITIVE", "EXPIRED"].includes(row.status)) {
      // Terminal durumdaki alarm yeniden görülürse yeniden AÇ (REOPENED) — yeni kayıt değil
      const occurrence = (row.occurrenceCount ?? 1) + 1;
      await db.update(earlyWarningEvents).set({ ...values, status: "NEW", occurrenceCount: occurrence, resolvedAt: null }).where(eq(earlyWarningEvents.id, row.id));
      await log(row.id, "REOPENED", row.status, "NEW", `Alarm yeniden gözlemlendi (occurrence #${occurrence})`, actor);
      return { id: row.id, created: false, occurrenceCount: occurrence, escalated: false, status: "NEW" };
    }
    const occurrence = (row.occurrenceCount ?? 1) + 1;
    let severity = alert.severity;
    let escalated = false;
    if (occurrence >= repeatEscalationCount && ["NEW", "ACKNOWLEDGED"].includes(row.status) && severityOrder(alert.severity) <= severityOrder(row.severity as EarlyWarningSeverity)) {
      severity = bumpSeverity(row.severity as EarlyWarningSeverity);
      escalated = true;
    }
    await db.update(earlyWarningEvents).set({ ...values, riskScore: String(Math.max(alert.riskScore, severity === row.severity ? alert.riskScore : riskOf(severity))), severity, occurrenceCount: occurrence }).where(eq(earlyWarningEvents.id, row.id));
    await log(row.id, "UPDATED", row.status, row.status, `Tekrar gözlem; occurrence #${occurrence}${escalated ? " — severity eskalasyonu" : ""}`, actor);
    return { id: row.id, created: false, occurrenceCount: occurrence, escalated, status: row.status };
  }

  const [inserted] = await db
    .insert(earlyWarningEvents)
    .values({ ...values, alertKey: alert.alertKey, severity: alert.severity, status: "NEW", occurrenceCount: 1, firstSeenAt: now, createdAt: now })
    .returning({ id: earlyWarningEvents.id });
  await log(inserted.id, "CREATED", null, "NEW", alert.triggerCondition, actor);
  return { id: inserted.id, created: true, occurrenceCount: 1, escalated: false, status: "NEW" };
}

/** Her aksiyonun izin verdiği başlangıç durumları. */
export type AlertTransitionAction = "acknowledge" | "investigate" | "action_required" | "resolve" | "false_positive" | "assign";
const TRANSITIONS: Record<AlertTransitionAction, string[]> = {
  acknowledge: ["NEW"],
  investigate: ["NEW", "ACKNOWLEDGED"],
  action_required: ["ACKNOWLEDGED", "INVESTIGATING", "NEW"],
  resolve: ["NEW", "ACKNOWLEDGED", "INVESTIGATING", "ACTION_REQUIRED"],
  false_positive: ["NEW", "ACKNOWLEDGED", "INVESTIGATING", "ACTION_REQUIRED"],
  assign: ["NEW", "ACKNOWLEDGED", "INVESTIGATING", "ACTION_REQUIRED"],
};
const TARGET: Record<string, string> = {
  acknowledge: "ACKNOWLEDGED",
  investigate: "INVESTIGATING",
  action_required: "ACTION_REQUIRED",
  resolve: "RESOLVED",
  false_positive: "FALSE_POSITIVE",
  assign: "ACKNOWLEDGED",
};

export async function transitionAlert(opts: { id: number; action: AlertTransitionAction; actor: string; note?: string; assignedUser?: string }):
  Promise<{ ok: true; status: string } | { ok: false; error: string }> {
  const [row] = await db.select().from(earlyWarningEvents).where(eq(earlyWarningEvents.id, opts.id)).limit(1);
  if (!row) return { ok: false, error: "Uyarı bulunamadı." };
  const target = TARGET[opts.action];
  if (!TRANSITIONS[opts.action].includes(row.status)) {
    return { ok: false, error: `"${row.status}" durumundan bu işleme izin yok.` };
  }
  const patch: Record<string, unknown> = { status: target, updatedAt: new Date() };
  if (opts.action === "resolve") patch.resolvedAt = new Date();
  if (opts.action === "assign" && opts.assignedUser) { patch.assignedUser = opts.assignedUser; }
  if (opts.note) patch.resolutionNote = opts.note;
  await db.update(earlyWarningEvents).set(patch).where(eq(earlyWarningEvents.id, row.id));
  await log(row.id, opts.action.toUpperCase(), row.status, target, opts.note ?? `${row.status} → ${target}`, opts.actor);
  await db.insert(auditLogs).values({ userId: opts.actor, userName: opts.actor, action: `EARLY_WARNING_${opts.action.toUpperCase()}`, entity: "EarlyWarningEvent", entityId: String(row.id), details: opts.note ?? `${row.status} → ${target}` });
  return { ok: true, status: target };
}

export async function expireStaleAlerts(olderThanDays: number, actor = "Sistem"): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 86400000);
  const rows = await db.select({ id: earlyWarningEvents.id, status: earlyWarningEvents.status })
    .from(earlyWarningEvents)
    .where(and(inArray(earlyWarningEvents.status, ["NEW", "ACKNOWLEDGED", "INVESTIGATING", "ACTION_REQUIRED"]), lt(earlyWarningEvents.lastSeenAt, cutoff)));
  for (const r of rows) {
    await db.update(earlyWarningEvents).set({ status: "EXPIRED", updatedAt: new Date() }).where(eq(earlyWarningEvents.id, r.id));
    await log(r.id, "EXPIRED", r.status, "EXPIRED", `${olderThanDays} gündür yenilenmedi; otomatik EXPIRED`, actor);
  }
  return rows.length;
}

export async function sweepAlerts(olderThanDays = 30, actor = "Sistem"): Promise<number> {
  return expireStaleAlerts(olderThanDays, actor);
}

async function log(eventId: number, action: string, fromStatus: string | null, toStatus: string | null, details: string, actor: string) {
  await db.insert(earlyWarningHistory).values({ eventId, action, fromStatus, toStatus, details, actorName: actor });
}
const num = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : String(Number(v.toFixed(2))));
const severityOrder = (s: EarlyWarningSeverity) => SEV_ORDER.indexOf(s);
const riskOf = (s: EarlyWarningSeverity) => ({ LOW: 12, MODERATE: 37, HIGH: 62, CRITICAL: 87 } as Record<EarlyWarningSeverity, number>)[s];
