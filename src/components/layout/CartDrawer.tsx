"use client";

import React, { useState } from "react";
import { useCart } from "@/context/CartContext";
import { X, Trash2, ShoppingBag, ArrowRight, Tag, Check, ShieldCheck } from "lucide-react";
import Link from "next/navigation";

export function CartDrawer() {
  const {
    items,
    isCartOpen,
    setIsCartOpen,
    removeFromCart,
    updateQuantity,
    subtotal,
    discountTotal,
    appliedCoupon,
    applyCoupon,
    removeCoupon,
  } = useCart();

  const [couponCode, setCouponCode] = useState("");
  const [couponFeedback, setCouponFeedback] = useState<{ msg: string; isError: boolean } | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  if (!isCartOpen) return null;

  const grandTotal = Math.max(0, subtotal - discountTotal);
  const freeShippingThreshold = 1000;
  const remainingForFreeShipping = Math.max(0, freeShippingThreshold - subtotal);

  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponCode) return;
    setIsApplying(true);
    const res = await applyCoupon(couponCode);
    setIsApplying(false);
    setCouponFeedback({
      msg: res.message,
      isError: !res.success,
    });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in">
      <div className="absolute inset-y-0 right-0 flex max-w-full pl-10">
        <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-amber-50/50">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-amber-700" />
              <h2 className="text-lg font-bold text-gray-900">Alışveriş Sepetim</h2>
              <span className="bg-amber-100 text-amber-800 text-xs font-semibold px-2 py-0.5 rounded-full">
                {items.length} ürün
              </span>
            </div>
            <button
              onClick={() => setIsCartOpen(false)}
              className="p-2 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100 transition"
              aria-label="Kapat"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Free Shipping Progress */}
          <div className="bg-emerald-50 px-6 py-2.5 border-b border-emerald-100">
            {remainingForFreeShipping > 0 ? (
              <p className="text-xs text-emerald-800 font-medium flex items-center justify-between">
                <span>Ücretsiz Kargo için son <strong>{remainingForFreeShipping.toFixed(2)} TL</strong>!</span>
                <span className="font-bold">{Math.min(100, Math.round((subtotal / freeShippingThreshold) * 100))}%</span>
              </p>
            ) : (
              <p className="text-xs text-emerald-800 font-semibold flex items-center gap-1.5">
                <Check className="w-4 h-4 text-emerald-600" />
                Tebrikler! Ücretsiz Kargo Kazandınız.
              </p>
            )}
            <div className="w-full bg-emerald-200 h-1.5 rounded-full mt-1.5 overflow-hidden">
              <div
                className="bg-emerald-600 h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, (subtotal / freeShippingThreshold) * 100)}%` }}
              />
            </div>
          </div>

          {/* Items List */}
          <div className="flex-1 overflow-y-auto px-6 py-4 divide-y divide-gray-100">
            {items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-12">
                <div className="w-20 h-20 rounded-full bg-amber-50 flex items-center justify-center text-amber-600 mb-4">
                  <ShoppingBag className="w-10 h-10 stroke-[1.5]" />
                </div>
                <h3 className="font-semibold text-gray-900 text-lg">Sepetiniz Boş</h3>
                <p className="text-sm text-gray-500 mt-1 max-w-xs">
                  Dikiş iplikleri, fermuarlar, düğmeler ve örgü malzemelerimize göz atın.
                </p>
                <button
                  onClick={() => setIsCartOpen(false)}
                  className="mt-5 inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-amber-900 bg-amber-100 hover:bg-amber-200 transition"
                >
                  Alışverişe Başla
                </button>
              </div>
            ) : (
              items.map((item, idx) => (
                <div key={`${item.productId}-${item.variantId}-${idx}`} className="py-4 flex gap-4">
                  <div className="w-16 h-16 rounded-lg bg-gray-100 overflow-hidden shrink-0 border border-gray-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.imageUrl || "https://images.unsplash.com/photo-1596704017254-9b121068fb31?w=200&auto=format&fit=crop&q=80"}
                      alt={item.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-gray-900 line-clamp-2 leading-snug">
                      {item.name}
                    </h4>
                    {item.variantName && (
                      <p className="text-xs text-amber-800 font-medium mt-0.5">{item.variantName}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5">SKU: {item.sku}</p>

                    <div className="flex items-center justify-between mt-3">
                      <div className="flex items-center border border-gray-200 rounded-md bg-gray-50">
                        <button
                          onClick={() => updateQuantity(item.productId, item.variantId, item.quantity - 1)}
                          className="px-2.5 py-1 text-gray-600 hover:text-black font-semibold text-xs"
                        >
                          -
                        </button>
                        <span className="px-2 text-xs font-semibold text-gray-800">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.productId, item.variantId, item.quantity + 1)}
                          className="px-2.5 py-1 text-gray-600 hover:text-black font-semibold text-xs"
                        >
                          +
                        </button>
                      </div>

                      <div className="text-right">
                        <span className="text-sm font-bold text-gray-900">
                          {(item.price * item.quantity).toFixed(2)} TL
                        </span>
                        <p className="text-[10px] text-gray-400">{item.price.toFixed(2)} TL / {item.unit}</p>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => removeFromCart(item.productId, item.variantId)}
                    className="p-1 text-gray-300 hover:text-rose-600 self-start transition"
                    title="Ürünü Çıkar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Footer with Subtotal, Coupon & Checkout button */}
          {items.length > 0 && (
            <div className="border-t border-gray-100 bg-gray-50/80 px-6 py-4 space-y-3">
              {/* Coupon area */}
              {appliedCoupon ? (
                <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg text-xs text-emerald-800">
                  <div className="flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Kupon uygulandı: <strong>{appliedCoupon}</strong> (-{discountTotal.toFixed(2)} TL)</span>
                  </div>
                  <button onClick={removeCoupon} className="text-emerald-700 hover:text-rose-600 underline font-medium">
                    Kaldır
                  </button>
                </div>
              ) : (
                <form onSubmit={handleApplyCoupon} className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      placeholder="Kupon Kodu (Örn: MERHABA10)"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value)}
                      className="w-full text-xs uppercase px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isApplying}
                    className="px-3 py-2 bg-gray-900 hover:bg-black text-white text-xs font-semibold rounded-lg transition disabled:opacity-50"
                  >
                    {isApplying ? "..." : "Uygula"}
                  </button>
                </form>
              )}

              {couponFeedback && (
                <p className={`text-[11px] font-medium ${couponFeedback.isError ? "text-rose-600" : "text-emerald-700"}`}>
                  {couponFeedback.msg}
                </p>
              )}

              {/* Price Breakdown */}
              <div className="space-y-1.5 text-xs text-gray-600 pt-1">
                <div className="flex justify-between">
                  <span>Ara Toplam (KDV Dahil)</span>
                  <span className="font-semibold text-gray-900">{subtotal.toFixed(2)} TL</span>
                </div>
                {discountTotal > 0 && (
                  <div className="flex justify-between text-emerald-700 font-medium">
                    <span>Kupon İndirimi</span>
                    <span>-{discountTotal.toFixed(2)} TL</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Kargo Ücreti</span>
                  <span className="font-semibold text-emerald-700">
                    {remainingForFreeShipping === 0 ? "Ücretsiz" : "59.00 TL"}
                  </span>
                </div>
                <div className="border-t border-gray-200 pt-2 flex justify-between text-base font-bold text-gray-900">
                  <span>Ödenecek Tutar</span>
                  <span className="text-amber-800">
                    {(grandTotal + (remainingForFreeShipping === 0 ? 0 : 59)).toFixed(2)} TL
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-col gap-2">
                <a
                  href="/odeme"
                  onClick={() => setIsCartOpen(false)}
                  className="w-full py-3 px-4 bg-amber-700 hover:bg-amber-800 text-white font-semibold rounded-xl text-center shadow-sm flex items-center justify-center gap-2 transition"
                >
                  <span>Siparişi Tamamla</span>
                  <ArrowRight className="w-4 h-4" />
                </a>

                <div className="flex items-center justify-center gap-2 text-[11px] text-gray-500 pt-1">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>256-Bit SSL & 3D Secure Güvenli Ödeme Altyapısı</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
