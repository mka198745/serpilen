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
};

export const SITE_SETTING_KEYS = Object.keys(DEFAULT_SITE_SETTINGS);
