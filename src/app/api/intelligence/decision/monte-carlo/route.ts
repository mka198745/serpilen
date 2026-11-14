import { requireStaff } from "@/lib/auth";
import { listMonteCarloRuns } from "@/lib/intelligence/decision/monte-carlo/store";
import { ok, fail } from "@/lib/intelligence/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  try {
    const items = await listMonteCarloRuns(30);
    return ok({ items });
  } catch (err) {
    console.error("[intelligence/decision/monte-carlo]", err);
    return fail(500, "INTELLIGENCE_ERROR", "Monte Carlo çalıştırmaları alınamadı.");
  }
}
