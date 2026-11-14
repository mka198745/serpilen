import { requireStaff } from "@/lib/auth";
import { ok, fail } from "@/lib/intelligence/http";
import { updateGoal, type GoalInput } from "@/lib/intelligence/decision/goals/store";

export const dynamic = "force-dynamic";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  const role = (gate.user.role || "").toUpperCase();
  if (role !== "SUPER_ADMIN" && role !== "STORE_MANAGER") {
    return fail(403, "FORBIDDEN", "Hedef güncelleme yalnız Süper Admin veya Mağaza Müdürü tarafından yapılabilir.");
  }
  try {
    const { id } = await params;
    const n = Number(id);
    if (!Number.isFinite(n) || n < 1) return fail(400, "VALIDATION", "Geçersiz hedef id.");
    const body = await request.json().catch(() => ({}));
    const patch: Partial<GoalInput> & { currentValue?: number | null; status?: string } = {};
    for (const key of ["name", "category", "kpi", "unit", "startDate", "endDate", "responsibleUser", "priority", "measurementMethod", "notes", "direction"] as const) {
      if (body[key] !== undefined) (patch as Record<string, unknown>)[key] = typeof body[key] === "string" ? String(body[key]).trim() : body[key];
    }
    for (const key of ["baselineValue", "targetValue", "currentValue"] as const) {
      if (body[key] !== undefined) {
        const parsed = body[key] == null || !Number.isFinite(Number(body[key])) ? null : Number(body[key]);
        if (key === "currentValue") patch.currentValue = parsed;
        else if (key === "baselineValue") patch.baselineValue = parsed ?? undefined;
        else if (parsed == null) return fail(400, "VALIDATION", "targetValue sayı olmalı.");
        else patch.targetValue = parsed;
      }
    }
    if (body.status !== undefined) patch.status = String(body.status).toUpperCase();
    const result = await updateGoal(Math.floor(n), patch, gate.user.name);
    if (!result.ok) return fail(400, "VALIDATION", result.error ?? "Hedef güncellenemedi.");
    return ok({ id: Math.floor(n), updated: true });
  } catch (err) {
    console.error("[intelligence/decision/goals/:id PUT]", err);
    return fail(500, "INTELLIGENCE_ERROR", "Hedef güncellenemedi.");
  }
}
