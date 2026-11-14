/** Header/Footer ayar varsayılanları — istemci ve sunucu ortak kullanır (db importu yoktur). */
export const DEFAULT_SITE_SETTINGS: Record<string, string> = {
  // Header
  "site.header.announcement_enabled": "true",
  "site.header.announcement_text": "1.000 TL ve Üzeri Ücretsiz Kargo | Aynı Gün Hızlı Gönderim",
  "site.header.support_phone": "0850 888 20 26",
  // Her iki bölümde de kullanılan marka
  "site.brand_name": "SERPİLEN COLLECTION",
  "site.brand_tagline": "Dikiş, Nakış, Fermuar & Hobi",
  // Footer
  "site.footer.description":
    "1994 yılından bu yana kaliteli dikiş iplikleri, fermuarlar, düğmeler, kurdeleler ve örgü malzemeleriyle terzilerin, moda tasarımcılarının ve hobi tutkunlarının yanındayız.",
  "site.footer.store_address": "Moda Cad. No: 18, Kadıköy / İstanbul",
  "site.footer.warehouse_address": "İkitelli OSB Dokumacılar San. Sitesi No: 42, İstanbul",
  "site.footer.phone_line": "0850 888 20 26 & 0216 333 44 55",
  "site.footer.email": "siparis@serpilencollection.com",
  "site.footer.copyright": "© 2026 Serpilen Collection San. ve Tic. Ltd. Şti. Tüm Hakları Saklıdır.",
  // Sosyal medya (boş bırakılan ikon footer'da gösterilmez)
  "site.social.instagram": "",
  "site.social.facebook": "",
  "site.social.youtube": "",
  "site.social.tiktok": "",
  "site.social.x": "",
  "site.social.linkedin": "",
  // Sepet (cart) — üst header'daki "Sepetim" düğmesi ve sepet çekmecesi
  "site.cart.enabled": "true",
  "site.cart.free_shipping_threshold": "1000",
  "site.cart.shipping_fee": "59",
  "site.cart.notice": "14 gün içinde koşulsuz iade • Aynı gün hızlı gönderim",
  "site.cart.empty_message": "Dikiş iplikleri, fermuarlar, düğmeler ve örgü malzemelerimize göz atın.",
  "site.cart.trust_text": "256-Bit SSL & 3D Secure Güvenli Ödeme Altyapısı",
  // Güvenli Sipariş Tamamlama & Ödeme (checkout) — Sepetim Ayarı, 2. bölüm
  "site.checkout.title": "Güvenli Sipariş Tamamlama & Ödeme",
  "site.checkout.payment_card_enabled": "true",
  "site.checkout.payment_eft_enabled": "true",
  "site.checkout.card_note": "3D Secure ile anında onay",
  "site.checkout.eft_note": "Havale / EFT ile transfer",
  "site.checkout.eft_bank": "Türkiye İş Bankası — Kadıköy Şubesi",
  "site.checkout.eft_iban": "TR12 0006 4000 0011 2345 6789 01",
  "site.checkout.eft_account_name": "Serpilen Collection San. ve Tic. Ltd. Şti.",
  "site.checkout.trust_text": "256-Bit SSL & 3D Secure Güvenli Ödeme",
  "site.checkout.success_note": "Siparişiniz alındı; ödeme adımınız tamamlandığında depomuz hazırlığa başlar.",
};

export const SITE_SETTING_KEYS = Object.keys(DEFAULT_SITE_SETTINGS);

export interface CartSettings {
  enabled: boolean;
  /** 0 = ücretsiz kargo kuralı kapalı */
  freeShippingThreshold: number;
  /** 0 = kargo her zaman ücretsiz */
  shippingFee: number;
  notice: string;
  emptyMessage: string;
  trustText: string;
}

const toAmount = (raw: string | undefined, fallback: number): number => {
  const n = parseFloat(String(raw ?? "").trim().replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

/** site.cart.* anahtarlarını tiplenmiş CartSettings'e çevirir (istemci+sunucu). */
export function parseCartSettings(s: Record<string, string>): CartSettings {
  return {
    enabled: (s["site.cart.enabled"] ?? "true") !== "false",
    freeShippingThreshold: toAmount(s["site.cart.free_shipping_threshold"], 1000),
    shippingFee: toAmount(s["site.cart.shipping_fee"], 59),
    notice: (s["site.cart.notice"] ?? "").trim(),
    emptyMessage: (s["site.cart.empty_message"] ?? "").trim(),
    trustText: (s["site.cart.trust_text"] ?? "").trim(),
  };
}

export interface CheckoutSettings {
  title: string;
  paymentCardEnabled: boolean;
  paymentEftEnabled: boolean;
  cardNote: string;
  eftNote: string;
  eftBank: string;
  eftIban: string;
  eftAccountName: string;
  trustText: string;
  successNote: string;
}

/** site.checkout.* anahtarlarını tiplenmiş CheckoutSettings'e çevirir (istemci+sunucu). */
export function parseCheckoutSettings(s: Record<string, string>): CheckoutSettings {
  return {
    title: (s["site.checkout.title"] ?? "").trim() || "Güvenli Sipariş Tamamlama & Ödeme",
    paymentCardEnabled: (s["site.checkout.payment_card_enabled"] ?? "true") !== "false",
    paymentEftEnabled: (s["site.checkout.payment_eft_enabled"] ?? "true") !== "false",
    cardNote: (s["site.checkout.card_note"] ?? "").trim(),
    eftNote: (s["site.checkout.eft_note"] ?? "").trim(),
    eftBank: (s["site.checkout.eft_bank"] ?? "").trim(),
    eftIban: (s["site.checkout.eft_iban"] ?? "").trim(),
    eftAccountName: (s["site.checkout.eft_account_name"] ?? "").trim(),
    trustText: (s["site.checkout.trust_text"] ?? "").trim(),
    successNote: (s["site.checkout.success_note"] ?? "").trim(),
  };
}

/** Ara toplama göre kargo ücretini döndürür (eşik aşıldıysa veya ücret 0 ise ücretsiz). */
export function shippingCostFor(subtotal: number, cfg: CartSettings): number {
  if (cfg.shippingFee <= 0) return 0;
  if (cfg.freeShippingThreshold > 0 && subtotal >= cfg.freeShippingThreshold) return 0;
  return cfg.shippingFee;
}
