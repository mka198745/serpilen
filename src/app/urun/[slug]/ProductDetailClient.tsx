"use client";

import React, { useState } from "react";
import { Product, ProductVariant, Category, Brand } from "@/lib/types";
import { useCart } from "@/context/CartContext";
import { ReviewsQA } from "@/components/storefront/ReviewsQA";
import { parseVideoUrl } from "@/lib/video";
import { YouTubePlayer } from "@/components/storefront/YouTubePlayer";
import {
  ShoppingBag,
  Heart,
  Check,
  ShieldCheck,
  Truck,
  RotateCcw,
  Play,
} from "lucide-react";

interface WarehouseStockInfo {
  warehouseId: number;
  warehouseName: string;
  warehouseCode: string;
  physicalQty: number;
  reservedQty: number;
  availableQty: number;
  locationCode: string;
}

interface ProductDetailClientProps {
  product: Product;
  variants: ProductVariant[];
  images: string[];
  category: Category | null;
  brand: Brand | null;
  warehouseStocks: WarehouseStockInfo[];
}

export function ProductDetailClient({
  product,
  variants,
  images,
  category,
  brand,
}: ProductDetailClientProps) {
  const { addToCart, wishlist, toggleWishlist, setIsCartOpen } = useCart();

  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(
    variants.length > 0 ? variants[0] : null
  );
  const [quantity, setQuantity] = useState(1);
  const [activeTab, setActiveTab] = useState<"desc" | "specs" | "video">("desc");
  const [isAdded, setIsAdded] = useState(false);

  const FALLBACK_IMG = "https://images.unsplash.com/photo-1596704017254-9b121068fb31?w=800";

  // Galeri: yüklenen fotoğraflar (en fazla 6) önce, sonra kapak + varyant görselleri
  const galleryImages = [
    ...(images || []),
    product.imageUrl,
    ...variants.map((v) => v.imageUrl),
  ].filter((u): u is string => !!u);
  const uniqueGallery = galleryImages.length > 0 ? [...new Set(galleryImages)] : [FALLBACK_IMG];
  const [activeImage, setActiveImage] = useState<string>(uniqueGallery[0]);

  const video = parseVideoUrl(product.videoUrl);
  const hasVideo = (product.videoUrl || "").trim() !== "";
  const isPlayableVideo = video.kind !== "unknown";

  const handleSelectVariant = (v: ProductVariant) => {
    setSelectedVariant(v);
    if (v.imageUrl) setActiveImage(v.imageUrl);
  };

  const currentPrice = selectedVariant ? Number(selectedVariant.retailPrice) : Number(product.retailPrice);
  const currentSku = selectedVariant ? selectedVariant.sku : product.sku;
  const currentBarcode = selectedVariant?.barcode || product.barcode;
  const isFavorited = wishlist.includes(product.id);

  const handleAddToCart = () => {
    addToCart(product, selectedVariant, quantity);
    setIsAdded(true);
    setTimeout(() => setIsAdded(false), 2000);
  };

  const handleBuyNow = () => {
    addToCart(product, selectedVariant, quantity);
    setIsCartOpen(false);
    window.location.href = "/odeme";
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-10">
      {/* Main Product Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Left: Gallery */}
        <div className="lg:col-span-6 space-y-4">
          <div className="aspect-square bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-xs relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activeImage}
              alt={product.name}
              className="w-full h-full object-contain object-center"
            />

            <button
              onClick={() => toggleWishlist(product.id)}
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/90 backdrop-blur-xs shadow-md text-gray-600 hover:text-rose-600 flex items-center justify-center transition"
            >
              <Heart className={`w-5 h-5 ${isFavorited ? "fill-rose-600 text-rose-600" : ""}`} />
            </button>
          </div>

          <div className="flex gap-3 flex-wrap">
            {uniqueGallery.map((url) => {
              const isActive = url === activeImage;
              return (
                <button
                  key={url}
                  onClick={() => setActiveImage(url)}
                  className={`w-20 h-20 rounded-xl border-2 overflow-hidden bg-gray-50 transition ${
                    isActive ? "border-amber-800 ring-2 ring-amber-800/30" : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </button>
              );
            })}
            {hasVideo && (
              <button
                onClick={() => setActiveTab("video")}
                className="w-20 h-20 rounded-xl border-2 border-violet-300 bg-violet-950 flex flex-col items-center justify-center gap-1 text-white hover:bg-violet-900 transition"
                title="Ürün videosunu izle"
              >
                <Play className="w-6 h-6 fill-white" />
                <span className="text-[9px] font-bold">Video</span>
              </button>
            )}
          </div>
        </div>

        {/* Right: Info & Purchase Form */}
        <div className="lg:col-span-6 space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-amber-100 text-amber-900 text-xs font-bold px-2.5 py-0.5 rounded-full">
                {brand?.name || "Orijinal Ürün"}
              </span>
              <span className="text-xs text-gray-400">SKU: {currentSku}</span>
              {currentBarcode && (
                <span className="text-xs text-gray-400">Barkod: {currentBarcode}</span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight leading-snug">
              {product.name}
            </h1>

            {product.shortDescription && (
              <p className="text-sm text-gray-600 mt-2.5 leading-relaxed">
                {product.shortDescription}
              </p>
            )}
          </div>

          {/* Price Box */}
          <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200/80 flex items-baseline justify-between">
            <div>
              <div className="text-3xl font-black text-gray-900">
                {currentPrice.toFixed(2)} TL
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                KDV Dahil / Birim: <strong>{product.unit}</strong>
              </p>
            </div>

          </div>

          {/* Variants Selector */}
          {variants.length > 0 && (
            <div className="space-y-3 p-4 bg-white rounded-2xl border border-gray-100 shadow-xs">
              <label className="text-xs font-bold text-gray-800 block uppercase tracking-wider">
                Varyant Seçimi:
                <span className="text-amber-800 font-bold ml-1">
                  {selectedVariant ? `${selectedVariant.colorName || ""} ${selectedVariant.size || ""}` : "Seçiniz"}
                </span>
              </label>

              <div className="flex flex-wrap gap-2">
                {variants.map((v) => {
                  const isSelected = selectedVariant?.id === v.id;
                  return (
                    <button
                      key={v.id}
                      onClick={() => handleSelectVariant(v)}
                      className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 border transition ${
                        isSelected
                          ? "border-amber-800 bg-amber-50 text-amber-950 ring-2 ring-amber-800/30"
                          : "border-gray-200 bg-white hover:border-gray-300 text-gray-700"
                      }`}
                    >
                      {v.colorHex && (
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-gray-300 shrink-0"
                          style={{ backgroundColor: v.colorHex }}
                        />
                      )}
                      <span>{v.colorName || v.size}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quantity & Actions */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-3">
              <div className="flex items-center border border-gray-300 rounded-xl bg-white px-3 py-2">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="px-2 py-1 text-gray-600 font-bold hover:text-black"
                >
                  -
                </button>
                <span className="px-4 font-bold text-sm">{quantity}</span>
                <button
                  onClick={() => setQuantity((q) => q + 1)}
                  className="px-2 py-1 text-gray-600 font-bold hover:text-black"
                >
                  +
                </button>
              </div>

              <button
                onClick={handleAddToCart}
                className={`flex-1 py-3.5 px-6 rounded-xl font-bold text-sm shadow-md flex items-center justify-center gap-2 transition ${
                  isAdded
                    ? "bg-emerald-600 text-white"
                    : "bg-amber-800 hover:bg-amber-900 text-white shadow-amber-900/20"
                }`}
              >
                {isAdded ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Sepete Eklendi</span>
                  </>
                ) : (
                  <>
                    <ShoppingBag className="w-4 h-4" />
                    <span>Sepete Ekle</span>
                  </>
                )}
              </button>

              <button
                onClick={handleBuyNow}
                className="py-3.5 px-6 rounded-xl font-bold text-sm bg-stone-900 hover:bg-black text-white shadow-sm transition"
              >
                Hemen Al
              </button>
            </div>

            {/* Quick Guarantees */}
            <div className="grid grid-cols-3 gap-2 pt-3 text-center text-[11px] text-gray-500">
              <div className="p-2 bg-gray-50 rounded-lg">
                <Truck className="w-4 h-4 text-amber-800 mx-auto mb-1" />
                <span>Aynı Gün Kargo</span>
              </div>
              <div className="p-2 bg-gray-50 rounded-lg">
                <ShieldCheck className="w-4 h-4 text-amber-800 mx-auto mb-1" />
                <span>%100 Orijinal Ürün</span>
              </div>
              <div className="p-2 bg-gray-50 rounded-lg">
                <RotateCcw className="w-4 h-4 text-amber-800 mx-auto mb-1" />
                <span>14 Gün İade</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Area */}
      <div className="pt-6">
        <div className="flex border-b border-gray-200 text-sm font-semibold gap-6">
          <button
            onClick={() => setActiveTab("desc")}
            className={`pb-3 border-b-2 transition ${
              activeTab === "desc"
                ? "border-amber-800 text-amber-900"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            Ürün Açıklaması
          </button>
          <button
            onClick={() => setActiveTab("specs")}
            className={`pb-3 border-b-2 transition ${
              activeTab === "specs"
                ? "border-amber-800 text-amber-900"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            Teknik Özellikler
          </button>
          {hasVideo && (
            <button
              onClick={() => setActiveTab("video")}
              className={`pb-3 border-b-2 transition flex items-center gap-1.5 ${
                activeTab === "video"
                  ? "border-amber-800 text-amber-900"
                  : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              <Play className="w-3.5 h-3.5" />
              Ürün Videosu
            </button>
          )}
        </div>

        <div className="py-6">
          {activeTab === "desc" && (
            <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed bg-white p-6 rounded-2xl border border-gray-100">
              <p className="whitespace-pre-line">
                {product.description || product.shortDescription || "Detaylı açıklama bulunmamaktadır."}
              </p>
            </div>
          )}

          {activeTab === "video" && hasVideo && (
            <div className="bg-white p-6 rounded-2xl border border-gray-100 space-y-3">
              <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Play className="w-4 h-4 text-amber-800" />
                {product.name} — Tanıtım Videosu
              </h4>
              {isPlayableVideo ? (
                <div className="aspect-video rounded-xl overflow-hidden bg-black max-w-3xl">
                  {video.kind === "youtube" && video.mediaId ? (
                    <YouTubePlayer
                      videoId={video.mediaId}
                      embedUrl={video.embedUrl}
                      title={`${product.name} videosu`}
                      watchUrl={video.watchUrl}
                    />
                  ) : video.kind === "file" ? (
                    <video src={product.videoUrl || ""} controls className="w-full h-full" />
                  ) : (
                    <iframe
                      key={video.embedUrl}
                      src={video.embedUrl}
                      title={`${product.name} videosu`}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allowFullScreen
                    />
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-600">
                  Bu video site içinde oynatılamıyor — orijinal sayfasından izleyebilirsiniz.
                </p>
              )}
              <a
                href={video.watchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm font-bold text-amber-800 hover:underline"
              >
                <Play className="w-4 h-4" />
                Orijinal videoyu aç ↗
              </a>
            </div>
          )}

          {activeTab === "specs" && (
            <div className="bg-white p-6 rounded-2xl border border-gray-100">
              <table className="w-full text-xs text-left">
                <tbody className="divide-y divide-gray-100">
                  <tr className="py-2.5">
                    <td className="py-2 text-gray-400 font-medium w-48">Marka</td>
                    <td className="py-2 text-gray-900 font-semibold">{brand?.name || "Serpilen Collection"}</td>
                  </tr>
                  <tr className="py-2.5">
                    <td className="py-2 text-gray-400 font-medium">Birim</td>
                    <td className="py-2 text-gray-900 font-semibold">{product.unit}</td>
                  </tr>
                  <tr className="py-2.5">
                    <td className="py-2 text-gray-400 font-medium">Paket İçi Adet</td>
                    <td className="py-2 text-gray-900 font-semibold">{product.packageQty} Adet</td>
                  </tr>
                  <tr className="py-2.5">
                    <td className="py-2 text-gray-400 font-medium">KDV Oranı</td>
                    <td className="py-2 text-gray-900 font-semibold">%{product.vatRate}</td>
                  </tr>
                  <tr className="py-2.5">
                    <td className="py-2 text-gray-400 font-medium">Orijin / Menşei</td>
                    <td className="py-2 text-gray-900 font-semibold">Almanya / Türkiye</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

        </div>
      </div>

      {/* FAZ 8: Yorumlar & Soru-Cevap */}
      <ReviewsQA productId={product.id} />
    </div>
  );
}
