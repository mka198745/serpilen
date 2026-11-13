import { requireStaff } from "@/lib/auth";
import { getPricingAnalysis } from "@/lib/intelligence/commercial/service";
import { ok, fail } from "@/lib/intelligence/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  try {
    return ok(await getPricingAnalysis());
  } catch (err) {
    console.error("[intelligence/commercial/pricing]", err);
    return fail(500, "INTELLIGENCE_ERROR", "Ticari optimizasyon analizi hesaplanamadı.");
  }
}
