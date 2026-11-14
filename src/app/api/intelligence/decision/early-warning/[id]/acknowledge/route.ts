import { requireStaff } from "@/lib/auth";
import { transitionAlert, type AlertTransitionAction } from "@/lib/intelligence/decision/early-warning/store";
import { ok, fail } from "@/lib/intelligence/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  const role = (gate.user.role || "").toUpperCase();
  if (role !== "SUPER_ADMIN" && role !== "STORE_MANAGER") {
    return fail(403, "FORBIDDEN", "Uyarı aksiyonları yalnız Süper Admin veya Mağaza Müdürü tarafından yapılabilir.");
  }
  try {
    const { id } = await params;
    const n = Number(id);
    if (!Number.isFinite(n) || n < 1) return fail(400, "VALIDATION", "Geçersiz uyarı id.");
    const body = await request.json().catch(() => ({}));
    const note = body?.note == null ? undefined : String(body.note).trim().slice(0, 1000);
    const assignedUser = body?.assignedUser == null ? undefined : String(body.assignedUser).trim().slice(0, 128);
    const result = await transitionAlert({ id: Math.floor(n), action: "acknowledge" as AlertTransitionAction, actor: gate.user.name, note, assignedUser });
    if (!result.ok) return fail(400, "ACTION_FAILED", result.error);
    return ok(result);
  } catch (err) {
    console.error("[intelligence/decision/early-warning/:id/acknowledge]", err);
    return fail(500, "INTELLIGENCE_ERROR", "Uyarı aksiyonu uygulanamadı.");
  }
}
