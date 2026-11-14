import { requireStaff } from "@/lib/auth";
import { measureAndUpdateGoal } from "@/lib/intelligence/decision/goals/store";
import { ok, fail } from "@/lib/intelligence/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// AUTO hedefin güncel değerini ölçer (gerçek veri) ve progress/forecast hesaplar
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  try {
    const { id } = await params;
    const n = Number(id);
    if (!Number.isFinite(n) || n < 1) return fail(400, "VALIDATION", "Geçersiz hedef id.");
    const view = await measureAndUpdateGoal(Math.floor(n), gate.user.name);
    if (!view) return fail(404, "NOT_FOUND", "Hedef bulunamadı.");
    return ok(view);
  } catch (err) {
    console.error("[intelligence/decision/goals/:id/measure]", err);
    return fail(500, "INTELLIGENCE_ERROR", "Hedef ölçülemedi.");
  }
}
