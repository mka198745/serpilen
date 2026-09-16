import type { MetadataRoute } from "next";
import { db } from "@/db";
import { products, categories, brands, blogPosts } from "@/db/schema";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://ipektuhafiye.com";

const STATIC_PAGES = [
  { url: "", priority: 1.0, changeFrequency: "daily" as const },
  { url: "/urunler", priority: 0.95, changeFrequency: "daily" as const },
  { url: "/blog", priority: 0.7, changeFrequency: "weekly" as const },
  { url: "/hakkimizda", priority: 0.5, changeFrequency: "monthly" as const },
  { url: "/magazalarimiz", priority: 0.5, changeFrequency: "monthly" as const },
  { url: "/iletisim", priority: 0.5, changeFrequency: "monthly" as const },
  { url: "/siparis-takip", priority: 0.4, changeFrequency: "monthly" as const },
  { url: "/toptan-b2b", priority: 0.6, changeFrequency: "weekly" as const },
  { url: "/kvkk", priority: 0.2, changeFrequency: "yearly" as const },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = STATIC_PAGES.map((p) => ({
    url: `${BASE}${p.url}`,
    lastModified: new Date(),
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));

  try {
    const [cats, brs, prods, posts] = await Promise.all([
      db.select().from(categories),
      db.select().from(brands),
      db.select().from(products),
      db.select().from(blogPosts),
    ]);

    for (const c of cats) {
      if (!c.isActive) continue;
      entries.push({ url: `${BASE}/urunler?category=${c.slug}`, lastModified: new Date(), changeFrequency: "daily", priority: 0.8 });
    }
    for (const b of brs) {
      if (!b.isActive) continue;
      entries.push({ url: `${BASE}/urunler?brand=${b.slug}`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.6 });
    }
    for (const p of prods) {
      if (!p.isActive) continue;
      entries.push({
        url: `${BASE}/urun/${p.slug}`,
        lastModified: new Date(p.createdAt || Date.now()),
        changeFrequency: "daily",
        priority: p.isFeatured ? 0.9 : 0.7,
      });
    }
    for (const post of posts) {
      if (!post.isPublished) continue;
      entries.push({ url: `${BASE}/blog/${post.slug}`, lastModified: new Date(post.publishedAt || Date.now()), changeFrequency: "monthly", priority: 0.6 });
    }
  } catch (err) {
    console.error("sitemap db error (static fallback used):", err);
  }

  return entries;
}
