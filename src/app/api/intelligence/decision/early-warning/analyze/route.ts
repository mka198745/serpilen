import { requireStaff } from "@/lib/auth";
import { runDecisionAnalysis } from "@/lib/intelligence/decision/orchestrator/orchestrator";
import { ok, fail } from "@/lib/intelligence/http";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Erken uyarı taraması (otomatik karar üretimini de idempotent çalıştırır)
export async function POST(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  const role = (gate.user.role || "").toUpperCase();
  if (role !== "SUPER_ADMIN" && role !== "STORE_MANAGER") {
    return fail(403, "FORBIDDEN", "Erken uyarı taraması yalnız Süper Admin veya Mağaza Müdürü tarafından çalıştırılabilir.");
  }
  try {
    const result = await runDecisionAnalysis({ actor: gate.user.name, mode: "MANUAL", persist: true });
    return ok({ alerts: result.alerts, summary: result.summary, notes: result.notes });
  } catch (err) {
    console.error("[intelligence/decision/early-warning/analyze]", err);
    return fail(500, "INTELLIGENCE_ERROR", "Tarama çalıştırılamadı.");
  }
}
