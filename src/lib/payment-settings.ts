import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PAYMENT_DEFAULTS, PAYMENT_KEYS, PAYMENT_SECRET_KEYS, type MaskedPaymentSettings } from "./payment-settings-shared";

/**
 * Ödeme API ayarları — app_settings tablosunda `site.payment.*` anahtarlarıyla saklanır.
 * Bu modül YALNIZCA SUNUCUDA kullanılır (db importu nedeniyle istemciye alınamaz).
 * Gizli anahtarlar yalnızca burada ve /api/payment-settings içinde okunur;
 * /api/site-settings bunları ASLA dışarı vermez (DEFAULT_SITE_SETTINGS kapsamı dışıdır).
 */

function clean(v: unknown, max = 300): string {
  return String(v ?? "").trim().slice(0, max);
}

/** Ham (gizli anahtarlar dâhil) kayıtlar — yalnızca sunucu içi kullanım. */
export async function getPaymentSettingsRaw(): Promise<Record<string, string>> {
  const rows = await db.select().from(appSettings);
  const out: Record<string, string> = { ...PAYMENT_DEFAULTS };
  for (const r of rows) {
    if (r.key in PAYMENT_DEFAULTS) out[r.key] = r.value;
  }
  return out;
}

/** Yönetim paneline dönen MASTELİ görünüm: gizli değerler ASLA döndürülmez. */
export async function getPaymentSettingsMasked(): Promise<MaskedPaymentSettings> {
  const raw = await getPaymentSettingsRaw();
  return {
    paytr: {
      enabled: raw["site.payment.paytr.enabled"] === "true",
      mode: raw["site.payment.paytr.mode"] === "live" ? "live" : "test",
      merchantId: raw["site.payment.paytr.merchant_id"],
      currency: raw["site.payment.paytr.currency"] || "TL",
      maxInstallment: raw["site.payment.paytr.max_installment"] || "1",
      hasMerchantKey: Boolean(raw["site.payment.paytr.merchant_key"]),
      hasMerchantSalt: Boolean(raw["site.payment.paytr.merchant_salt"]),
    },
    iyzico: {
      enabled: raw["site.payment.iyzico.enabled"] === "true",
      mode: raw["site.payment.iyzico.mode"] === "live" ? "live" : "sandbox",
      apiKey: raw["site.payment.iyzico.api_key"],
      threedsRequired: raw["site.payment.iyzico.threeds_required"] !== "false",
      hasApiSecret: Boolean(raw["site.payment.iyzico.api_secret"]),
    },
  };
}

export class PaymentValidationError extends Error {}

/**
 * Kaydeder. Gizli anahtarlarda boş dize = "değiştirme" (mevcut değer korunur).
 * Sağlayıcı etkinleştirilecekse zorunlu alanların dolu olması gerekir.
 */
export async function savePaymentSettings(patch: Record<string, unknown>): Promise<void> {
  const current = await getPaymentSettingsRaw();
  const merged: Record<string, string> = { ...current };

  for (const key of PAYMENT_KEYS) {
    if (!(key in patch)) continue;
    const value = clean(patch[key], 500);
    if ((PAYMENT_SECRET_KEYS as readonly string[]).includes(key) && value === "") {
      continue; // boş gizli alan = mevcut korunur
    }
    merged[key] = value;
  }

  // Açık sağlayıcılar için zorunlu alan doğrulaması
  const errors: string[] = [];
  if (merged["site.payment.paytr.enabled"] === "true") {
    if (!merged["site.payment.paytr.merchant_id"]) errors.push("PayTR Mağaza No zorunludur.");
    else if (!/^\d{3,12}$/.test(merged["site.payment.paytr.merchant_id"])) errors.push("PayTR Mağaza No yalnızca rakam olmalıdır.");
    if (!merged["site.payment.paytr.merchant_key"]) errors.push("PayTR Mağaza Parola zorunludur.");
    if (!merged["site.payment.paytr.merchant_salt"]) errors.push("PayTR Gizli Tuz zorunludur.");
  }
  if (merged["site.payment.iyzico.enabled"] === "true") {
    if (!merged["site.payment.iyzico.api_key"]) errors.push("iyzico API Key zorunludur.");
    if (!merged["site.payment.iyzico.api_secret"]) errors.push("iyzico Secret Key zorunludur.");
  }
  if (merged["site.payment.paytr.mode"] !== "live" && merged["site.payment.paytr.mode"] !== "test") merged["site.payment.paytr.mode"] = "test";
  if (merged["site.payment.iyzico.mode"] !== "live" && merged["site.payment.iyzico.mode"] !== "sandbox") merged["site.payment.iyzico.mode"] = "sandbox";
  if (errors.length) throw new PaymentValidationError(errors.join(" "));

  for (const key of PAYMENT_KEYS) {
    const value = merged[key];
    if (value === current[key]) continue; // değişmeyen satır yazılmaz
    const exists = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
    if (exists.length > 0) {
      await db.update(appSettings).set({ value, updatedAt: new Date() }).where(eq(appSettings.key, key));
    } else {
      await db.insert(appSettings).values({ key, value, description: "Ödeme API ayarı" });
    }
  }
}
