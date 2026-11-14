/**
 * Senaryo kalıcılığı — tanım + çalıştırma sonucu (para/metrik JSON).
 * Gerçek kayıtlar DEĞİŞMEZ; sonuçlar salt analizdir.
 */
import { db } from "@/db";
import { scenarioDefinitions, scenarioResults, auditLogs } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import type { ScenarioResult, SimulationCategory, SimulationParams } from "./engine";
import { SCENARIO_ALGORITHM_VERSION } from "../core/confidence";

export async function createScenarioDefinition(opts: {
  name: string;
  description?: string;
  category: SimulationCategory;
  scopeType?: "PRODUCT" | "CATEGORY" | "STORE" | null;
  scopeId?: number | null;
  parameters: SimulationParams;
  periodStart?: string | null;
  periodEnd?: string | null;
  actor: string;
}): Promise<number> {
  const [row] = await db.insert(scenarioDefinitions).values({
    name: opts.name,
    description: opts.description ?? "",
    category: opts.category,
    scopeType: opts.scopeType ?? null,
    scopeId: opts.scopeId ?? null,
    parameters: JSON.stringify(opts.parameters),
    periodStart: opts.periodStart ?? null,
    periodEnd: opts.periodEnd ?? null,
    createdBy: opts.actor,
    updatedAt: new Date(),
  }).returning({ id: scenarioDefinitions.id });
  await writeAudit("SCENARIO_CREATED", row.id, `Senaryo oluşturuldu: ${opts.name} (${opts.category})`, opts.actor);
  return row.id;
}

export async function saveScenarioResult(opts: {
  scenarioId: number;
  result: ScenarioResult;
  periodStart?: string | null;
  periodEnd?: string | null;
  actor: string;
}): Promise<number> {
  const r = opts.result;
  const [row] = await db.insert(scenarioResults).values({
    scenarioId: opts.scenarioId,
    runAt: new Date(),
    baselineMetrics: JSON.stringify(r.baseline),
    scenarioMetrics: JSON.stringify(r.expected),
    baseCase: JSON.stringify(r.baseline),
    expectedCase: JSON.stringify(r.expected),
    bestCase: r.best ? JSON.stringify({ ...r.best, label: r.bestCaseLabel }) : null,
    worstCase: r.worst ? JSON.stringify({ ...r.worst, label: r.worstCaseLabel }) : null,
    financialImpact: JSON.stringify(r.financialImpact),
    riskScore: r.riskScore != null ? String(r.riskScore) : null,
    confidence: r.confidence != null ? String(r.confidence) : null,
    dataCoverage: r.dataCoverage != null ? String(r.dataCoverage) : null,
    assumptions: JSON.stringify(r.assumptions),
    notes: r.isAssumptionBasedInterval ? "Best/Worst VARSAYIMSAL bant (etiketli)." : "Best/Worst kullanıcı aralığı.",
    algorithmVersion: SCENARIO_ALGORITHM_VERSION,
  }).returning({ id: scenarioResults.id });
  await writeAudit("SCENARIO_RUN", opts.scenarioId, `Senaryo çalıştırıldı (#${opts.scenarioId}), sonuç #${row.id}`, opts.actor);
  return row.id;
}

export async function listScenarios(limit = 50) {
  const rows = await db.select().from(scenarioDefinitions).orderBy(desc(scenarioDefinitions.createdAt)).limit(limit);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    category: r.category,
    scopeType: r.scopeType,
    scopeId: r.scopeId,
    parameters: safeJson(r.parameters, {}),
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
  }));
}

export async function getScenarioWithResults(id: number) {
  const [def] = await db.select().from(scenarioDefinitions).where(eq(scenarioDefinitions.id, id)).limit(1);
  if (!def) return null;
  const results = await db.select().from(scenarioResults).where(eq(scenarioResults.scenarioId, id)).orderBy(desc(scenarioResults.runAt)).limit(10);
  const parsedResults = results.map((r) => ({
    id: r.id,
    runAt: r.runAt,
    baselineMetrics: safeJson(r.baselineMetrics, {}),
    scenarioMetrics: safeJson(r.scenarioMetrics, {}),
    baseCase: r.baseCase ? safeJson(r.baseCase, null) : null,
    expectedCase: r.expectedCase ? safeJson(r.expectedCase, null) : null,
    bestCase: r.bestCase ? safeJson(r.bestCase, null) : null,
    worstCase: r.worstCase ? safeJson(r.worstCase, null) : null,
    financialImpact: safeJson(r.financialImpact, {}),
    riskScore: r.riskScore != null ? Number(r.riskScore) : null,
    confidence: r.confidence != null ? Number(r.confidence) : null,
    dataCoverage: r.dataCoverage != null ? Number(r.dataCoverage) : null,
    assumptions: r.assumptions ? safeJson(r.assumptions, []) : [],
    notes: r.notes,
    algorithmVersion: r.algorithmVersion,
  }));
  return {
    id: def.id,
    name: def.name,
    description: def.description,
    category: def.category,
    parameters: safeJson(def.parameters, {}),
    periodStart: def.periodStart,
    periodEnd: def.periodEnd,
    createdBy: def.createdBy,
    createdAt: def.createdAt,
    results: parsedResults,
  };
}

async function writeAudit(action: string, entityId: number, details: string, actor: string) {
  await db.insert(auditLogs).values({ userId: actor, userName: actor, action, entity: "ScenarioDefinition", entityId: String(entityId), details });
}

function safeJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}
