import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://serpilencollection.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Filtre/sıralama kombinasyonları ve hesap/ödeme akışları indekslenmesin
        disallow: ["/urunler?", "/sepet", "/odeme", "/api/", "/admin", "/pos"],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
