import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://ipektuhafiye.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Filtre/sıralama kombinasyonları ve hesap/ödeme akışları indekslenmesin
        disallow: ["/urunler?", "/sepet", "/odeme", "/api/", "/admin", "/pos", "/toptan-b2b"],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
