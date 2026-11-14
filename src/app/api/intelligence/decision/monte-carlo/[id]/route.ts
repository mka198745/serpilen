import { requireStaff } from "@/lib/auth";
import { getMonteCarloRun } from "@/lib/intelligence/decision/monte-carlo/store";
import { ok, fail } from "@/lib/intelligence/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  try {
    const { id } = await params;
    const n = Number(id);
    if (!Number.isFinite(n) || n < 1) return fail(400, "VALIDATION", "Geçersiz kayıt id.");
    const row = await getMonteCarloRun(Math.floor(n));
    if (!row) return fail(404, "NOT_FOUND", "Kayıt bulunamadı.");
    return ok(row);
  } catch (err) {
    console.error("[intelligence/decision/monte-carlo/:id]", err);
    return fail(500, "INTELLIGENCE_ERROR", "Kayıt alınamadı.");
  }
}
