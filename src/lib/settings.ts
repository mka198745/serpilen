import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

export const DEFAULT_SETTINGS: Record<string, { value: string; description: string }> = {
  "loyalty.earn_rate_tl": { value: "100", description: "Kaç TL harcamaya puan kazanılır" },
  "loyalty.earn_points": { value: "10", description: "Kazanılan puan miktarı" },
  "loyalty.point_value_tl": { value: "0.5", description: "1 puanın TL karşılığı (harcarken)" },
  "loyalty.expire_days": { value: "365", description: "Puan son kullanma günü (0 = süresiz)" },
  "reservation.minutes": { value: "15", description: "Stok rezervasyon süresi (dakika)" },
  "shipping.free_threshold": { value: "1000", description: "Ücretsiz kargo eşiği (TL)" },
};

export async function getSettings(): Promise<Record<string, string>> {
  const rows = await db.select().from(appSettings);
  const out: Record<string, string> = {};
  for (const [k, def] of Object.entries(DEFAULT_SETTINGS)) out[k] = def.value;
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export async function saveSettings(patch: Record<string, string>) {
  for (const [key, value] of Object.entries(patch)) {
    const exists = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
    if (exists.length > 0) {
      await db.update(appSettings).set({ value, updatedAt: new Date() }).where(eq(appSettings.key, key));
    } else {
      await db.insert(appSettings).values({ key, value, description: DEFAULT_SETTINGS[key]?.description || null });
    }
  }
}
