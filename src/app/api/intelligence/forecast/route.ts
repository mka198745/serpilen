import { requireStaff } from "@/lib/auth";
import { loadSalesBundle } from "@/lib/intelligence/repositories";
import { getForecast, cached } from "@/lib/intelligence/service";
import { ok, fail, numParam } from "@/lib/intelligence/http";
import type { ForecastScope } from "@/lib/intelligence/forecasting/forecaster";

export const dynamic = "force-dynamic";

const VALID_SCOPES = new Set(["STORE", "CATEGORY", "PRODUCT"]);
const HORIZONS = new Set([7, 14, 30, 60, 90]);

export async function GET(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  try {
    const url = new URL(request.url);
    const rawScope = (url.searchParams.get("scope") || "STORE").toUpperCase();
    if (!VALID_SCOPES.has(rawScope)) return fail(400, "VALIDATION", "scope STORE, CATEGORY veya PRODUCT olmalı.");
    const scope = rawScope as ForecastScope;

    const scopeIdRaw = url.searchParams.get("scopeId");
    let scopeId: number | null = null;
    if (scope !== "STORE") {
      if (!scopeIdRaw) return fail(400, "VALIDATION", "CATEGORY/PRODUCT için scopeId gerekli.");
      scopeId = Number(scopeIdRaw);
      if (!Number.isFinite(scopeId) || scopeId < 1) return fail(400, "VALIDATION", "scopeId pozitif tam sayı olmalı.");
    }

    const horizonP = numParam(url, "horizon", 7, 1, 365);
    if ("error" in horizonP) return fail(400, "VALIDATION", horizonP.error);
    const horizon = horizonP.value;
    if (!HORIZONS.has(horizon)) return fail(400, "VALIDATION", "horizon 7, 14, 30, 60 veya 90 olmalı.");

    const data = await cached(`forecast:${scope}:${scopeId}:${horizon}`, async () => {
      const bundle = await loadSalesBundle();
      return getForecast(bundle, scope, scopeId, horizon);
    });
    return ok(data);
  } catch (err) {
    console.error("[intelligence/forecast]", err);
    return fail(500, "INTELLIGENCE_ERROR", "Tahmin hesaplanamadı.");
  }
}
