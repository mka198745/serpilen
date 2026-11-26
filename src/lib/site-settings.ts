import { db, sqlite } from "@/db";
import { appSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { DEFAULT_SITE_SETTINGS } from "./site-settings-shared";

/**
 * Site başlık/altbilgi (header/footer) ayarları.
 * app_settings tablosunda `site.*` anahtarlarıyla saklanır;
 * veritabanında kayıt yoksa DEFAULT_SITE_SETTINGS kullanılır.
 */

export function getSiteSettingsSync(): Record<string, string> {
  const rows = db.select().from(appSettings).all();
  const out: Record<string, string> = { ...DEFAULT_SITE_SETTINGS };
  for (const r of rows) {
    if (r.key in DEFAULT_SITE_SETTINGS) out[r.key] = r.value;
  }
  return out;
}

export async function getSiteSettings(): Promise<Record<string, string>> { return getSiteSettingsSync(); }

/** Yalnızca bilinen site.* anahtarları kaydedilir. Boş nesne = değişiklik yok. */
export async function saveSiteSettings(patch: Record<string, unknown>): Promise<void> {
  sqlite.transaction(() => {
    for (const [key, raw] of Object.entries(patch)) {
      if (!(key in DEFAULT_SITE_SETTINGS)) continue;
      const value = String(raw ?? "");
      const exists = db.select().from(appSettings).where(eq(appSettings.key, key)).get();
      if (exists) db.update(appSettings).set({ value, updatedAt: new Date() }).where(eq(appSettings.key, key)).run();
      else db.insert(appSettings).values({ key, value, description: "Site yönetimi ayarı" }).run();
    }
  }).immediate();
}
