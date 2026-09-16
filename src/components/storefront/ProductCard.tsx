"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Product, ProductVariant } from "@/lib/types";
import { useCart } from "@/context/CartContext";
import { ShoppingBag, Heart, Check, Eye } from "lucide-react";

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const { addToCart, wishlist, toggleWishlist } = useCart();
  const variants = product.variants || [];

  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(
    variants.length > 0 ? variants[0] : null
  );
  const [addedRecently, setAddedRecently] = useState(false);

  const isFavorited = wishlist.includes(product.id);
  const listPrice = selectedVariant ? Number(selectedVariant.retailPrice) : Number(product.retailPrice);
  const campaignPrice = !selectedVariant && product.campaignPrice ? Number(product.campaignPrice) : null;
  const currentPrice = campaignPrice && campaignPrice < listPrice ? campaignPrice : listPrice;
  const currentSku = selectedVariant ? selectedVariant.sku : product.sku;

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    addToCart(product, selectedVariant, 1);
    setAddedRecently(true);
    setTimeout(() => setAddedRecently(false), 1600);
  };

  return (
    <div className="group bg-white rounded-2xl border border-gray-100 hover:border-amber-200/80 shadow-xs hover:shadow-xl transition-all duration-300 flex flex-col overflow-hidden relative">
      {/* Top Badges */}
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-1">
        {product.isFeatured && (
          <span className="bg-amber-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shadow-xs">
            Çok Satan
          </span>
        )}
        {product.b2bPrice && (
          <span className="bg-sky-700 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full shadow-xs">
            B2B Toptan Fiyatlı
          </span>
        )}
        {campaignPrice !== null && (
          <span className="bg-rose-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-xs uppercase">
            Kampanya %{Math.round((1 - campaignPrice / listPrice) * 100)}
          </span>
        )}
      </div>

      {/* Wishlist Button */}
      <button
        onClick={() => toggleWishlist(product.id)}
        className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white/90 backdrop-blur-xs text-gray-500 hover:text-rose-600 shadow-sm flex items-center justify-center transition"
        title="Favoriye Ekle"
      >
        <Heart className={`w-4 h-4 ${isFavorited ? "fill-rose-600 text-rose-600" : ""}`} />
      </button>

      {/* Product Image */}
      <Link href={`/urun/${product.slug}`} className="relative block aspect-4/3 overflow-hidden bg-gray-50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.imageUrl || "https://images.unsplash.com/photo-1596704017254-9b121068fb31?w=600&auto=format&fit=crop&q=80"}
          alt={product.name}
          className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />
      </Link>

      {/* Content */}
      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          {/* Brand & Category */}
          <div className="flex items-center justify-between text-[11px] text-gray-400 mb-1">
            <span className="font-semibold text-amber-800 uppercase tracking-wide">
              {product.brandName || "İpek Tuhafiye"}
            </span>
            <span>{product.unit}</span>
          </div>

          {/* Title */}
          <Link href={`/urun/${product.slug}`}>
            <h3 className="text-sm font-semibold text-gray-900 group-hover:text-amber-800 transition line-clamp-2 leading-snug">
              {product.name}
            </h3>
          </Link>

          {/* Color & Size Variant Swatches */}
          {variants.length > 0 && (
            <div className="mt-2.5">
              <p className="text-[11px] text-gray-500 mb-1">
                Seçim: <strong className="text-gray-800">{selectedVariant?.colorName || selectedVariant?.size}</strong>
              </p>
              <div className="flex flex-wrap gap-1.5 items-center">
                {variants.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVariant(v)}
                    className={`rounded-full transition flex items-center justify-center ${
                      selectedVariant?.id === v.id
                        ? "ring-2 ring-amber-700 ring-offset-1 scale-110"
                        : "opacity-80 hover:opacity-100"
                    }`}
                    title={`${v.colorName || ""} ${v.size || ""}`}
                  >
                    {v.colorHex ? (
                      <span
                        className="w-4 h-4 rounded-full border border-gray-300 block"
                        style={{ backgroundColor: v.colorHex }}
                      />
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 rounded text-gray-700 border border-gray-200">
                        {v.size || v.length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Stock Availability */}
          <div className="mt-3 flex items-center gap-1.5 text-[11px]">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-emerald-700 font-medium">Stokta Var (Merkez & Mağaza)</span>
          </div>
        </div>

        {/* Price & Add to Cart */}
        <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
          <div>
            <div className="text-base font-extrabold text-gray-900">
              {currentPrice.toFixed(2)} TL
            </div>
            <p className="text-[10px] text-gray-400">KDV Dahil / {product.unit}</p>
          </div>

          <div className="flex items-center gap-1.5">
            <Link
              href={`/urun/${product.slug}`}
              className="p-2 text-gray-400 hover:text-amber-800 hover:bg-amber-50 rounded-lg transition"
              title="Detaylı İncele"
            >
              <Eye className="w-4 h-4" />
            </Link>

            <button
              onClick={handleAddToCart}
              className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shadow-xs ${
                addedRecently
                  ? "bg-emerald-600 text-white"
                  : "bg-amber-700 hover:bg-amber-800 text-white"
              }`}
            >
              {addedRecently ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Eklendi</span>
                </>
              ) : (
                <>
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>Sepete Ekle</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
