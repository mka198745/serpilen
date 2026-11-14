import { requireStaff } from "@/lib/auth";
import { runIntelligenceAnalysis } from "@/lib/intelligence/service";
import { ok, fail } from "@/lib/intelligence/http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Analiz çalıştır: SUPER_ADMIN veya STORE_MANAGER. Tek yazma noktası bu uçtur;
// diğer intelligence uçları salt-okunurdur.
export async function POST(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  const role = (gate.user.role || "").toUpperCase();
  if (role !== "SUPER_ADMIN" && role !== "STORE_MANAGER") {
    return fail(403, "FORBIDDEN", "Analizi yalnız Süper Admin veya Mağaza Müdürü çalıştırabilir.");
  }
  try {
    const result = await runIntelligenceAnalysis(gate.user.name);
    return ok(result);
  } catch (err) {
    console.error("[intelligence/analyze]", err);
    return fail(500, "INTELLIGENCE_ERROR", "Analiz çalıştırılamadı. Detay konsolda.");
  }
}
