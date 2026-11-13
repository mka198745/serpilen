import { requireStaff } from "@/lib/auth";
import { ok, fail } from "@/lib/intelligence/http";
import { db } from "@/db";
import { intelligenceSettings, auditLogs } from "@/db/schema";
import { FAZ3_DEFAULTS, mergeFaz3Settings, validateFaz3Setting } from "@/lib/intelligence/decision/core/settings";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  try {
    const rows = await db.select({ key: intelligenceSettings.key, value: intelligenceSettings.value }).from(intelligenceSettings);
    const merged = mergeFaz3Settings(rows);
    const items = Object.entries(FAZ3_DEFAULTS).map(([key, def]) => ({
      key,
      value: merged[key],
      defaultValue: def.value,
      description: def.description,
      min: def.min ?? null,
      max: def.max ?? null,
      overridden: merged[key] !== def.value,
    }));
    return ok({ items });
  } catch (err) {
    console.error("[intelligence/decision/settings]", err);
    return fail(500, "INTELLIGENCE_ERROR", "FAZ 3 ayarları alınamadı.");
  }
}

export async function PUT(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  const role = (gate.user.role || "").toUpperCase();
  if (role !== "SUPER_ADMIN") {
    return fail(403, "FORBIDDEN", "Karar ayarlarını yalnız Süper Admin değiştirebilir.");
  }
  try {
    const body = await request.json().catch(() => null);
    const key = String(body?.key ?? "").trim();
    const value = String(body?.value ?? "").trim();
    const error = validateFaz3Setting(key, value);
    if (error) return fail(400, "VALIDATION", error);
    const [existing] = await db.select().from(intelligenceSettings).where(eq(intelligenceSettings.key, key)).limit(1);
    if (existing) {
      await db.update(intelligenceSettings).set({ value, updatedAt: new Date() }).where(eq(intelligenceSettings.key, key));
    } else {
      await db.insert(intelligenceSettings).values({ key, value, description: FAZ3_DEFAULTS[key]?.description ?? "", updatedAt: new Date() });
    }
    await db.insert(auditLogs).values({ userId: gate.user.name, userName: gate.user.name, action: "FAZ3_SETTING_UPDATED", entity: "IntelligenceSetting", entityId: key, details: `${key} = ${value}` });
    return ok({ key, value });
  } catch (err) {
    console.error("[intelligence/decision/settings PUT]", err);
    return fail(500, "INTELLIGENCE_ERROR", "Ayar kaydedilemedi.");
  }
}
