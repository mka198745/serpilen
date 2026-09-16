import React from "react";
import { db } from "@/db";
import { products, productVariants, categories, brands } from "@/db/schema";
import { ProductCard } from "@/components/storefront/ProductCard";
import Link from "next/link";
import { Filter, SlidersHorizontal, ArrowLeft, Search } from "lucide-react";

export const dynamic = "force-dynamic";

interface CatalogPageProps {
  searchParams: Promise<{
    q?: string;
    category?: string;
    brand?: string;
    sort?: string;
    wishlist?: string;
  }>;
}

export default async function CatalogPage({ searchParams }: CatalogPageProps) {
  const params = await searchParams;
  const q = params.q?.toLowerCase() || "";
  const categorySlug = params.category;
  const brandSlug = params.brand;
  const sort = params.sort || "featured";

  const allCats = await db.select().from(categories);
  const allBrands = await db.select().from(brands);
  const allProds = await db.select().from(products);
  const allVars = await db.select().from(productVariants);

  const selectedCategory = allCats.find((c) => c.slug === categorySlug);
  const selectedBrand = allBrands.find((b) => b.slug === brandSlug);

  // Filter products
  let filtered = allProds.filter((p) => {
    if (!p.isActive) return false;
    if (selectedCategory && p.categoryId !== selectedCategory.id) return false;
    if (selectedBrand && p.brandId !== selectedBrand.id) return false;
    if (q) {
      const brandName = allBrands.find((b) => b.id === p.brandId)?.name?.toLowerCase() || "";
      const catName = allCats.find((c) => c.id === p.categoryId)?.name?.toLowerCase() || "";
      const pVars = allVars.filter((v) => v.productId === p.id);
      const matchName = p.name.toLowerCase().includes(q);
      const matchSku = p.sku.toLowerCase().includes(q);
      const matchBarcode = p.barcode?.toLowerCase().includes(q);
      const matchDesc = p.description?.toLowerCase().includes(q) || p.shortDescription?.toLowerCase().includes(q);
      const matchTags = p.tags?.toLowerCase().includes(q);
      const matchBrand = brandName.includes(q);
      const matchCat = catName.includes(q);
      const matchVar = pVars.some(
        (v) =>
          v.sku.toLowerCase().includes(q) ||
          v.barcode?.toLowerCase().includes(q) ||
          v.colorName?.toLowerCase().includes(q) ||
          v.size?.toLowerCase().includes(q) ||
          v.length?.toLowerCase().includes(q)
      );
      if (!matchName && !matchSku && !matchBarcode && !matchDesc && !matchTags && !matchBrand && !matchCat && !matchVar) return false;
    }
    return true;
  });

  // Sort
  if (sort === "price-asc") {
    filtered.sort((a, b) => Number(a.retailPrice) - Number(b.retailPrice));
  } else if (sort === "price-desc") {
    filtered.sort((a, b) => Number(b.retailPrice) - Number(a.retailPrice));
  } else {
    filtered.sort((a, b) => b.id - a.id);
  }

  const enrichedProducts = filtered.map((p) => {
    const vars = allVars.filter((v) => v.productId === p.id);
    const cat = allCats.find((c) => c.id === p.categoryId);
    const br = allBrands.find((b) => b.id === p.brandId);
    return {
      ...p,
      variants: vars,
      categoryName: cat?.name || "Kategori",
      brandName: br?.name || "İpek Tuhafiye",
    };
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Breadcrumb & Title */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
          <Link href="/" className="hover:text-amber-800">Ana Sayfa</Link>
          <span>/</span>
          <span className="text-gray-800 font-semibold">Ürün Kataloğu</span>
          {selectedCategory && (
            <>
              <span>/</span>
              <span className="text-amber-800 font-bold">{selectedCategory.name}</span>
            </>
          )}
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">
          {selectedCategory ? selectedCategory.name : "Tüm Tuhafiye Ürünleri"}
        </h1>
        <p className="text-xs text-gray-500 mt-1">
          Toplam <strong>{enrichedProducts.length}</strong> ürün listeleniyor.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar Filters */}
        <aside className="space-y-6">
          {/* Active Filter summary */}
          {(categorySlug || brandSlug || q) && (
            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-xs space-y-2">
              <span className="font-bold text-amber-900 block">Aktif Filtreler</span>
              <div className="flex flex-wrap gap-1.5">
                {q && (
                  <span className="bg-white px-2 py-0.5 rounded text-amber-900 border border-amber-200">
                    Arama: &ldquo;{q}&rdquo;
                  </span>
                )}
                {selectedCategory && (
                  <span className="bg-white px-2 py-0.5 rounded text-amber-900 border border-amber-200">
                    {selectedCategory.name}
                  </span>
                )}
                {selectedBrand && (
                  <span className="bg-white px-2 py-0.5 rounded text-amber-900 border border-amber-200">
                    {selectedBrand.name}
                  </span>
                )}
              </div>
              <Link
                href="/urunler"
                className="text-amber-800 font-semibold hover:underline block pt-1"
              >
                Tüm Filtreleri Temizle
              </Link>
            </div>
          )}

          {/* Categories */}
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs space-y-3">
            <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-amber-800" />
              <span>Kategoriler</span>
            </h3>
            <ul className="space-y-1.5 text-xs">
              <li>
                <Link
                  href="/urunler"
                  className={`block px-2.5 py-1.5 rounded-lg transition ${
                    !categorySlug ? "bg-amber-100/70 font-bold text-amber-900" : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  Tüm Kategoriler ({allProds.length})
                </Link>
              </li>
              {allCats.map((cat) => {
                const count = allProds.filter((p) => p.categoryId === cat.id).length;
                return (
                  <li key={cat.id}>
                    <Link
                      href={`/urunler?category=${cat.slug}${q ? `&q=${q}` : ""}`}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg transition ${
                        categorySlug === cat.slug
                          ? "bg-amber-100/70 font-bold text-amber-900"
                          : "text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      <span>{cat.name}</span>
                      <span className="text-[10px] text-gray-400">({count})</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Brands */}
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs space-y-3">
            <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2">
              <span>Markalar</span>
            </h3>
            <ul className="space-y-1.5 text-xs">
              {allBrands.map((b) => {
                const count = allProds.filter((p) => p.brandId === b.id).length;
                return (
                  <li key={b.id}>
                    <Link
                      href={`/urunler?brand=${b.slug}${categorySlug ? `&category=${categorySlug}` : ""}`}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg transition ${
                        brandSlug === b.slug
                          ? "bg-amber-100/70 font-bold text-amber-900"
                          : "text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      <span>{b.name}</span>
                      <span className="text-[10px] text-gray-400">({count})</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>

        {/* Product Grid Area */}
        <div className="lg:col-span-3 space-y-6">
          {/* Top Sort Bar */}
          <div className="bg-white p-3.5 rounded-2xl border border-gray-100 shadow-xs flex items-center justify-between text-xs">
            <div className="text-gray-500">
              Görüntülenen: <strong>{enrichedProducts.length}</strong> ürün
            </div>

            <div className="flex items-center gap-2">
              <span className="text-gray-500">Sıralama:</span>
              <div className="flex items-center gap-1">
                <Link
                  href={`/urunler?sort=newest${categorySlug ? `&category=${categorySlug}` : ""}${q ? `&q=${q}` : ""}`}
                  className={`px-2.5 py-1 rounded-md transition ${sort === "newest" || sort === "featured" ? "bg-amber-800 text-white font-semibold" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
                >
                  En Yeni
                </Link>
                <Link
                  href={`/urunler?sort=price-asc${categorySlug ? `&category=${categorySlug}` : ""}${q ? `&q=${q}` : ""}`}
                  className={`px-2.5 py-1 rounded-md transition ${sort === "price-asc" ? "bg-amber-800 text-white font-semibold" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
                >
                  Fiyat: Artan
                </Link>
                <Link
                  href={`/urunler?sort=price-desc${categorySlug ? `&category=${categorySlug}` : ""}${q ? `&q=${q}` : ""}`}
                  className={`px-2.5 py-1 rounded-md transition ${sort === "price-desc" ? "bg-amber-800 text-white font-semibold" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
                >
                  Fiyat: Azalan
                </Link>
              </div>
            </div>
          </div>

          {/* Products Grid */}
          {enrichedProducts.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-gray-100 shadow-xs space-y-3">
              <Search className="w-12 h-12 text-gray-300 mx-auto" />
              <h3 className="font-bold text-gray-900 text-base">Aradığınız kriterlere uygun ürün bulunamadı</h3>
              <p className="text-xs text-gray-500 max-w-sm mx-auto">
                Filtreleri temizleyebilir veya farklı bir anahtar kelime ile arama yapabilirsiniz.
              </p>
              <Link
                href="/urunler"
                className="inline-block mt-3 px-4 py-2 bg-amber-800 hover:bg-amber-900 text-white text-xs font-semibold rounded-xl"
              >
                Tüm Kataloğu Göster
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {enrichedProducts.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
