"use client";

import React, { useEffect, useRef, useState } from "react";
import { PaymentTimeNotice } from "@/components/layout/PaymentTimeNotice";
import { useCart } from "@/context/CartContext";
import { X, Trash2, ShoppingBag, ArrowRight, Tag, Check, ShieldCheck, Ban } from "lucide-react";
import { useSiteSettings } from "@/lib/use-site-settings";
import { parseCartSettings, shippingCostFor } from "@/lib/site-settings-shared";

export function CartDrawer() {
  const { items, isCartOpen, setIsCartOpen, removeFromCart, updateQuantity, subtotal, discountTotal, appliedCoupon, applyCoupon, removeCoupon } = useCart();
  const [couponCode, setCouponCode] = useState("");
  const [couponFeedback, setCouponFeedback] = useState<{ msg: string; isError: boolean } | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const siteSettings = useSiteSettings();
  const cartCfg = parseCartSettings(siteSettings);

  // Keep keyboard focus inside the open drawer and restore it to the opener.
  useEffect(() => {
    if (!isCartOpen) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    (dialogRef.current?.querySelector<HTMLElement>("[data-cart-initial-focus]") ?? dialogRef.current)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setIsCartOpen(false); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) { event.preventDefault(); dialogRef.current.focus(); return; }
      const first = focusable[0], last = focusable[focusable.length - 1], current = document.activeElement;
      if (event.shiftKey && (current === first || !dialogRef.current.contains(current))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (current === last || !dialogRef.current.contains(current))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); document.body.style.overflow = oldOverflow; if (previous?.isConnected) previous.focus(); };
  }, [isCartOpen, setIsCartOpen]);

  if (!isCartOpen) return null;

  const freeShippingThreshold = cartCfg.freeShippingThreshold;
  const shippingCost = shippingCostFor(subtotal, cartCfg);
  const remainingForFreeShipping = freeShippingThreshold > 0 ? Math.max(0, freeShippingThreshold - subtotal) : 0;
  const grandTotal = Math.max(0, subtotal - discountTotal + shippingCost);

  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponCode || isApplying) return;
    setIsApplying(true);
    try {
      const res = await applyCoupon(couponCode);
      setCouponFeedback({ msg: res.message, isError: !res.success });
    } finally { setIsApplying(false); }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xs">
      <button type="button" aria-label="Sepeti kapat" onClick={() => setIsCartOpen(false)} className="absolute inset-0 w-full h-full cursor-default" tabIndex={-1} />
      <div className="absolute inset-y-0 right-0 w-full max-w-[68rem]">
        <div id="shopping-cart-drawer" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="cart-drawer-title" tabIndex={-1} className="h-full w-full bg-white shadow-2xl flex flex-col outline-none">
          {!cartCfg.enabled ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-4">
              <div className="w-16 h-16 rounded-full bg-stone-100 flex items-center justify-center text-stone-400"><Ban className="w-8 h-8" /></div>
              <h2 id="cart-drawer-title" className="font-bold text-lg text-gray-900">Sepet Şu Anda Kapalı</h2>
              <p className="text-sm text-gray-500 max-w-xs">Mağazamız geçici olarak siparişe kapalıdır. Lütfen daha sonra tekrar deneyin.</p>
              <button type="button" data-cart-initial-focus onClick={() => setIsCartOpen(false)} className="px-5 py-2.5 bg-amber-800 hover:bg-amber-900 text-white text-sm font-bold rounded-xl">Kapat</button>
            </div>
          ) : (
            <>
              <div className="flex shrink-0 items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-stone-200 bg-amber-50/50">
                <div className="flex items-center gap-2 min-w-0">
                  <ShoppingBag className="w-5 h-5 text-amber-700 shrink-0" />
                  <h2 id="cart-drawer-title" className="text-lg sm:text-xl font-bold text-stone-900">Alışveriş Sepetim</h2>
                  <span className="bg-amber-100 text-amber-800 text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap">{items.length} ürün</span>
                </div>
                <button type="button" data-cart-initial-focus onClick={() => setIsCartOpen(false)} className="p-2 text-stone-500 hover:text-stone-900 rounded-full hover:bg-stone-100" aria-label="Kapat"><X className="w-5 h-5" /></button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto md:overflow-hidden md:flex">
                {/* On wide screens, items occupy the new panel to the left of the summary. */}
                <section aria-labelledby="cart-items-title" className="min-w-0 md:flex-1 md:overflow-y-auto px-4 sm:px-6 py-5 bg-white">
                  <div className="flex items-baseline justify-between gap-3 border-b border-stone-200 pb-3">
                    <h3 id="cart-items-title" className="text-base sm:text-lg font-bold text-stone-900">Sepetteki Ürünler</h3>
                    <span className="text-sm text-stone-500">{items.length} ürün</span>
                  </div>
                  {items.length === 0 ? (
                    <div className="min-h-64 flex flex-col items-center justify-center text-center py-12">
                      <div className="w-20 h-20 rounded-full bg-amber-50 flex items-center justify-center text-amber-600 mb-4"><ShoppingBag className="w-10 h-10 stroke-[1.5]" /></div>
                      <h3 className="font-semibold text-stone-900 text-lg">Sepetiniz Boş</h3>
                      <p className="text-sm text-stone-500 mt-1 max-w-xs">{cartCfg.emptyMessage || "Dikiş iplikleri, fermuarlar, düğmeler ve örgü malzemelerimize göz atın."}</p>
                      <button type="button" onClick={() => setIsCartOpen(false)} className="mt-5 px-4 py-2 text-sm font-medium rounded-lg text-amber-900 bg-amber-100 hover:bg-amber-200">Alışverişe Başla</button>
                    </div>
                  ) : (
                    <ul className="divide-y divide-stone-100">
                      {items.map((item) => {
                        const itemLabel = [item.name, item.variantName].filter(Boolean).join(" ");
                        return <li key={`${item.productId}-${item.variantId ?? "base"}`} className="flex gap-3 sm:gap-5 py-5">
                          <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-xl bg-stone-100 overflow-hidden shrink-0 border border-stone-200">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={item.imageUrl || "https://images.unsplash.com/photo-1596704017254-9b121068fb31?w=200&auto=format&fit=crop&q=80"} alt={itemLabel} className="w-full h-full object-cover" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <h4 className="text-base font-bold text-stone-900 leading-snug break-words">{item.name}</h4>
                                {item.variantName && <p className="text-sm text-amber-800 font-semibold mt-1 break-words">{item.variantName}</p>}
                                <p className="text-sm text-stone-500 mt-1 break-all">SKU: {item.sku}</p>
                              </div>
                              <button type="button" onClick={() => removeFromCart(item.productId, item.variantId)} className="p-2 text-stone-500 hover:text-rose-700 rounded-lg hover:bg-rose-50 shrink-0" aria-label={`${itemLabel} ürününü sepetten çıkar`} title="Ürünü Çıkar"><Trash2 className="w-5 h-5" /></button>
                            </div>
                            <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                              <div>
                                <span className="block text-xs font-semibold text-stone-500 mb-1">Miktar</span>
                                <div className="inline-flex items-center border border-stone-300 rounded-lg bg-stone-50">
                                  <button type="button" onClick={() => updateQuantity(item.productId, item.variantId, item.quantity - 1)} aria-label={`${itemLabel} miktarını azalt`} className="min-w-10 min-h-10 text-stone-700 hover:bg-stone-200 font-bold rounded-l-lg">−</button>
                                  <span className="min-w-8 text-center text-sm font-bold text-stone-900" aria-live="polite">{item.quantity}</span>
                                  <button type="button" onClick={() => updateQuantity(item.productId, item.variantId, item.quantity + 1)} aria-label={`${itemLabel} miktarını artır`} className="min-w-10 min-h-10 text-stone-700 hover:bg-stone-200 font-bold rounded-r-lg">+</button>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-sm text-stone-500">{item.price.toFixed(2)} TL / {item.unit}</p>
                                <p className="text-lg font-bold text-stone-900">{(item.price * item.quantity).toFixed(2)} TL</p>
                              </div>
                            </div>
                          </div>
                        </li>;
                      })}
                    </ul>
                  )}
                </section>

                {/* Summary stays to the right on desktop and below the list on mobile. */}
                <aside aria-label="Sipariş özeti" className="md:w-[23rem] md:shrink-0 md:overflow-y-auto border-t md:border-t-0 md:border-l border-stone-200 bg-stone-50">
                  {cartCfg.notice && <div className="bg-amber-50 border-b border-amber-100 px-5 py-3 text-xs font-semibold text-amber-900 text-center">{cartCfg.notice}</div>}
                  {freeShippingThreshold > 0 && <div className="bg-emerald-50 px-5 py-3 border-b border-emerald-100">
                    {remainingForFreeShipping > 0 ? <p className="text-xs text-emerald-800 font-medium flex items-center justify-between gap-2"><span>Ücretsiz Kargo için son <strong>{remainingForFreeShipping.toFixed(2)} TL</strong>!</span><span className="font-bold">{Math.min(100, Math.round((subtotal / freeShippingThreshold) * 100))}%</span></p> : <p className="text-xs text-emerald-800 font-semibold flex items-center gap-1.5"><Check className="w-4 h-4 text-emerald-600" />Tebrikler! Ücretsiz Kargo Kazandınız.</p>}
                    <div className="w-full bg-emerald-200 h-1.5 rounded-full mt-2 overflow-hidden"><div className="bg-emerald-600 h-full rounded-full transition-all duration-300" style={{ width: `${Math.min(100, (subtotal / freeShippingThreshold) * 100)}%` }} /></div>
                  </div>}
                  {items.length > 0 && <div className="px-5 py-5 space-y-4">
                    <h3 className="text-base font-bold text-stone-900">Sipariş Özeti</h3>
                    {appliedCoupon ? <div className="flex items-center justify-between gap-2 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg text-xs text-emerald-800">
                      <span className="flex items-center gap-1.5"><Tag className="w-4 h-4 shrink-0" /><span>Kupon uygulandı: <strong>{appliedCoupon}</strong> (-{discountTotal.toFixed(2)} TL)</span></span>
                      <button type="button" onClick={removeCoupon} className="text-emerald-700 hover:text-rose-600 underline font-medium">Kaldır</button>
                    </div> : <form onSubmit={handleApplyCoupon} className="flex gap-2">
                      <input type="text" aria-label="Kupon kodu" placeholder="Kupon Kodu (Örn: MERHABA10)" value={couponCode} onChange={(e) => setCouponCode(e.target.value)} className="min-w-0 flex-1 text-sm uppercase px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700" />
                      <button type="submit" disabled={isApplying} className="px-3 py-2 bg-stone-900 hover:bg-black text-white text-sm font-semibold rounded-lg disabled:opacity-50">{isApplying ? "..." : "Uygula"}</button>
                    </form>}
                    {couponFeedback && <p role="status" className={`text-xs font-medium ${couponFeedback.isError ? "text-rose-600" : "text-emerald-700"}`}>{couponFeedback.msg}</p>}
                    <div className="space-y-2 text-sm text-stone-600 pt-1">
                      <div className="flex justify-between gap-2"><span>Ara Toplam (KDV Dahil)</span><span className="font-semibold text-stone-900">{subtotal.toFixed(2)} TL</span></div>
                      {discountTotal > 0 && <div className="flex justify-between text-emerald-700 font-medium"><span>Kupon İndirimi</span><span>-{discountTotal.toFixed(2)} TL</span></div>}
                      <div className="flex justify-between gap-2"><span>Kargo Ücreti</span><span className={`font-semibold ${shippingCost === 0 ? "text-emerald-700" : "text-stone-900"}`}>{shippingCost === 0 ? "Ücretsiz" : `${shippingCost.toFixed(2)} TL`}</span></div>
                      <div className="border-t border-stone-200 pt-3 flex justify-between text-base font-bold text-stone-900"><span>Ödenecek Tutar</span><span className="text-amber-800">{grandTotal.toFixed(2)} TL</span></div>
                    </div>
                    <PaymentTimeNotice showStockWaitNotice={false} />
                    <a href="/odeme" onClick={() => setIsCartOpen(false)} className="w-full py-3 px-4 bg-amber-700 hover:bg-amber-800 text-white font-semibold rounded-xl text-center shadow-sm flex items-center justify-center gap-2"><span>Siparişi Tamamla</span><ArrowRight className="w-4 h-4" /></a>
                    <div className="flex items-center justify-center gap-2 text-xs text-stone-500"><ShieldCheck className="w-4 h-4 text-emerald-600" /><span>Havale / EFT ile sipariş</span></div>
                  </div>}
                </aside>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
