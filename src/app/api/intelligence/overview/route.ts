import { requireStaff } from "@/lib/auth";
import { loadSalesBundle } from "@/lib/intelligence/repositories";
import { getOverview, cached } from "@/lib/intelligence/service";
import { ok, fail } from "@/lib/intelligence/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  try {
    const data = await cached("overview", async () => {
      const bundle = await loadSalesBundle();
      return getOverview(bundle);
    });
    return ok(data);
  } catch (err) {
    console.error("[intelligence/overview]", err);
    return fail(500, "INTELLIGENCE_ERROR", "Genel bakış hesaplanamadı.");
  }
}
