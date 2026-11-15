"use client";

import React, { useRef, useState } from "react";
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
  Images,
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
  const [activeTab, setActiveTab] = useState<"desc" | "specs">("desc");
  const [showVideo, setShowVideo] = useState(false); // video, görsel alanında mı gösteriliyor?
  const galleryRef = useRef<HTMLDivElement | null>(null);
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

  /** Videoyu sayfanın üstündeki görsel alanında açar ve oraya kaydırır. */
  const openVideo = () => {
    if (!hasVideo) return;
    setShowVideo(true);
    requestAnimationFrame(() => {
      galleryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const showImage = (url: string) => {
    setShowVideo(false);
    setActiveImage(url);
  };

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
        <div className="lg:col-span-6 space-y-4" ref={galleryRef}>
          <div className="aspect-square bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-xs relative">
            {showVideo && hasVideo ? (
              /* Video modu: oynatıcı doğrudan ürün görselinin alanında */
              <div className="absolute inset-0 bg-black flex items-center justify-center">
                <div className="w-full aspect-video max-h-full">
                  {isPlayableVideo ? (
                    video.kind === "youtube" && video.mediaId ? (
                      <YouTubePlayer
                        videoId={video.mediaId}
                        embedUrl={video.embedUrl}
                        title={`${product.name} videosu`}
                        watchUrl={video.watchUrl}
                      />
                    ) : video.kind === "file" ? (
                      <video src={product.videoUrl || ""} controls autoPlay className="w-full h-full" />
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
                    )
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
                      <p className="text-xs text-white/80">Bu video site içinde oynatılamıyor.</p>
                      <a
                        href={video.watchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 rounded-xl bg-white text-stone-900 text-xs font-bold"
                      >
                        Orijinal videoyu aç ↗
                      </a>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setShowVideo(false)}
                  className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/95 text-stone-800 text-[11px] font-bold shadow-md hover:bg-white transition"
                >
                  <Images className="w-3.5 h-3.5" /> Görseller
                </button>
              </div>
            ) : (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={activeImage}
                  alt={product.name}
                  className="w-full h-full object-contain object-center"
                />

                {hasVideo && (
                  <button
                    onClick={openVideo}
                    className="absolute inset-x-0 bottom-4 mx-auto w-max inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-stone-900/90 hover:bg-stone-900 text-white text-xs font-bold shadow-lg backdrop-blur-xs transition"
                  >
                    <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
                      <Play className="w-3 h-3 fill-white" />
                    </span>
                    Tanıtım Videosunu İzle
                  </button>
                )}

                <button
                  onClick={() => toggleWishlist(product.id)}
                  className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/90 backdrop-blur-xs shadow-md text-gray-600 hover:text-rose-600 flex items-center justify-center transition"
                >
                  <Heart className={`w-5 h-5 ${isFavorited ? "fill-rose-600 text-rose-600" : ""}`} />
                </button>
              </>
            )}
          </div>

          <div className="flex gap-3 flex-wrap">
            {uniqueGallery.map((url) => {
              const isActive = !showVideo && url === activeImage;
              return (
                <button
                  key={url}
                  onClick={() => showImage(url)}
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
                onClick={openVideo}
                className={`w-20 h-20 rounded-xl border-2 flex flex-col items-center justify-center gap-1 text-white transition ${
                  showVideo
                    ? "border-amber-800 ring-2 ring-amber-800/30 bg-violet-900"
                    : "border-violet-300 bg-violet-950 hover:bg-violet-900"
                }`}
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
              onClick={openVideo}
              className={`pb-3 border-b-2 transition flex items-center gap-1.5 ${
                showVideo
                  ? "border-amber-800 text-amber-900"
                  : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
              title="Video, ürün görselleri alanında açılır"
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
