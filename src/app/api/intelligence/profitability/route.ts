import { requireStaff } from "@/lib/auth";
import { loadSalesBundle } from "@/lib/intelligence/repositories";
import { computeProfitability } from "@/lib/intelligence/profitability/profit-engine";
import { cached } from "@/lib/intelligence/service";
import { ok, fail, numParam } from "@/lib/intelligence/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  try {
    const url = new URL(request.url);
    const topN = numParam(url, "topN", 25, 5, 100);
    if ("error" in topN) return fail(400, "VALIDATION", topN.error);
    const data = await cached(`profit:${topN.value}`, async () => {
      const bundle = await loadSalesBundle();
      return computeProfitability(bundle, topN.value);
    });
    return ok(data);
  } catch (err) {
    console.error("[intelligence/profitability]", err);
    return fail(500, "INTELLIGENCE_ERROR", "Kârlılık analizi hesaplanamadı.");
  }
}
