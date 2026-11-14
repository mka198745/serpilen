import { requireStaff } from "@/lib/auth";
import { getScenarioWithResults } from "@/lib/intelligence/decision/simulation/store";
import { ok, fail } from "@/lib/intelligence/http";

export const dynamic = "force-dynamic";

// 2-5 senaryonun son sonuçlarını yan yana karşılaştırır
export async function POST(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  try {
    const body = await request.json().catch(() => null);
    const rawIds: unknown[] = Array.isArray(body?.ids) ? body.ids : [];
    const ids = rawIds.map((v) => Number(v)).filter((n: number) => Number.isFinite(n) && n >= 1);
    if (ids.length < 2 || ids.length > 5) return fail(400, "VALIDATION", "ids 2-5 adet senaryo id'si içermeli.");
    const rows = [];
    for (const id of [...new Set(ids.map((n: number) => Math.floor(n)))]) {
      const detail = await getScenarioWithResults(id);
      if (!detail) continue;
      const latest = detail.results[0] ?? null;
      rows.push({
        id: detail.id,
        name: detail.name,
        category: detail.category,
        parameters: detail.parameters,
        latestRunAt: latest?.runAt ?? null,
        financialImpact: latest?.financialImpact ?? null,
        riskScore: latest?.riskScore ?? null,
        confidence: latest?.confidence ?? null,
        notes: latest?.notes ?? null,
      });
    }
    return ok({ items: rows });
  } catch (err) {
    console.error("[intelligence/decision/simulations/compare]", err);
    return fail(500, "INTELLIGENCE_ERROR", "Karşılaştırma alınamadı.");
  }
}
