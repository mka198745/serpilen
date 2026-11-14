import { requireStaff } from "@/lib/auth";
import { loadSalesBundle } from "@/lib/intelligence/repositories";
import { computeCohorts } from "@/lib/intelligence/customers/cohort-engine";
import { cached } from "@/lib/intelligence/service";
import { ok, fail } from "@/lib/intelligence/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  try {
    const data = await cached("cohorts", async () => {
      const bundle = await loadSalesBundle(); // cohort başlangıcı ilk satın almaya göre — tüm geçmiş gerekli
      return computeCohorts(bundle);
    });
    return ok(data);
  } catch (err) {
    console.error("[intelligence/cohorts]", err);
    return fail(500, "INTELLIGENCE_ERROR", "Cohort analizi hesaplanamadı.");
  }
}
