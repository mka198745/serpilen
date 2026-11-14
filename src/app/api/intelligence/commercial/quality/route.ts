import { requireStaff } from "@/lib/auth";
import { getQualityAnalysis } from "@/lib/intelligence/commercial/service";
import { ok, fail } from "@/lib/intelligence/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  try {
    return ok(await getQualityAnalysis());
  } catch (err) {
    console.error("[intelligence/commercial/quality]", err);
    return fail(500, "INTELLIGENCE_ERROR", "Ticari optimizasyon analizi hesaplanamadı.");
  }
}
