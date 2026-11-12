import { requireStaff } from "@/lib/auth";
import { getIntelligenceSettings, putIntelligenceSetting, invalidateIntelligenceCache, DEFAULT_SETTINGS } from "@/lib/intelligence/service";
import { ok, fail } from "@/lib/intelligence/http";

export const dynamic = "force-dynamic";

// Ayarları listele: tüm personel okuyabilir
export async function GET(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  try {
    const values = await getIntelligenceSettings();
    const items = Object.entries(DEFAULT_SETTINGS).map(([key, def]) => ({
      key,
      value: values[key] ?? def.value,
      description: def.description,
      defaultValue: def.value,
    }));
    return ok({ items });
  } catch (err) {
    console.error("[intelligence/settings GET]", err);
    return fail(500, "INTELLIGENCE_ERROR", "Ayarlar okunamadı.");
  }
}

// Ayar güncelle: yalnız SUPER_ADMIN
export async function PUT(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  if (gate.user.role !== "SUPER_ADMIN") {
    return fail(403, "FORBIDDEN", "Intelligence ayarlarını yalnız Süper Admin değiştirebilir.");
  }
  try {
    const body = await request.json().catch(() => null);
    const key = String(body?.key ?? "");
    const value = String(body?.value ?? "");
    const description = typeof body?.description === "string" ? body.description : undefined;
    if (!key || !(key in DEFAULT_SETTINGS)) return fail(400, "VALIDATION", "Bilinmeyen ayar anahtarı.");
    await putIntelligenceSetting(key, value, description, gate.user.name);
    invalidateIntelligenceCache();
    const values = await getIntelligenceSettings();
    return ok({ key, value: values[key] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Ayar güncellenemedi.";
    console.error("[intelligence/settings PUT]", err);
    return fail(400, "VALIDATION", msg);
  }
}
