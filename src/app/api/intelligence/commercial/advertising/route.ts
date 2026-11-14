import { requireStaff } from "@/lib/auth";
import { listAdvertising, addAdvertising, deleteAdvertising } from "@/lib/intelligence/commercial/service";
import { ok, fail, numParam } from "@/lib/intelligence/http";
import { invalidateIntelligenceCache } from "@/lib/intelligence/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  try {
    return ok({ items: await listAdvertising() });
  } catch (err) {
    console.error("[intelligence/commercial/advertising GET]", err);
    return fail(500, "INTELLIGENCE_ERROR", "Reklam kayıtları okunamadı.");
  }
}

export async function POST(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  const role = (gate.user.role || "").toUpperCase();
  if (role !== "SUPER_ADMIN" && role !== "STORE_MANAGER") {
    return fail(403, "FORBIDDEN", "Reklam kaydı yalnız Süper Admin veya Mağaza Müdürü tarafından eklenebilir.");
  }
  try {
    const body = await request.json().catch(() => ({}));
    const result = await addAdvertising(body as Record<string, unknown>, gate.user.name);
    invalidateIntelligenceCache();
    return ok(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reklam kaydı eklenemedi.";
    return fail(400, "VALIDATION", message);
  }
}

export async function DELETE(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  const role = (gate.user.role || "").toUpperCase();
  if (role !== "SUPER_ADMIN" && role !== "STORE_MANAGER") {
    return fail(403, "FORBIDDEN", "Reklam kaydı yalnız Süper Admin veya Mağaza Müdürü tarafından silinebilir.");
  }
  try {
    const url = new URL(request.url);
    const idParam = numParam(url, "id", -1, 1, 2147483647);
    if ("error" in idParam) return fail(400, "VALIDATION", "Geçerli bir id parametresi gerekli.");
    const result = await deleteAdvertising(idParam.value, gate.user.name);
    invalidateIntelligenceCache();
    return ok(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reklam kaydı silinemedi.";
    return fail(400, "VALIDATION", message);
  }
}
