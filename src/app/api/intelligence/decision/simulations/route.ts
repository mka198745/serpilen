import { requireStaff } from "@/lib/auth";
import { ok, fail } from "@/lib/intelligence/http";
import { db } from "@/db";
import { listScenarios, createScenarioDefinition, saveScenarioResult } from "@/lib/intelligence/decision/simulation/store";
import { runScenario, validateParams, SIMULATION_CATEGORIES, type SimulationCategory, type SimulationParams } from "@/lib/intelligence/decision/simulation/engine";
import { buildBaseline } from "@/lib/intelligence/decision/simulation/baseline";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  try {
    const items = await listScenarios(50);
    return ok({ items });
  } catch (err) {
    console.error("[intelligence/decision/simulations]", err);
    return fail(500, "INTELLIGENCE_ERROR", "Senaryo listesi alınamadı.");
  }
}

// Yeni senaryo oluştur (ve isteğe bağlı hemen çalıştır)
export async function POST(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  const role = (gate.user.role || "").toUpperCase();
  if (role !== "SUPER_ADMIN" && role !== "STORE_MANAGER") {
    return fail(403, "FORBIDDEN", "Senaryo oluşturma yalnız Süper Admin veya Mağaza Müdürü tarafından yapılabilir.");
  }
  try {
    const body = await request.json().catch(() => null);
    if (!body) return fail(400, "VALIDATION", "JSON gövde gerekli.");
    const name = String(body.name ?? "").trim();
    if (name.length < 3) return fail(400, "VALIDATION", "name en az 3 karakter olmalı.");
    const category = String(body.category ?? "").toUpperCase() as SimulationCategory;
    if (!SIMULATION_CATEGORIES.includes(category)) return fail(400, "VALIDATION", `category ${SIMULATION_CATEGORIES.join("|")} olmalı.`);
    const parameters = (body.parameters ?? {}) as SimulationParams;
    const validation = validateParams(category, parameters);
    if (!validation.ok) return fail(400, "VALIDATION", validation.errors.join(" "));
    const periodDaysRaw = Number(body.periodDays ?? 90);
    const periodDays = Number.isFinite(periodDaysRaw) ? Math.min(365, Math.max(7, periodDaysRaw)) : 90;
    const scopeType = body.scopeType ? String(body.scopeType).toUpperCase() : null;
    const scopeId = body.scopeId != null && Number.isFinite(Number(body.scopeId)) ? Math.floor(Number(body.scopeId)) : null;
    const periodStart = new Date(Date.now() - periodDays * 86400000).toISOString().slice(0, 10);
    const periodEnd = new Date().toISOString().slice(0, 10);

    const id = await createScenarioDefinition({
      name,
      description: String(body.description ?? "").slice(0, 1000),
      category,
      scopeType: scopeType as "PRODUCT" | "CATEGORY" | "STORE" | null,
      scopeId,
      parameters,
      periodStart,
      periodEnd,
      actor: gate.user.name,
    });

    if (body.run === false) return ok({ id, created: true, ran: false });

    const baseline = await buildBaseline(category, scopeType, scopeId, periodDays);
    const result = runScenario(category, baseline, parameters);
    const resultId = await saveScenarioResult({ scenarioId: id, result, periodStart, periodEnd, actor: gate.user.name });
    return ok({ id, created: true, ran: true, resultId, result });
  } catch (err) {
    console.error("[intelligence/decision/simulations POST]", err);
    const message = err instanceof Error ? err.message : "Senaryo oluşturulamadı.";
    return fail(500, "INTELLIGENCE_ERROR", message);
  }
}
