"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useCart } from "@/context/CartContext";
import { Trash2, ArrowRight, ShoppingBag, ShieldCheck, Tag, Check } from "lucide-react";

export default function CartPage() {
  const {
    items,
    removeFromCart,
    updateQuantity,
    subtotal,
    discountTotal,
    appliedCoupon,
    applyCoupon,
    removeCoupon,
  } = useCart();

  const [couponInput, setCouponInput] = useState("");
  const [couponMsg, setCouponMsg] = useState<{ text: string; isError: boolean } | null>(null);

  const shippingCost = subtotal >= 1000 ? 0 : 59;
  const grandTotal = Math.max(0, subtotal - discountTotal + shippingCost);

  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponInput) return;
    const res = await applyCoupon(couponInput);
    setCouponMsg({ text: res.message, isError: !res.success });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-10 space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-stone-900 tracking-tight">
          Alışveriş Sepetiniz ({items.length} Kalem)
        </h1>
      </div>

      {items.length === 0 ? (
        <div className="bg-white p-12 rounded-3xl border border-stone-200 text-center max-w-md mx-auto space-y-4 shadow-xs">
          <div className="w-16 h-16 rounded-full bg-amber-50 text-amber-800 flex items-center justify-center mx-auto">
            <ShoppingBag className="w-8 h-8" />
          </div>
          <h3 className="font-bold text-base text-stone-900">Sepetiniz Boş</h3>
          <p className="text-xs text-stone-500">
            Dikiş iplikleri, fermuar ve örgü malzemelerimize göz atın.
          </p>
          <Link
            href="/urunler"
            className="inline-block px-5 py-2.5 bg-amber-800 text-white font-bold text-xs rounded-xl shadow-xs"
          >
            Alışverişe Başla
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Cart Table (8 cols) */}
          <div className="lg:col-span-8 bg-white rounded-3xl border border-stone-200 shadow-xs overflow-hidden">
            <div className="divide-y divide-stone-100">
              {items.map((item, idx) => (
                <div key={idx} className="p-4 sm:p-6 flex items-center gap-4">
                  <div className="w-20 h-20 rounded-2xl bg-stone-100 overflow-hidden shrink-0 border border-stone-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.imageUrl || "https://images.unsplash.com/photo-1596704017254-9b121068fb31?w=200"}
                      alt={item.name}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm text-stone-900 truncate">{item.name}</h3>
                    {item.variantName && (
                      <p className="text-xs text-amber-800 font-semibold">{item.variantName}</p>
                    )}
                    <p className="text-[11px] text-stone-400">SKU: {item.sku}</p>
                    <div className="text-xs font-bold text-stone-900 mt-1">
                      {item.price.toFixed(2)} TL / {item.unit}
                    </div>
                  </div>

                  {/* Quantity Stepper */}
                  <div className="flex items-center border border-stone-300 rounded-xl bg-stone-50">
                    <button
                      onClick={() => updateQuantity(item.productId, item.variantId, item.quantity - 1)}
                      className="px-3 py-1 text-stone-600 font-bold hover:text-black text-xs"
                    >
                      -
                    </button>
                    <span className="px-2 font-bold text-xs">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.productId, item.variantId, item.quantity + 1)}
                      className="px-3 py-1 text-stone-600 font-bold hover:text-black text-xs"
                    >
                      +
                    </button>
                  </div>

                  <div className="text-right min-w-[90px]">
                    <span className="font-black text-sm text-stone-900">
                      {(item.price * item.quantity).toFixed(2)} TL
                    </span>
                  </div>

                  <button
                    onClick={() => removeFromCart(item.productId, item.variantId)}
                    className="p-2 text-stone-300 hover:text-rose-600 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Cart Summary (4 cols) */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-xs space-y-4">
              <h3 className="font-black text-base text-stone-900">Sipariş Özeti</h3>

              {/* Coupon area */}
              {appliedCoupon ? (
                <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl text-xs text-emerald-800">
                  <span>Kupon: <strong>{appliedCoupon}</strong> (-{discountTotal.toFixed(2)} TL)</span>
                  <button onClick={removeCoupon} className="underline text-emerald-900 font-bold">Kaldır</button>
                </div>
              ) : (
                <form onSubmit={handleApplyCoupon} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Kupon Kodu (MERHABA10)"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value)}
                    className="flex-1 px-3 py-2 border border-stone-300 rounded-xl text-xs font-mono uppercase"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-stone-900 hover:bg-black text-white text-xs font-bold rounded-xl transition"
                  >
                    Uygula
                  </button>
                </form>
              )}

              {couponMsg && (
                <p className={`text-xs ${couponMsg.isError ? "text-rose-600" : "text-emerald-700"}`}>
                  {couponMsg.text}
                </p>
              )}

              <div className="space-y-2 text-xs text-stone-600 border-t border-stone-100 pt-3">
                <div className="flex justify-between">
                  <span>Ara Toplam (KDV Dahil)</span>
                  <span className="font-semibold text-stone-900">{subtotal.toFixed(2)} TL</span>
                </div>
                {discountTotal > 0 && (
                  <div className="flex justify-between text-emerald-700 font-semibold">
                    <span>Kupon İndirimi</span>
                    <span>-{discountTotal.toFixed(2)} TL</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Kargo Ücreti</span>
                  <span className="font-semibold text-emerald-700">
                    {shippingCost === 0 ? "Ücretsiz Kargo" : "59.00 TL"}
                  </span>
                </div>
                <div className="flex justify-between text-base font-black text-stone-900 pt-2 border-t border-stone-200">
                  <span>Ödenecek Tutar</span>
                  <span className="text-amber-800">{grandTotal.toFixed(2)} TL</span>
                </div>
              </div>

              <Link
                href="/odeme"
                className="w-full py-3.5 bg-amber-800 hover:bg-amber-900 text-white font-bold text-xs rounded-xl shadow-md flex items-center justify-center gap-2 transition"
              >
                <span>Ödeme Adımına Geç</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
