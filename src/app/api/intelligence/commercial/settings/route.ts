import { requireStaff } from "@/lib/auth";
import { getFaz2Settings, putFaz2Setting } from "@/lib/intelligence/commercial/service";
import { ok, fail } from "@/lib/intelligence/http";
import { invalidateIntelligenceCache } from "@/lib/intelligence/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  try {
    return ok({ settings: await getFaz2Settings() });
  } catch (err) {
    console.error("[intelligence/commercial/settings GET]", err);
    return fail(500, "INTELLIGENCE_ERROR", "FAZ 2 ayarları okunamadı.");
  }
}

export async function PUT(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  const role = (gate.user.role || "").toUpperCase();
  if (role !== "SUPER_ADMIN" && role !== "STORE_MANAGER") {
    return fail(403, "FORBIDDEN", "Ayarları yalnız Süper Admin veya Mağaza Müdürü değiştirebilir.");
  }
  try {
    const body = await request.json().catch(() => null);
    const key = String(body?.key ?? "").trim();
    const value = String(body?.value ?? "").trim();
    if (!key || !value) return fail(400, "VALIDATION", "key ve value zorunlu.");
    await putFaz2Setting(key, value, gate.user.name);
    invalidateIntelligenceCache();
    return ok({ key, value });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ayar kaydedilemedi.";
    return fail(400, "VALIDATION", message);
  }
}
