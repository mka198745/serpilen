import React from "react";
import Link from "next/link";
import { db } from "@/db";
import { products, productVariants, categories, brands, inventory, blogPosts } from "@/db/schema";
import { ProductCard } from "@/components/storefront/ProductCard";
import { CampaignStrip } from "@/components/storefront/CampaignStrip";
import {
  Scissors,
  Sliders,
  CircleDot,
  Ribbon,
  Sparkles,
  Package,
  Layers,
  ArrowRight,
  ShieldCheck,
  Truck,
  MonitorCheck,
  Building2,
  SlidersHorizontal,
  BookOpen,
  CheckCircle2,
  Star,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  // Fetch featured products with variants
  const allProds = await db.select().from(products);
  const allVars = await db.select().from(productVariants);
  const allCats = await db.select().from(categories);
  const allBrands = await db.select().from(brands);
  const posts = await db.select().from(blogPosts).limit(3);

  const featuredList = allProds.map((p) => {
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

  const categoryIcons = [
    { name: "Dikiş & Nakış", slug: "dikis-nakis", icon: Scissors, count: "120+ Çeşit", color: "from-amber-500 to-amber-700" },
    { name: "Fermuar Çeşitleri", slug: "fermuar", icon: Sliders, count: "85+ Çeşit", color: "from-sky-500 to-sky-700" },
    { name: "Düğme Dünyası", slug: "dugme", icon: CircleDot, count: "340+ Model", color: "from-emerald-500 to-emerald-700" },
    { name: "Kurdele & Şerit", slug: "kurdele-serit", icon: Ribbon, count: "90+ Renk", color: "from-rose-500 to-rose-700" },
    { name: "Örgü & Hobi", slug: "orgu-hobi", icon: Sparkles, count: "65+ İplik", color: "from-purple-500 to-purple-700" },
    { name: "Dikiş Malzemeleri", slug: "dikis-malzemeleri", icon: Package, count: "110+ Aparat", color: "from-orange-500 to-orange-700" },
    { name: "Tekstil Yardımcı", slug: "tekstil-yardimci", icon: Layers, count: "45+ Ürün", color: "from-teal-500 to-teal-700" },
  ];

  return (
    <div className="space-y-12 md:space-y-16 pb-16">
      {/* 1. Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-amber-950 via-stone-900 to-stone-950 text-white py-12 md:py-20 px-4">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative z-10">
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/20 border border-amber-400/30 text-amber-300 text-xs font-semibold backdrop-blur-xs">
              <Sparkles className="w-4 h-4" />
              <span>Yeni Nesil Çok Kanallı Tuhafiye Platformu</span>
            </div>

            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tight leading-[1.1]">
              Dikiş, Nakış ve Hobi Dünyasında <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-amber-200 to-amber-500">
                Usta İmzası Kalite.
              </span>
            </h1>

            <p className="text-stone-300 text-sm sm:text-base md:text-lg max-w-xl font-normal leading-relaxed">
              Orijinal <strong>Gütermann, YKK ve Prym</strong> ürünleri; perakende e-ticaret vitrini, toptan B2B fiyatları, mağaza içi web POS ve ortak stok altyapısıyla parmaklarınızın ucunda.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                href="/urunler"
                className="px-6 py-3.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl shadow-lg shadow-amber-900/30 flex items-center gap-2 transition"
              >
                <span>Tüm Ürünleri İncele</span>
                <ArrowRight className="w-4 h-4" />
              </Link>

              <Link
                href="/pos"
                className="px-5 py-3.5 bg-stone-800/80 hover:bg-stone-800 text-amber-200 font-semibold rounded-xl border border-stone-700/80 flex items-center gap-2 transition"
              >
                <MonitorCheck className="w-4 h-4 text-amber-400" />
                <span>Web POS Kasa Ekranı</span>
              </Link>

              <Link
                href="/toptan-b2b"
                className="px-5 py-3.5 bg-sky-950/80 hover:bg-sky-900 text-sky-200 font-semibold rounded-xl border border-sky-800/80 flex items-center gap-2 transition"
              >
                <Building2 className="w-4 h-4 text-sky-400" />
                <span>B2B Toptan Portalı</span>
              </Link>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-stone-800 text-xs">
              <div>
                <span className="block text-xl font-black text-amber-400">10.000+</span>
                <span className="text-stone-400">Aktif Stok Kalemi</span>
              </div>
              <div>
                <span className="block text-xl font-black text-amber-400">Tekil</span>
                <span className="text-stone-400">Merkezi Depo / POS</span>
              </div>
              <div>
                <span className="block text-xl font-black text-amber-400">GİB</span>
                <span className="text-stone-400">e-Fatura / e-Arşiv</span>
              </div>
            </div>
          </div>

          {/* Right Hero Visual Cards */}
          <div className="lg:col-span-5 relative">
            <div className="relative mx-auto max-w-md bg-stone-900/90 rounded-3xl p-4 border border-stone-800 shadow-2xl backdrop-blur-md">
              <div className="relative aspect-4/3 rounded-2xl overflow-hidden mb-4 border border-stone-700/60">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://images.unsplash.com/photo-1596704017254-9b121068fb31?w=800&auto=format&fit=crop&q=80"
                  alt="Gütermann Dikiş İplikleri"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-4">
                  <div>
                    <span className="bg-amber-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                      Vitrin Öne Çıkan
                    </span>
                    <h3 className="text-white font-bold text-base mt-1">
                      Gütermann Sew-All Dikiş İpliği Serisi
                    </h3>
                    <p className="text-stone-300 text-xs">Tüm renk kodlarıyla stokta</p>
                  </div>
                </div>
              </div>

              {/* Multi-Channel Unified Status Box */}
              <div className="bg-stone-950/90 rounded-xl p-3 border border-stone-800 space-y-2 text-xs">
                <div className="flex items-center justify-between text-stone-300">
                  <span className="flex items-center gap-1.5 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    Kadıköy Mağaza Stok: <strong>45 Adet</strong>
                  </span>
                  <span className="bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded text-[10px] font-semibold border border-emerald-800">
                    Kasa Satışına Açık
                  </span>
                </div>
                <div className="flex items-center justify-between text-stone-300">
                  <span className="flex items-center gap-1.5 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    Merkez Depo: <strong>140 Adet</strong>
                  </span>
                  <span className="bg-sky-950 text-sky-300 px-2 py-0.5 rounded text-[10px] font-semibold border border-sky-800">
                    B2B Sevk Edilebilir
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Mega Categories Grid */}
      <section className="max-w-7xl mx-auto px-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-6 gap-2">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
              Kapsamlı Ürün Ağacı
            </span>
            <h2 className="text-2xl font-black text-gray-900 tracking-tight">
              Öne Çıkan Tuhafiye Kategorileri
            </h2>
          </div>
          <Link
            href="/urunler"
            className="text-xs font-semibold text-amber-800 hover:text-amber-900 flex items-center gap-1"
          >
            <span>Tümünü Gör</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {categoryIcons.map((cat) => {
            const Icon = cat.icon;
            return (
              <Link
                key={cat.slug}
                href={`/urunler?category=${cat.slug}`}
                className="group bg-white p-4 rounded-2xl border border-gray-100 hover:border-amber-300 shadow-xs hover:shadow-lg transition-all duration-300 flex flex-col items-center text-center"
              >
                <div
                  className={`w-12 h-12 rounded-xl bg-gradient-to-br ${cat.color} text-white flex items-center justify-center mb-3 group-hover:scale-110 transition`}
                >
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="text-xs font-bold text-gray-900 group-hover:text-amber-800 transition line-clamp-1">
                  {cat.name}
                </h3>
                <span className="text-[10px] text-gray-400 mt-1">{cat.count}</span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* 3. Featured Products Grid */}
      <section className="max-w-7xl mx-auto px-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-6 gap-2">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
              Popüler ve Çok Satanlar
            </span>
            <h2 className="text-2xl font-black text-gray-900 tracking-tight">
              Günün Öne Çıkan Ürünleri
            </h2>
          </div>
          <Link
            href="/urunler"
            className="text-xs font-semibold text-amber-800 hover:text-amber-900 flex items-center gap-1"
          >
            <span>Katalogda Keşfet</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {featuredList.map((prod) => (
            <ProductCard key={prod.id} product={prod} />
          ))}
        </div>
      </section>

      {/* 3.5 FAZ 8: Aktif Kampanya Şeridi */}
      <CampaignStrip />

      {/* 4. Multi-Channel Unified Management Callout */}
      <section className="max-w-7xl mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* POS Card */}
          <div className="bg-gradient-to-br from-amber-900 to-amber-950 text-white rounded-3xl p-6 shadow-xl relative overflow-hidden flex flex-col justify-between">
            <div className="space-y-3 relative z-10">
              <div className="w-10 h-10 rounded-xl bg-amber-800 flex items-center justify-center text-amber-200">
                <MonitorCheck className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-bold">Fiziki Mağaza Web POS</h3>
              <p className="text-xs text-amber-200/90 leading-relaxed">
                Barkod tabancasıyla anında okutma, nakit/kart/parçalı tahsilat, vardiya kasa mutabakatı ve termal fiş çıktısı.
              </p>
            </div>
            <div className="pt-6 relative z-10">
              <Link
                href="/pos"
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-amber-950 font-bold text-xs rounded-xl shadow-md hover:bg-amber-100 transition"
              >
                <span>POS Kasa Ekranını Aç</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {/* B2B Card */}
          <div className="bg-gradient-to-br from-sky-900 to-sky-950 text-white rounded-3xl p-6 shadow-xl relative overflow-hidden flex flex-col justify-between">
            <div className="space-y-3 relative z-10">
              <div className="w-10 h-10 rounded-xl bg-sky-800 flex items-center justify-center text-sky-200">
                <Building2 className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-bold">B2B Toptan Satış Portalı</h3>
              <p className="text-xs text-sky-200/90 leading-relaxed">
                Tekstil atölyeleri ve perakendeciler için koli/paket kademeli fiyat listeleri, 30 gün açık cari limit ve toptan sevk.
              </p>
            </div>
            <div className="pt-6 relative z-10">
              <Link
                href="/toptan-b2b"
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-sky-950 font-bold text-xs rounded-xl shadow-md hover:bg-sky-100 transition"
              >
                <span>Toptan Fiyatları Gör</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {/* Admin & WMS Card */}
          <div className="bg-gradient-to-br from-emerald-900 to-emerald-950 text-white rounded-3xl p-6 shadow-xl relative overflow-hidden flex flex-col justify-between">
            <div className="space-y-3 relative z-10">
              <div className="w-10 h-10 rounded-xl bg-emerald-800 flex items-center justify-center text-emerald-200">
                <SlidersHorizontal className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-bold">Yönetim Paneli & WMS</h3>
              <p className="text-xs text-emerald-200/90 leading-relaxed">
                Çoklu depo stok defteri (Stock Ledger), satın alma siparişleri, otomatik GİB e-Fatura ve kural tabanlı AI asistanı.
              </p>
            </div>
            <div className="pt-6 relative z-10">
              <Link
                href="/admin"
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-emerald-950 font-bold text-xs rounded-xl shadow-md hover:bg-emerald-100 transition"
              >
                <span>Yönetim Masasını Aç</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Sewing & Craft Blog Guide Preview */}
      <section className="max-w-7xl mx-auto px-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-6 gap-2">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
              Bilgi & Atölye
            </span>
            <h2 className="text-2xl font-black text-gray-900 tracking-tight">
              Dikiş, Fermuar & Malzeme Rehberi
            </h2>
          </div>
          <Link
            href="/blog"
            className="text-xs font-semibold text-amber-800 hover:text-amber-900 flex items-center gap-1"
          >
            <span>Tüm Makaleler</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {posts.map((post) => (
            <article
              key={post.id}
              className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-xs hover:shadow-lg transition flex flex-col"
            >
              <div className="aspect-16/9 bg-gray-100 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={post.imageUrl || "https://images.unsplash.com/photo-1596704017254-9b121068fb31?w=600"}
                  alt={post.title}
                  className="w-full h-full object-cover hover:scale-105 transition duration-500"
                />
              </div>
              <div className="p-5 flex-1 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                    {post.category}
                  </span>
                  <h3 className="font-bold text-sm text-gray-900 mt-2 line-clamp-2">
                    {post.title}
                  </h3>
                  <p className="text-xs text-gray-500 mt-2 line-clamp-2 leading-relaxed">
                    {post.excerpt}
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-400">
                  <span>{post.author}</span>
                  <Link href={`/blog/${post.slug}`} className="font-semibold text-amber-800 hover:underline">
                    Devamını Oku →
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
