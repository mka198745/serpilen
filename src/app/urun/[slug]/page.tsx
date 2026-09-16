import React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { products, productVariants, categories, brands, inventory, warehouses } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ProductDetailClient } from "./ProductDetailClient";
import { parseVideoUrl } from "@/lib/video";

export const dynamic = "force-dynamic";

interface ProductPageProps {
  params: Promise<{
    slug: string;
  }>;
}

async function loadProduct(rawSlug: string) {
  // Sayfa bağlamında slug bazen URL-kodlu gelir (örn. %C3%BC); normalize et.
  let slug = rawSlug;
  try {
    slug = decodeURIComponent(rawSlug);
  } catch {
    slug = rawSlug;
  }
  const [product] = await db.select().from(products).where(eq(products.slug, slug)).limit(1);
  if (!product) return null;

  const variants = await db.select().from(productVariants).where(eq(productVariants.productId, product.id));
  const [category] = product.categoryId
    ? await db.select().from(categories).where(eq(categories.id, product.categoryId)).limit(1)
    : [null];
  const [brand] = product.brandId
    ? await db.select().from(brands).where(eq(brands.id, product.brandId)).limit(1)
    : [null];

  const allStock = await db.select().from(inventory).where(eq(inventory.productId, product.id));
  const allWh = await db.select().from(warehouses);

  const warehouseStocks = allStock.map((st) => {
    const wh = allWh.find((w) => w.id === st.warehouseId);
    return {
      warehouseId: st.warehouseId,
      warehouseName: wh?.name || "Depo",
      warehouseCode: wh?.code || "",
      physicalQty: st.physicalQty,
      reservedQty: st.reservedQty,
      availableQty: Math.max(0, st.physicalQty - st.reservedQty),
      locationCode: st.locationCode || "A-01",
    };
  });

  return { product, variants, category, brand, warehouseStocks };
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadProduct(slug);
  if (!data) return { title: "Ürün bulunamadı | İpek Tuhafiye" };

  const { product, category, brand } = data;
  const title = product.seoTitle || `${product.name} — Fiyatı ${Number(product.retailPrice).toFixed(2)} TL | İpek Tuhafiye`;
  const description =
    product.seoDescription ||
    (product.shortDescription || product.description || "").slice(0, 158);

  return {
    title,
    description,
    alternates: { canonical: `/urun/${product.slug}` },
    openGraph: {
      title,
      description,
      type: "website",
      url: `/urun/${product.slug}`,
      images: product.imageUrl ? [{ url: product.imageUrl }] : undefined,
      locale: "tr_TR",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    keywords: [product.name, brand?.name, category?.name, "tuhafiye"].filter(Boolean).join(", "),
  };
}

export default async function ProductDetailPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const data = await loadProduct(slug);

  if (!data) {
    notFound();
  }

  const { product, variants, category, brand, warehouseStocks } = data;
  const totalAvailable = warehouseStocks.reduce((s, w) => s + w.availableQty, 0);

  // JSON-LD: Product + Offer + AggregateRating + BreadcrumbList
  const productVideo = parseVideoUrl((product as { videoUrl?: string | null }).videoUrl);
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.name,
      sku: product.sku,
      mpn: product.sku,
      gtin13: product.barcode || undefined,
      description: product.description || product.shortDescription || undefined,
      image: product.imageUrl ? [product.imageUrl] : undefined,
      video:
        productVideo.kind === "unknown"
          ? undefined
          : {
              "@type": "VideoObject",
              name: `${product.name} — Tanıtım Videosu`,
              description: product.shortDescription || product.name,
              thumbnailUrl: product.imageUrl || undefined,
              contentUrl: productVideo.kind === "file" ? product.videoUrl : undefined,
              embedUrl: productVideo.kind === "file" ? undefined : productVideo.embedUrl,
            },
      brand: brand ? { "@type": "Brand", name: brand.name } : undefined,
      offers: {
        "@type": "Offer",
        url: `https://ipektuhafiye.com/urun/${product.slug}`,
        priceCurrency: "TRY",
        price: Number(product.campaignPrice || product.retailPrice).toFixed(2),
        availability: totalAvailable > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
        itemCondition: "https://schema.org/NewCondition",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Ana Sayfa", item: "https://ipektuhafiye.com/" },
        { "@type": "ListItem", position: 2, name: "Ürünler", item: "https://ipektuhafiye.com/urunler" },
        category
          ? { "@type": "ListItem", position: 3, name: category.name, item: `https://ipektuhafiye.com/urunler?category=${category.slug}` }
          : null,
        { "@type": "ListItem", position: category ? 4 : 3, name: product.name },
      ].filter(Boolean),
    },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <ProductDetailClient
        product={product}
        variants={variants}
        category={category}
        brand={brand}
        warehouseStocks={warehouseStocks}
      />
    </>
  );
}
