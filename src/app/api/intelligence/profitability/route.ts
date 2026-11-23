import { requireIntelligenceRead, privateIntelligenceResponse } from "@/lib/intelligence/customer-access";
import { roleCanAccessModule } from "@/lib/role-matrix-server";
import { loadSalesBundle } from "@/lib/intelligence/repositories";
import { computeProfitability } from "@/lib/intelligence/profitability/profit-engine";
import { cached } from "@/lib/intelligence/service";
import { fail, numParam } from "@/lib/intelligence/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireIntelligenceRead(request);
  if (!gate.ok) return gate.response;
  try {
    const url = new URL(request.url);
    const topN = numParam(url, "topN", 25, 5, 100);
    if ("error" in topN) return fail(400, "VALIDATION", topN.error);
    const data = await cached(`profit:${topN.value}`, async () => {
      const bundle = await loadSalesBundle();
      return computeProfitability(bundle, topN.value);
    });
    // The cache is shared between requests; never mutate its privileged copy.
    const canReadCustomers = roleCanAccessModule(gate.matrix, gate.user.role, "crm");
    const canReadOrders = roleCanAccessModule(gate.matrix, gate.user.role, "orders");
    // Unlinked guest entries encode an order ID and name. CRM permission alone does not grant those orders.
    const customers = canReadCustomers ? (canReadOrders ? data.levels.customer : data.levels.customer.filter(row => !row.key.startsWith("walkin-"))) : null;
    return privateIntelligenceResponse({ ...data, levels: { ...data.levels, customer: customers, order: canReadOrders ? data.levels.order : null } });
  } catch (err) {
    console.error("[intelligence/profitability]", err);
    return fail(500, "INTELLIGENCE_ERROR", "Kârlılık analizi hesaplanamadı.");
  }
}
