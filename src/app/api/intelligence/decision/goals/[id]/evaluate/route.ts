import { requireStaff } from "@/lib/auth";
import { evaluateGoalOutcome } from "@/lib/intelligence/decision/goals/store";
import { ok, fail } from "@/lib/intelligence/http";

export const dynamic = "force-dynamic";

// Hedef dönem sonu değerlendirmesi: hedefte mi / kaçtı mı?
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  const role = (gate.user.role || "").toUpperCase();
  if (role !== "SUPER_ADMIN" && role !== "STORE_MANAGER") {
    return fail(403, "FORBIDDEN", "Hedef değerlendirmesi yalnız Süper Admin veya Mağaza Müdürü tarafından yapılabilir.");
  }
  try {
    const { id } = await params;
    const n = Number(id);
    if (!Number.isFinite(n) || n < 1) return fail(400, "VALIDATION", "Geçersiz hedef id.");
    const result = await evaluateGoalOutcome(Math.floor(n), gate.user.name);
    if ("error" in result) return fail(404, "NOT_FOUND", result.error);
    return ok(result);
  } catch (err) {
    console.error("[intelligence/decision/goals/:id/evaluate]", err);
    return fail(500, "INTELLIGENCE_ERROR", "Hedef değerlendirilemedi.");
  }
}
