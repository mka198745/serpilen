import { requireStaff } from "@/lib/auth";
import { loadSalesBundle } from "@/lib/intelligence/repositories";
import { computeAbcXyz, CLASS_ACTIONS } from "@/lib/intelligence/inventory/abc-xyz";
import { getIntelligenceSettings, cached } from "@/lib/intelligence/service";
import { ok, fail } from "@/lib/intelligence/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  try {
    const settings = await getIntelligenceSettings();
    const data = await cached("abcxyz", async () => {
      const bundle = await loadSalesBundle();
      const report = computeAbcXyz(bundle, {
        aPercent: Number(settings["abc.a_percent"]),
        bPercent: Number(settings["abc.b_percent"]),
        xMaxCv: Number(settings["xyz.x_max_cv"]),
        yMaxCv: Number(settings["xyz.y_max_cv"]),
      });
      return { ...report, classActions: CLASS_ACTIONS };
    });
    return ok(data);
  } catch (err) {
    console.error("[intelligence/abc-xyz]", err);
    return fail(500, "INTELLIGENCE_ERROR", "ABC-XYZ sınıflandırması hesaplanamadı.");
  }
}
