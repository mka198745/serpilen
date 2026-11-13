import { requireStaff } from "@/lib/auth";
import { recordOutcome } from "@/lib/intelligence/decision/outcomes/store";
import { invalidateIntelligenceCache } from "@/lib/intelligence/service";
import { ok, fail } from "@/lib/intelligence/http";

export const dynamic = "force-dynamic";

// Gerçekleşen kâr etkisini kaydet (beklenen vs gerçekleşen)
export async function POST(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  const role = (gate.user.role || "").toUpperCase();
  if (role !== "SUPER_ADMIN" && role !== "STORE_MANAGER") {
    return fail(403, "FORBIDDEN", "Sonuç kaydı yalnız Süper Admin veya Mağaza Müdürü tarafından yapılabilir.");
  }
  try {
    const body = await request.json().catch(() => null);
    if (!body) return fail(400, "VALIDATION", "JSON gövde gerekli.");
    const decisionId = Number(body.decisionId);
    if (!Number.isFinite(decisionId) || decisionId < 1) return fail(400, "VALIDATION", "decisionId gerekli.");
    const actualProfitImpact = Number(body.actualProfitImpact);
    if (!Number.isFinite(actualProfitImpact)) return fail(400, "VALIDATION", "actualProfitImpact sayı olmalı.");
    const result = await recordOutcome({
      decisionId: Math.floor(decisionId),
      actualProfitImpact,
      evaluationWindowStart: body.evaluationWindowStart == null ? null : String(body.evaluationWindowStart).slice(0, 10),
      evaluationWindowEnd: body.evaluationWindowEnd == null ? null : String(body.evaluationWindowEnd).slice(0, 10),
      note: body.note == null ? undefined : String(body.note).trim().slice(0, 2000),
      actor: gate.user.name,
    });
    if (!result.ok) return fail(400, "ACTION_FAILED", result.error);
    invalidateIntelligenceCache();
    return ok(result);
  } catch (err) {
    console.error("[intelligence/decision/outcomes/record]", err);
    return fail(500, "INTELLIGENCE_ERROR", "Sonuç kaydedilemedi.");
  }
}
