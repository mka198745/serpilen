import { requireStaff } from "@/lib/auth";
import { loadSalesBundle } from "@/lib/intelligence/repositories";
import { getAnomalies, cached } from "@/lib/intelligence/service";
import { ok, fail } from "@/lib/intelligence/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  try {
    const data = await cached("anomalies", async () => {
      const bundle = await loadSalesBundle();
      return getAnomalies(bundle);
    });
    return ok(data);
  } catch (err) {
    console.error("[intelligence/anomalies]", err);
    return fail(500, "INTELLIGENCE_ERROR", "Anomali taraması hesaplanamadı.");
  }
}
