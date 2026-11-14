import { requireStaff } from "@/lib/auth";
import { ok, fail } from "@/lib/intelligence/http";
import { listGoalsWithProgress, createGoal, validateGoalInput, type GoalInput } from "@/lib/intelligence/decision/goals/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status")?.toUpperCase() || undefined;
    const { goals, conflicts } = await listGoalsWithProgress({ status });
    return ok({ goals, conflicts });
  } catch (err) {
    console.error("[intelligence/decision/goals]", err);
    return fail(500, "INTELLIGENCE_ERROR", "Hedefler alınamadı.");
  }
}

export async function POST(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  const role = (gate.user.role || "").toUpperCase();
  if (role !== "SUPER_ADMIN" && role !== "STORE_MANAGER") {
    return fail(403, "FORBIDDEN", "Hedef oluşturma yalnız Süper Admin veya Mağaza Müdürü tarafından yapılabilir.");
  }
  try {
    const body = await request.json().catch(() => null);
    if (!body) return fail(400, "VALIDATION", "JSON gövde gerekli.");
    const input: GoalInput = {
      name: String(body.name ?? "").trim(),
      category: String(body.category ?? "").toUpperCase(),
      kpi: String(body.kpi ?? "").toUpperCase(),
      unit: String(body.unit ?? "TL").slice(0, 16),
      baselineValue: body.baselineValue != null && Number.isFinite(Number(body.baselineValue)) ? Number(body.baselineValue) : null,
      targetValue: Number(body.targetValue),
      direction: String(body.direction ?? "HIGHER_BETTER").toUpperCase() as GoalInput["direction"],
      startDate: String(body.startDate ?? new Date().toISOString().slice(0, 10)).slice(0, 10),
      endDate: String(body.endDate ?? "").slice(0, 10),
      responsibleUser: body.responsibleUser == null ? null : String(body.responsibleUser).trim().slice(0, 128),
      priority: String(body.priority ?? "MEDIUM").toUpperCase(),
      measurementMethod: String(body.measurementMethod ?? "AUTO").toUpperCase(),
      notes: body.notes == null ? null : String(body.notes).slice(0, 2000),
    };
    const validation = validateGoalInput(input);
    if (!validation.ok) return fail(400, "VALIDATION", validation.errors.join(" "));
    const id = await createGoal(input, gate.user.name);
    return ok({ id, created: true });
  } catch (err) {
    console.error("[intelligence/decision/goals POST]", err);
    return fail(500, "INTELLIGENCE_ERROR", "Hedef oluşturulamadı.");
  }
}
