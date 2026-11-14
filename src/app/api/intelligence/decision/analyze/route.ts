import { requireStaff } from "@/lib/auth";
import { runDecisionAnalysis } from "@/lib/intelligence/decision/orchestrator/orchestrator";
import { ok, fail } from "@/lib/intelligence/http";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Manuel tam analiz (MANUAL mod — tek desteklenen mod). Kayıt üretir; yönetici onayı gerekir.
export async function POST(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  const role = (gate.user.role || "").toUpperCase();
  if (role !== "SUPER_ADMIN" && role !== "STORE_MANAGER") {
    return fail(403, "FORBIDDEN", "Karar analizi yalnız Süper Admin veya Mağaza Müdürü tarafından çalıştırılabilir.");
  }
  try {
    const body = await request.json().catch(() => ({}));
    const persist = body?.persist !== false; // varsayılan: kayıt üret
    const mode = "MANUAL"; // ilk sürüm — başka mod yok
    const result = await runDecisionAnalysis({ actor: gate.user.name, mode, persist });
    return ok(result);
  } catch (err) {
    console.error("[intelligence/decision/analyze]", err);
    const message = err instanceof Error ? err.message : "Analiz çalıştırılamadı.";
    return fail(500, "INTELLIGENCE_ERROR", message);
  }
}
