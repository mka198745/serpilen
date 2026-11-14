/**
 * Ödeme API (PayTR / iyzico) ayarlarının istemci+sunucu ortak kısmı.
 * DİKKAT: Gizli anahtarların VARSAYILAN DEĞERLERİ BOŞTUR ve istemci paketine
 * gerçek değer ASLA gömülmez — yalnızca anahtar adları ve boş varsayılanlar.
 */
export const PAYMENT_DEFAULTS: Record<string, string> = {
  // PayTR
  "site.payment.paytr.enabled": "false",
  "site.payment.paytr.mode": "test", // test | live
  "site.payment.paytr.merchant_id": "",
  "site.payment.paytr.merchant_key": "", // GİZLİ
  "site.payment.paytr.merchant_salt": "", // GİZLİ
  "site.payment.paytr.currency": "TL",
  "site.payment.paytr.max_installment": "1",
  // iyzico
  "site.payment.iyzico.enabled": "false",
  "site.payment.iyzico.mode": "sandbox", // sandbox | live
  "site.payment.iyzico.api_key": "",
  "site.payment.iyzico.api_secret": "", // GİZLİ
  "site.payment.iyzico.threeds_required": "true",
};

export const PAYMENT_KEYS = Object.keys(PAYMENT_DEFAULTS);

/** Yanıtlarda/istemcide ASLA değeri dönülmeyen gizli anahtarlar */
export const PAYMENT_SECRET_KEYS = [
  "site.payment.paytr.merchant_key",
  "site.payment.paytr.merchant_salt",
  "site.payment.iyzico.api_secret",
] as const;

export const PAYTR_KEYS = PAYMENT_KEYS.filter((k) => k.startsWith("site.payment.paytr."));
export const IYZICO_KEYS = PAYMENT_KEYS.filter((k) => k.startsWith("site.payment.iyzico."));

export interface MaskedPaymentSettings {
  paytr: {
    enabled: boolean;
    mode: "test" | "live";
    merchantId: string;
    currency: string;
    maxInstallment: string;
    /** Gizli anahtarın sunucuda kayıtlı olup olmadığı (değeri DEĞİL) */
    hasMerchantKey: boolean;
    hasMerchantSalt: boolean;
  };
  iyzico: {
    enabled: boolean;
    mode: "sandbox" | "live";
    apiKey: string;
    threedsRequired: boolean;
    hasApiSecret: boolean;
  };
}
