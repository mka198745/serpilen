import { requireStaff } from "@/lib/auth";
import { computeEffectiveness } from "@/lib/intelligence/decision/outcomes/store";
import { ok, fail } from "@/lib/intelligence/http";

export const dynamic = "force-dynamic";

// Karar etkinliği metrikleri + tür kırılımı
export async function GET(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  try {
    return ok(await computeEffectiveness());
  } catch (err) {
    console.error("[intelligence/decision/outcomes]", err);
    return fail(500, "INTELLIGENCE_ERROR", "Karar etkinliği hesaplanamadı.");
  }
}
