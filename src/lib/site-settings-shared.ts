/** Header/Footer ayar varsayılanları — istemci ve sunucu ortak kullanır (db importu yoktur). */
export const DEFAULT_SITE_SETTINGS: Record<string, string> = {
  // Header
  "site.header.announcement_enabled": "true",
  "site.header.announcement_text": "1.000 TL ve Üzeri Ücretsiz Kargo | Aynı Gün Hızlı Gönderim",
  "site.header.support_phone": "0850 888 20 26",
  // Her iki bölümde de kullanılan marka
  "site.brand_name": "İPEK TUHAFİYE",
  "site.brand_tagline": "Dikiş, Nakış, Fermuar & Hobi",
  // Footer
  "site.footer.description":
    "1994 yılından bu yana kaliteli dikiş iplikleri, fermuarlar, düğmeler, kurdeleler ve örgü malzemeleriyle terzilerin, moda tasarımcılarının ve hobi tutkunlarının yanındayız.",
  "site.footer.store_address": "Moda Cad. No: 18, Kadıköy / İstanbul",
  "site.footer.warehouse_address": "İkitelli OSB Dokumacılar San. Sitesi No: 42, İstanbul",
  "site.footer.phone_line": "0850 888 20 26 & 0216 333 44 55",
  "site.footer.email": "siparis@ipektuhafiye.com",
  "site.footer.copyright": "© 2026 İpek Tuhafiye San. ve Tic. Ltd. Şti. Tüm Hakları Saklıdır.",
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

/** Ara toplama göre kargo ücretini döndürür (eşik aşıldıysa veya ücret 0 ise ücretsiz). */
export function shippingCostFor(subtotal: number, cfg: CartSettings): number {
  if (cfg.shippingFee <= 0) return 0;
  if (cfg.freeShippingThreshold > 0 && subtotal >= cfg.freeShippingThreshold) return 0;
  return cfg.shippingFee;
}
