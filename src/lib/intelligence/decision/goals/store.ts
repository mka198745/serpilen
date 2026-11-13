/** Yönetim hedefleri kalıcılığı — CRUD + ölçüm + yaşam döngüsü + audit. */
import { db } from "@/db";
import { managementGoals, auditLogs } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { measureKpi, KPI_AUTO_SUPPORTED, type GoalKpi } from "./kpi-metrics";
import { goalProgress, goalForecast, detectGoalConflicts, type GoalDirection } from "./goals-engine";

export interface GoalRow {
  id: number;
  name: string;
  category: string;
  kpi: string;
  unit: string;
  baselineValue: number | null;
  targetValue: number;
  currentValue: number | null;
  direction: GoalDirection;
  startDate: string;
  endDate: string;
  responsibleUser: string | null;
  priority: string;
  status: string;
  measurementMethod: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface GoalWithProgress extends GoalRow {
  progressPct: number | null;
  remaining: number | null;
  onTrack: boolean | null;
  daysRemaining: number;
  forecast: {
    projected: number | null;
    targetProbability: number | null;
    dailySlope: number | null;
    residualStddev: number | null;
    daysRemaining: number;
    note: string | null;
  };
  autoSupported: boolean;
  measureNote: string | null;
}

const mapRow = (r: typeof managementGoals.$inferSelect): GoalRow => ({
  id: r.id,
  name: r.name,
  category: r.category,
  kpi: r.kpi,
  unit: r.unit,
  baselineValue: r.baselineValue != null ? Number(r.baselineValue) : null,
  targetValue: Number(r.targetValue),
  currentValue: r.currentValue != null ? Number(r.currentValue) : null,
  direction: r.direction as GoalDirection,
  startDate: r.startDate,
  endDate: r.endDate,
  responsibleUser: r.responsibleUser,
  priority: r.priority,
  status: r.status,
  measurementMethod: r.measurementMethod,
  notes: r.notes,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

export async function listGoalsWithProgress(opts?: { status?: string }): Promise<{ goals: GoalWithProgress[]; conflicts: ReturnType<typeof detectGoalConflicts> }> {
  const q = db.select().from(managementGoals).orderBy(desc(managementGoals.createdAt));
  const rows = (opts?.status ? await q.where(eq(managementGoals.status, opts.status)) : await q).map(mapRow);

  // AUTO hedefler için ölçümü (taze) yap — ama ölçüm maliyeti için yalnız çağrıldığında; listelemede progress stored currentValue ile.
  const goals: GoalWithProgress[] = rows.map((g) => toProgressView(g, null, null));
  const conflicts = detectGoalConflicts(rows.map((g) => ({ id: g.id, name: g.name, kpi: g.kpi, direction: g.direction as string, status: g.status })));
  return { goals, conflicts };
}

function toProgressView(g: GoalRow, measurement: Awaited<ReturnType<typeof measureKpi>> | null, forecastDays: number | null): GoalWithProgress {
  const current = measurement?.value !== undefined ? measurement.value : g.currentValue;
  const progress = goalProgress({ baseline: g.baselineValue, target: g.targetValue, current, direction: g.direction });
  const forecast = goalForecast({
    dailySeries: measurement?.dailySeries ?? null,
    target: g.targetValue,
    direction: g.direction,
    endDate: g.endDate,
    minDays: 14,
  });
  const daysRemaining = Math.max(0, Math.ceil((new Date(g.endDate).getTime() - Date.now()) / 86400000));
  return {
    ...g,
    currentValue: current,
    progressPct: progress.pct,
    remaining: progress.remaining,
    onTrack: progress.onTrack,
    daysRemaining,
    forecast,
    autoSupported: KPI_AUTO_SUPPORTED.includes(g.kpi as GoalKpi),
    measureNote: measurement?.note ?? null,
  };
}

/** Tek hedefi (ve AUTO ise taze) ölçer; currentValue'yu DB'de günceller (AUTO ise). */
export async function measureAndUpdateGoal(id: number, actor: string): Promise<GoalWithProgress | null> {
  const [row] = await db.select().from(managementGoals).where(eq(managementGoals.id, id)).limit(1);
  if (!row) return null;
  const g = mapRow(row);
  let measurement: Awaited<ReturnType<typeof measureKpi>> | null = null;
  if (g.measurementMethod === "AUTO" && KPI_AUTO_SUPPORTED.includes(g.kpi as GoalKpi)) {
    measurement = await measureKpi(g.kpi as GoalKpi, g.startDate, g.endDate);
    if (measurement.value != null) {
      await db.update(managementGoals).set({ currentValue: String(measurement.value), updatedAt: new Date() }).where(eq(managementGoals.id, id));
      g.currentValue = measurement.value;
    }
  }
  const view = toProgressView(g, measurement, null);
  await db.insert(auditLogs).values({ userId: actor, userName: actor, action: "GOAL_MEASURED", entity: "ManagementGoal", entityId: String(id), details: `Hedef ölçüldü: ${g.name} → ${view.currentValue ?? "ölçülemedi"} ${g.unit} (%${view.progressPct ?? "?"})` });
  return view;
}

/** Hedefin dönem sonu durumunu değerlendirir (progress ≥ 1 → ACHIEVED; endDate geçtiyse ve < 1 → MISSED). */
export async function evaluateGoalOutcome(id: number, actor: string): Promise<{ status: string } | { error: string }> {
  const [row] = await db.select().from(managementGoals).where(eq(managementGoals.id, id)).limit(1);
  if (!row) return { error: "Hedef bulunamadı." };
  const g = mapRow(row);
  const progress = goalProgress({ baseline: g.baselineValue, target: g.targetValue, current: g.currentValue, direction: g.direction });
  const endPassed = new Date(g.endDate).getTime() < Date.now();
  let status = row.status;
  if (progress.ratio != null && progress.ratio >= 1) status = "ACHIEVED";
  else if (endPassed) status = "MISSED";
  if (status !== row.status) {
    await db.update(managementGoals).set({ status, updatedAt: new Date() }).where(eq(managementGoals.id, id));
    await db.insert(auditLogs).values({ userId: actor, userName: actor, action: "GOAL_STATUS_CHANGED", entity: "ManagementGoal", entityId: String(id), details: `${row.status} → ${status}` });
  }
  return { status };
}

export interface GoalInput {
  name: string;
  category: string;
  kpi: string;
  unit: string;
  baselineValue?: number | null;
  targetValue: number;
  direction: GoalDirection;
  startDate: string;
  endDate: string;
  responsibleUser?: string | null;
  priority: string;
  measurementMethod: string;
  notes?: string | null;
}

const KPI_CATEGORY: Record<string, string[]> = {
  FINANCIAL: ["REVENUE", "GROSS_PROFIT", "CONTRIBUTION_MARGIN", "ROAS"],
  SALES: ["REVENUE", "ORDER_COUNT", "AVG_ORDER_VALUE", "GROSS_PROFIT", "CONTRIBUTION_MARGIN"],
  INVENTORY: ["DEAD_STOCK_VALUE", "FILL_RATE_PCT"],
  PROCUREMENT: ["FILL_RATE_PCT", "ON_TIME_PCT", "DEAD_STOCK_VALUE"],
  MARKETING: ["ROAS", "REVENUE", "ORDER_COUNT", "AVG_ORDER_VALUE"],
  QUALITY: ["RETURN_RATE"],
};

export function validateGoalInput(input: Partial<GoalInput>): { ok: true; errors: [] } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!input.name || input.name.trim().length < 3) errors.push("Hedef adı en az 3 karakter olmalı.");
  if (!input.category || !KPI_CATEGORY[input.category]) errors.push(`Kategori FINANCIAL|SALES|INVENTORY|PROCUREMENT|MARKETING|QUALITY olmalı.`);
  if (!input.kpi) errors.push("KPI zorunludur.");
  else if (input.category && KPI_CATEGORY[input.category] && !KPI_CATEGORY[input.category].includes(input.kpi)) {
    errors.push(`"${input.kpi}" KPI'sı ${input.category} kategorisiyle uyumlu değil (${KPI_CATEGORY[input.category].join(", ")}).`);
  }
  if (input.targetValue == null || !Number.isFinite(input.targetValue)) errors.push("targetValue sayısal olmalı.");
  if (!input.startDate || isNaN(new Date(input.startDate).getTime())) errors.push("Geçerli startDate (YYYY-MM-DD) gerekli.");
  if (!input.endDate || isNaN(new Date(input.endDate).getTime())) errors.push("Geçerli endDate (YYYY-MM-DD) gerekli.");
  if (input.startDate && input.endDate && new Date(input.endDate) <= new Date(input.startDate)) errors.push("endDate, startDate'ten sonra olmalı.");
  if (!["HIGHER_BETTER", "LOWER_BETTER"].includes(input.direction ?? "")) errors.push("direction HIGHER_BETTER|LOWER_BETTER olmalı.");
  if (!["LOW", "MEDIUM", "HIGH"].includes(input.priority ?? "")) errors.push("priority LOW|MEDIUM|HIGH olmalı.");
  if (!["AUTO", "MANUAL"].includes(input.measurementMethod ?? "")) errors.push("measurementMethod AUTO|MANUAL olmalı.");
  return errors.length ? { ok: false, errors } : { ok: true, errors: [] };
}

export async function createGoal(input: GoalInput, actor: string): Promise<number> {
  const [row] = await db.insert(managementGoals).values({
    name: input.name.trim(),
    category: input.category,
    kpi: input.kpi,
    unit: input.unit || "TL",
    baselineValue: input.baselineValue != null ? String(input.baselineValue) : null,
    targetValue: String(input.targetValue),
    direction: input.direction,
    startDate: input.startDate,
    endDate: input.endDate,
    responsibleUser: input.responsibleUser ?? null,
    priority: input.priority,
    status: "ACTIVE",
    measurementMethod: input.measurementMethod,
    notes: input.notes ?? null,
    updatedAt: new Date(),
  }).returning({ id: managementGoals.id });
  await db.insert(auditLogs).values({ userId: actor, userName: actor, action: "GOAL_CREATED", entity: "ManagementGoal", entityId: String(row.id), details: `Hedef oluşturuldu: ${input.name} (${input.kpi} → ${input.targetValue} ${input.unit})` });
  return row.id;
}

export async function updateGoal(id: number, patch: Partial<GoalInput> & { currentValue?: number | null; status?: string }, actor: string): Promise<{ ok: boolean; error?: string }> {
  const [existing] = await db.select().from(managementGoals).where(eq(managementGoals.id, id)).limit(1);
  if (!existing) return { ok: false, error: "Hedef bulunamadı." };
  const merged: GoalInput = {
    name: patch.name ?? existing.name,
    category: patch.category ?? existing.category,
    kpi: patch.kpi ?? existing.kpi,
    unit: patch.unit ?? existing.unit,
    baselineValue: patch.baselineValue !== undefined ? patch.baselineValue : existing.baselineValue != null ? Number(existing.baselineValue) : null,
    targetValue: patch.targetValue ?? Number(existing.targetValue),
    direction: (patch.direction ?? existing.direction) as GoalDirection,
    startDate: patch.startDate ?? existing.startDate,
    endDate: patch.endDate ?? existing.endDate,
    responsibleUser: patch.responsibleUser !== undefined ? patch.responsibleUser : existing.responsibleUser,
    priority: patch.priority ?? existing.priority,
    measurementMethod: patch.measurementMethod ?? existing.measurementMethod,
    notes: patch.notes !== undefined ? patch.notes : existing.notes,
  };
  const validation = validateGoalInput(merged);
  if (!validation.ok) return { ok: false, error: validation.errors.join(" ") };
  await db.update(managementGoals).set({
    name: merged.name,
    category: merged.category,
    kpi: merged.kpi,
    unit: merged.unit,
    baselineValue: merged.baselineValue != null ? String(merged.baselineValue) : null,
    targetValue: String(merged.targetValue),
    direction: merged.direction,
    startDate: merged.startDate,
    endDate: merged.endDate,
    responsibleUser: merged.responsibleUser,
    priority: merged.priority,
    measurementMethod: merged.measurementMethod,
    notes: merged.notes,
    ...(patch.currentValue !== undefined ? { currentValue: patch.currentValue != null ? String(patch.currentValue) : null } : {}),
    ...(patch.status ? { status: patch.status } : {}),
    updatedAt: new Date(),
  }).where(eq(managementGoals.id, id));
  await db.insert(auditLogs).values({ userId: actor, userName: actor, action: "GOAL_UPDATED", entity: "ManagementGoal", entityId: String(id), details: `Hedef güncellendi: ${merged.name}` });
  return { ok: true };
}
