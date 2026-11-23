import { requireIntelligenceRead, privateIntelligenceResponse } from "@/lib/intelligence/customer-access";
import { loadSalesBundle } from "@/lib/intelligence/repositories";
import { computeRfm, SEGMENT_ACTIONS } from "@/lib/intelligence/customers/rfm-engine";
import { getIntelligenceSettings, cached } from "@/lib/intelligence/service";
import { fail } from "@/lib/intelligence/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireIntelligenceRead(request, true);
  if (!gate.ok) return gate.response;
  try {
    const settings = await getIntelligenceSettings();
    const periodDays = Number(settings["rfm.period_days"]) || 365;
    const churnDays = Number(settings["churn.days"]) || 90;
    const data = await cached(`rfm:${periodDays}`, async () => {
      const bundle = await loadSalesBundle();
      const rfm = computeRfm(bundle, periodDays);
      const churnRisk = rfm.rows.filter((r) => r.recencyDays > churnDays).slice(0, 50).map((r) => ({
        customerId: r.customerId,
        customerName: r.customerName,
        recencyDays: r.recencyDays,
        frequency: r.frequency,
        monetary: r.monetary,
        segment: r.segment,
      }));
      return { ...rfm, churnRisk, churnDays, segmentActions: SEGMENT_ACTIONS };
    });
    return privateIntelligenceResponse(data);
  } catch (err) {
    console.error("[intelligence/rfm]", err);
    return fail(500, "INTELLIGENCE_ERROR", "RFM analizi hesaplanamadı.");
  }
}
