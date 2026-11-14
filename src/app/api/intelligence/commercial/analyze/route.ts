import { requireStaff } from "@/lib/auth";
import { runCommercialAnalysis } from "@/lib/intelligence/commercial/service";
import { invalidateIntelligenceCache } from "@/lib/intelligence/service";
import { ok, fail } from "@/lib/intelligence/http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Ticari optimizasyon analizini çalıştır: SUPER_ADMIN/STORE_MANAGER.
// Modül sonuçlarından fırsat havuzuna kayıt bu uçla yazılır (deduplication'lı).
export async function POST(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  const role = (gate.user.role || "").toUpperCase();
  if (role !== "SUPER_ADMIN" && role !== "STORE_MANAGER") {
    return fail(403, "FORBIDDEN", "Ticari optimizasyon analizi yalnız Süper Admin veya Mağaza Müdürü tarafından çalıştırılabilir.");
  }
  try {
    const result = await runCommercialAnalysis(gate.user.name);
    invalidateIntelligenceCache();
    return ok(result);
  } catch (err) {
    console.error("[intelligence/commercial/analyze]", err);
    return fail(500, "INTELLIGENCE_ERROR", "Ticari optimizasyon analizi çalıştırılamadı.");
  }
}
