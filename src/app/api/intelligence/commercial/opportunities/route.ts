import { requireStaff } from "@/lib/auth";
import { listOpportunities } from "@/lib/intelligence/commercial/service";
import { ok, fail, numParam } from "@/lib/intelligence/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  try {
    const url = new URL(request.url);
    const statusRaw = url.searchParams.get("status"); // virgülle ayrılmış
    const status = statusRaw ? statusRaw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean) : undefined;
    const type = url.searchParams.get("type")?.trim().toUpperCase() || undefined;
    const sourceModule = url.searchParams.get("module")?.trim().toLowerCase() || undefined;
    const limit = numParam(url, "limit", 50, 1, 200);
    if ("error" in limit) return fail(400, "VALIDATION", limit.error);
    const offset = numParam(url, "offset", 0, 0, 100000);
    if ("error" in offset) return fail(400, "VALIDATION", offset.error);
    const data = await listOpportunities({ status, type, sourceModule, limit: limit.value, offset: offset.value });
    return ok(data);
  } catch (err) {
    console.error("[intelligence/commercial/opportunities]", err);
    return fail(500, "INTELLIGENCE_ERROR", "Fırsat listesi alınamadı.");
  }
}
