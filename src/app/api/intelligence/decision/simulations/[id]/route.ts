import { requireStaff } from "@/lib/auth";
import { getScenarioWithResults } from "@/lib/intelligence/decision/simulation/store";
import { ok, fail } from "@/lib/intelligence/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  try {
    const { id } = await params;
    const n = Number(id);
    if (!Number.isFinite(n) || n < 1) return fail(400, "VALIDATION", "Geçersiz senaryo id.");
    const detail = await getScenarioWithResults(Math.floor(n));
    if (!detail) return fail(404, "NOT_FOUND", "Senaryo bulunamadı.");
    return ok(detail);
  } catch (err) {
    console.error("[intelligence/decision/simulations/:id]", err);
    return fail(500, "INTELLIGENCE_ERROR", "Senaryo detayı alınamadı.");
  }
}
