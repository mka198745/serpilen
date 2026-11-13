import { requireStaff } from "@/lib/auth";
import {
  getOpportunityDetail,
  transitionOpportunity,
  completeOpportunityWithImpact,
} from "@/lib/intelligence/commercial/service";
import { invalidateIntelligenceCache } from "@/lib/intelligence/service";
import { ok, fail } from "@/lib/intelligence/http";

export const dynamic = "force-dynamic";

async function parseId(params: Promise<{ id: string }>) {
  const { id } = await params;
  const n = Number(id);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  try {
    const id = await parseId(params);
    if (id == null) return fail(400, "VALIDATION", "Geçersiz fırsat id.");
    const detail = await getOpportunityDetail(id);
    if (!detail) return fail(404, "NOT_FOUND", "Fırsat bulunamadı. Önce 'analyze' çalıştırın.");
    return ok(detail);
  } catch (err) {
    console.error("[intelligence/commercial/opportunities/:id GET]", err);
    return fail(500, "INTELLIGENCE_ERROR", "Fırsat detayı alınamadı.");
  }
}

const ACTIONS = new Set(["review", "approve", "reject", "start", "cancel", "reopen", "complete"]);

// Fırsat yaşam döngüsü aksiyonları (yönetici onayı) + gerçekleşen etki kaydı.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  const role = (gate.user.role || "").toUpperCase();
  if (role !== "SUPER_ADMIN" && role !== "STORE_MANAGER") {
    return fail(403, "FORBIDDEN", "Fırsat aksiyonları yalnız Süper Admin veya Mağaza Müdürü tarafından yapılabilir.");
  }
  try {
    const id = await parseId(params);
    if (id == null) return fail(400, "VALIDATION", "Geçersiz fırsat id.");
    const body = await request.json().catch(() => null);
    const action = String(body?.action ?? "").toLowerCase();
    if (!ACTIONS.has(action)) return fail(400, "VALIDATION", "Geçersiz aksiyon (review|approve|reject|start|cancel|reopen|complete).");
    const note = body?.note == null ? undefined : String(body.note).trim().slice(0, 1000);

    if (action === "complete") {
      const actual = Number(body?.actualProfitImpact);
      if (!Number.isFinite(actual)) return fail(400, "VALIDATION", "actualProfitImpact sayı olmalı.");
      const ws = body?.windowStart == null ? undefined : String(body.windowStart).slice(0, 10);
      const we = body?.windowEnd == null ? undefined : String(body.windowEnd).slice(0, 10);
      const result = await completeOpportunityWithImpact({ id, actualProfitImpact: actual, note, windowStart: ws, windowEnd: we, actor: gate.user.name });
      invalidateIntelligenceCache();
      return ok(result);
    }

    const ownerName = body?.ownerName == null ? undefined : String(body.ownerName).trim().slice(0, 128);
    const result = await transitionOpportunity({ id, action, actor: gate.user.name, note, ownerName });
    invalidateIntelligenceCache();
    return ok(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fırsat aksiyonu uygulanamadı.";
    console.error("[intelligence/commercial/opportunities/:id POST]", err);
    return fail(400, "ACTION_FAILED", message);
  }
}
