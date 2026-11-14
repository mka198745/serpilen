import { requireStaff } from "@/lib/auth";
import { transitionDecision, type DecisionTransitionAction } from "@/lib/intelligence/decision/core/decision-store";
import { invalidateIntelligenceCache } from "@/lib/intelligence/service";
import { ok, fail } from "@/lib/intelligence/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  const role = (gate.user.role || "").toUpperCase();
  if (role !== "SUPER_ADMIN" && role !== "STORE_MANAGER") {
    return fail(403, "FORBIDDEN", "Karar aksiyonları yalnız Süper Admin veya Mağaza Müdürü tarafından yapılabilir.");
  }
  try {
    const { id } = await params;
    const n = Number(id);
    if (!Number.isFinite(n) || n < 1) return fail(400, "VALIDATION", "Geçersiz karar id.");
    const body = await request.json().catch(() => ({}));
    const note = body?.note == null ? undefined : String(body.note).trim().slice(0, 1000);
    const result = await transitionDecision({ id: Math.floor(n), action: "review" as DecisionTransitionAction, actor: gate.user.name, note });
    if (!result.ok) return fail(400, "ACTION_FAILED", result.error);
    invalidateIntelligenceCache();
    return ok(result);
  } catch (err) {
    console.error("[intelligence/decision/:id/review]", err);
    return fail(500, "INTELLIGENCE_ERROR", "Karar aksiyonu uygulanamadı.");
  }
}
