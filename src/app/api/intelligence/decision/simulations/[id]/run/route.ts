import { requireStaff } from "@/lib/auth";
import { getScenarioWithResults, saveScenarioResult } from "@/lib/intelligence/decision/simulation/store";
import { runScenario, type SimulationCategory, type SimulationParams } from "@/lib/intelligence/decision/simulation/engine";
import { buildBaseline } from "@/lib/intelligence/decision/simulation/baseline";
import { ok, fail } from "@/lib/intelligence/http";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Kayıtlı senaryoyu güncel veriyle yeniden çalıştırır
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  try {
    const { id } = await params;
    const n = Number(id);
    if (!Number.isFinite(n) || n < 1) return fail(400, "VALIDATION", "Geçersiz senaryo id.");
    const detail = await getScenarioWithResults(Math.floor(n));
    if (!detail) return fail(404, "NOT_FOUND", "Senaryo bulunamadı.");
    const periodDaysRaw = detail.periodStart && detail.periodEnd ? Math.max(7, Math.round((new Date(detail.periodEnd).getTime() - new Date(detail.periodStart).getTime()) / 86400000)) : 90;
    // Kapsam bilgisi getScenarioWithResults'ta taşınmıyor; STORE/global baseline varsayılır
    const baseline = await buildBaseline(detail.category as SimulationCategory, null, null, periodDaysRaw);
    const result = runScenario(detail.category as SimulationCategory, baseline, detail.parameters as SimulationParams);
    const resultId = await saveScenarioResult({ scenarioId: detail.id, result, actor: gate.user.name });
    return ok({ id: detail.id, ran: true, resultId, result });
  } catch (err) {
    console.error("[intelligence/decision/simulations/:id/run]", err);
    return fail(500, "INTELLIGENCE_ERROR", "Senaryo çalıştırılamadı.");
  }
}
