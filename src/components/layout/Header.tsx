"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "@/context/CartContext";

import {
  ShoppingBag,
  Heart,
  Search,
  MonitorCheck,
  Building2,
  SlidersHorizontal,
  Scissors,
  Layers,
  ChevronDown,
  Phone,
  Truck,
  Sparkles,
  BookOpen,
  Sliders,
  CircleDot,
  Ribbon,
  Package,
} from "lucide-react";

export function Header() {
  const { cartCount, setIsCartOpen, wishlist } = useCart();
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState("");

  const categories = [
    { name: "Dikiş & Nakış", slug: "dikis-nakis", icon: Scissors },
    { name: "Fermuar Çeşitleri", slug: "fermuar", icon: Sliders },
    { name: "Düğme Dünyası", slug: "dugme", icon: CircleDot },
    { name: "Kurdele & Şerit", slug: "kurdele-serit", icon: Ribbon },
    { name: "Örgü & Hobi", slug: "orgu-hobi", icon: Sparkles },
    { name: "Dikiş Malzemeleri", slug: "dikis-malzemeleri", icon: Package },
    { name: "Tekstil Yardımcı", slug: "tekstil-yardimci", icon: Layers },
  ];

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      window.location.href = `/urunler?q=${encodeURIComponent(searchQuery.trim())}`;
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white shadow-xs">
      {/* 1. Announcement Bar */}
      <div className="bg-amber-950 text-amber-100 text-xs px-4 py-2">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 font-medium">
              <Truck className="w-3.5 h-3.5 text-amber-400" />
              1.000 TL ve Üzeri Ücretsiz Kargo | Aynı Gün Hızlı Gönderim
            </span>
            <span className="hidden md:inline-block text-amber-500">|</span>
            <span className="hidden md:inline-flex items-center gap-1 text-amber-300">
              <Sparkles className="w-3 h-3" />
              Tüm ürünlerde e-Fatura & Perakende Fiş entegrasyonu
            </span>
          </div>

          <div className="flex items-center gap-4 text-[11px]">
            <Link
              href="/pos"
              className="bg-amber-800 hover:bg-amber-700 text-white font-semibold px-2.5 py-0.5 rounded flex items-center gap-1 transition"
            >
              <MonitorCheck className="w-3 h-3" />
              <span>Web POS Terminali</span>
            </Link>
            <Link
              href="/toptan-b2b"
              className="bg-sky-900 hover:bg-sky-800 text-white font-semibold px-2.5 py-0.5 rounded flex items-center gap-1 transition"
            >
              <Building2 className="w-3 h-3" />
              <span>B2B Toptan Portalı</span>
            </Link>
            <Link
              href="/admin"
              className="bg-emerald-900 hover:bg-emerald-800 text-white font-semibold px-2.5 py-0.5 rounded flex items-center gap-1 transition"
            >
              <SlidersHorizontal className="w-3 h-3" />
              <span>Yönetim Paneli & WMS</span>
            </Link>
            <Link
              href="/mimari"
              className="hidden lg:flex text-amber-200 hover:text-white items-center gap-1 transition"
            >
              <BookOpen className="w-3 h-3" />
              <span>Mimari (FAZ 0)</span>
            </Link>
          </div>
        </div>
      </div>

      {/* 2. Main Header (Logo, Search, Cart) */}
      <div className="border-b border-gray-100 px-4 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 md:gap-8">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-700 to-amber-900 flex items-center justify-center text-white shadow-md shadow-amber-900/10 group-hover:scale-105 transition">
              <Scissors className="w-5 h-5 -rotate-45" />
            </div>
            <div>
              <span className="text-xl md:text-2xl font-black tracking-tight text-gray-900 block leading-tight">
                İPEK <span className="text-amber-800 font-extrabold">TUHAFİYE</span>
              </span>
              <span className="text-[10px] tracking-wider text-gray-500 font-medium uppercase block">
                Dikiş, Nakış, Fermuar & Hobi
              </span>
            </div>
          </Link>

          {/* Search Box */}
          <form
            onSubmit={handleSearchSubmit}
            className="flex-1 max-w-2xl relative hidden sm:block"
          >
            <div className="relative flex items-center">
              <input
                type="text"
                placeholder="Ürün adı, barkod, SKU, renk veya malzeme ara (Örn: Siyah Fermuar, Gütermann İplik, Prym Makas)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-24 py-2.5 bg-gray-50 hover:bg-gray-100/80 focus:bg-white border border-gray-200 focus:border-amber-700 rounded-full text-sm text-gray-900 placeholder-gray-400 focus:outline-none transition shadow-2xs"
              />
              <Search className="w-4 h-4 text-gray-400 absolute left-3.5" />
              <button
                type="submit"
                className="absolute right-1.5 px-4 py-1.5 bg-amber-800 hover:bg-amber-900 text-white text-xs font-semibold rounded-full transition shadow-xs"
              >
                Ara
              </button>
            </div>
          </form>

          {/* User actions: Wishlist & Cart */}
          <div className="flex items-center gap-3 md:gap-4 shrink-0">
            <Link
              href="/urunler"
              className="text-xs font-semibold text-gray-700 hover:text-amber-800 hidden md:block"
            >
              Katalog
            </Link>

            <Link
              href="/blog"
              className="text-xs font-semibold text-gray-700 hover:text-amber-800 hidden md:block"
            >
              Dikiş Rehberi
            </Link>

            <Link
              href="/siparis-takip"
              className="text-xs font-semibold text-gray-700 hover:text-amber-800 hidden md:block"
            >
              Sipariş Takip
            </Link>

            {/* Wishlist */}
            <Link
              href="/urunler?wishlist=true"
              className="relative p-2 text-gray-600 hover:text-rose-600 transition"
              title="Favorilerim"
            >
              <Heart className="w-5 h-5" />
              {wishlist.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">
                  {wishlist.length}
                </span>
              )}
            </Link>

            {/* Cart Button */}
            <button
              onClick={() => setIsCartOpen(true)}
              className="flex items-center gap-2 px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-full font-semibold text-xs border border-amber-200 transition"
              aria-label="Sepeti Aç"
            >
              <div className="relative">
                <ShoppingBag className="w-4 h-4 text-amber-800" />
                {cartCount > 0 && (
                  <span className="absolute -top-2 -right-2.5 w-4 h-4 rounded-full bg-amber-800 text-white text-[9px] font-bold flex items-center justify-center">
                    {cartCount}
                  </span>
                )}
              </div>
              <span className="hidden sm:inline">Sepetim</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Mega Category Navigation */}
      <nav className="border-b border-gray-100 bg-white hidden lg:block overflow-x-auto">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between text-xs font-medium text-gray-700">
          <div className="flex items-center gap-1 py-1">
            <Link
              href="/urunler"
              className="px-3 py-2 rounded-lg font-bold text-amber-900 bg-amber-50/70 hover:bg-amber-100 flex items-center gap-1.5 transition"
            >
              <span>Tüm Kategoriler</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </Link>

            {categories.map((cat) => {
              const Icon = cat.icon;
              return (
                <Link
                  key={cat.slug}
                  href={`/urunler?category=${cat.slug}`}
                  className="px-3 py-2 rounded-lg hover:text-amber-800 hover:bg-gray-50 flex items-center gap-1.5 transition whitespace-nowrap"
                >
                  <Icon className="w-3.5 h-3.5 text-amber-700" />
                  <span>{cat.name}</span>
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-4 text-[11px] text-gray-500 py-1">
            <span className="flex items-center gap-1">
              <Phone className="w-3 h-3 text-amber-700" />
              Destek: <strong>0850 888 20 26</strong>
            </span>
          </div>
        </div>
      </nav>
    </header>
  );
}
