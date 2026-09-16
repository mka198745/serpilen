"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useCart } from "@/context/CartContext";
import {
  ShieldCheck,
  CreditCard,
  Building2,
  CheckCircle2,
  ArrowRight,
  Truck,
  RotateCcw,
  Sparkles,
} from "lucide-react";

export function CheckoutClient() {
  const { items, subtotal, discountTotal, appliedCoupon, clearCart } = useCart();

  const [formData, setFormData] = useState({
    name: "Ayşe Kaya",
    email: "ayse.kaya@gmail.com",
    phone: "0542 333 44 55",
    city: "İstanbul",
    district: "Kadıköy",
    address: "Caferağa Mah. Moda Cad. No: 44 D: 6",
    paymentMethod: "CREDIT_CARD",
    cardNumber: "4543 •••• •••• 9012",
    cardExp: "12/28",
    cardCvv: "321",
    isCorporate: false,
    companyName: "",
    taxOffice: "",
    taxNumber: "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<any | null>(null);
  const [promoPreview, setPromoPreview] = useState<{
    totalDiscount: number;
    freeShipping: boolean;
    appliedPromotions: Array<{ id: number; name: string; amount: number; type: string }>;
  } | null>(null);

  // FAZ 8: Sepetteki otomatik kampanyaları sunucu motorundan önizle
  React.useEffect(() => {
    if (items.length === 0) {
      setPromoPreview(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const pRes = await fetch("/api/products");
        const pData = await pRes.json();
        const catMap = new Map<number, { categoryId: number | null; brandId: number | null }>();
        (pData.data || []).forEach((p: any) => catMap.set(p.id, { categoryId: p.categoryId, brandId: p.brandId }));
        const res = await fetch("/api/promotions", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lines: items.map((it) => ({
              productId: it.productId,
              unitPrice: it.price,
              quantity: it.quantity,
              categoryId: catMap.get(it.productId)?.categoryId ?? null,
              brandId: catMap.get(it.productId)?.brandId ?? null,
            })),
          }),
        });
        const data = await res.json();
        if (!cancelled && data.success && data.data.totalDiscount > 0) setPromoPreview(data.data);
        else if (!cancelled) setPromoPreview(null);
      } catch {
        if (!cancelled) setPromoPreview(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [items]);

  const shippingCost = subtotal >= 1000 ? 0 : 59;
  const grandTotal = Math.max(0, subtotal - discountTotal + shippingCost);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) return;
    setIsSubmitting(true);

    try {
      const payload = {
        orderType: "ONLINE_B2C",
        customerName: formData.name,
        customerEmail: formData.email,
        customerPhone: formData.phone,
        paymentMethod: formData.paymentMethod,
        shippingAddress: `${formData.address}, ${formData.district} / ${formData.city}`,
        warehouseId: 3, // Online E-Ticaret Deposu
        subtotal,
        discountTotal: discountTotal + (promoPreview?.totalDiscount || 0),
        couponCode: appliedCoupon || null,
        taxTotal: (grandTotal * 0.2).toFixed(2),
        shippingTotal: promoPreview?.freeShipping ? 0 : shippingCost,
        grandTotal: Math.max(0, grandTotal - (promoPreview?.totalDiscount || 0) - (promoPreview?.freeShipping ? shippingCost : 0)),
        items: items.map((it) => ({
          productId: it.productId,
          variantId: it.variantId,
          productName: it.name,
          variantName: it.variantName,
          sku: it.sku,
          barcode: it.barcode,
          unitPrice: it.price,
          quantity: it.quantity,
          taxRate: 20,
          totalPrice: it.price * it.quantity,
        })),
      };

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      setIsSubmitting(false);

      if (data.success) {
        setCompletedOrder(data.data);
        clearCart();
      } else {
        alert("Sipariş verilemedi: " + (data.error || "Bilinmeyen hata"));
      }
    } catch (err: any) {
      setIsSubmitting(false);
      alert("Hata: " + err.message);
    }
  };

  if (completedOrder) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-md">
          <CheckCircle2 className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-black text-stone-900 tracking-tight">
            Siparişiniz Başarıyla Alındı!
          </h1>
          <p className="text-stone-500 text-sm">
            Ödemeniz 3D Secure ile doğrulandı. Depomuz siparişinizi hazırlamaya başladı.
          </p>
        </div>

        {/* Order Details Card */}
        <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-xs text-left space-y-3 font-sans text-xs">
          <div className="flex justify-between border-b border-stone-100 pb-2">
            <span className="text-stone-500">Sipariş Numarası:</span>
            <span className="font-mono font-bold text-stone-900">{completedOrder.order.orderNumber}</span>
          </div>
          <div className="flex justify-between border-b border-stone-100 pb-2">
            <span className="text-stone-500">e-Arşiv Fatura No:</span>
            <span className="font-mono font-bold text-emerald-800">{completedOrder.invoice.invoiceNumber}</span>
          </div>
          <div className="flex justify-between border-b border-stone-100 pb-2">
            <span className="text-stone-500">Kargo Takip No:</span>
            <span className="font-mono font-bold text-stone-900">{completedOrder.order.trackingNumber} (Yurtiçi Kargo)</span>
          </div>
          <div className="flex justify-between border-b border-stone-100 pb-2">
            <span className="text-stone-500">Toplam Tutar:</span>
            <span className="font-black text-sm text-stone-900">{Number(completedOrder.order.grandTotal).toFixed(2)} TL</span>
          </div>
          <div className="flex justify-between pt-1">
            <span className="text-stone-500">Teslimat Adresi:</span>
            <span className="font-medium text-stone-800 text-right max-w-xs">{completedOrder.order.shippingAddress}</span>
          </div>
        </div>

        <div className="flex justify-center gap-4 pt-4">
          <Link
            href="/"
            className="px-6 py-3 bg-amber-800 hover:bg-amber-900 text-white font-bold rounded-xl text-xs transition"
          >
            Alışverişe Devam Et
          </Link>
          <Link
            href="/admin"
            className="px-6 py-3 bg-stone-800 hover:bg-black text-white font-bold rounded-xl text-xs transition"
          >
            Yönetim Panelinden İncele
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-2xl sm:text-3xl font-black text-stone-900 tracking-tight mb-8">
        Güvenli Sipariş Tamamlama & Ödeme
      </h1>

      {items.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-stone-200 max-w-md mx-auto space-y-4">
          <p className="text-stone-500 text-sm">Sepetinizde ürün bulunmamaktadır.</p>
          <Link
            href="/urunler"
            className="inline-block px-5 py-2.5 bg-amber-800 text-white font-bold text-xs rounded-xl"
          >
            Alışverişe Başla
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Form (8 cols) */}
          <div className="lg:col-span-8 space-y-6">
            {/* 1. Address Section */}
            <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-xs space-y-4">
              <h2 className="font-black text-base text-stone-900">1. Teslimat & İletişim Bilgileri</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Ad Soyad:</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Telefon:</label>
                  <input
                    type="text"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                  />
                </div>
              </div>

              <div className="text-xs">
                <label className="block font-bold text-stone-700 mb-1">E-Posta (e-Fatura gönderimi için):</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">İl:</label>
                  <input
                    type="text"
                    required
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-bold text-stone-700 mb-1">İlçe:</label>
                  <input
                    type="text"
                    required
                    value={formData.district}
                    onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                  />
                </div>
              </div>

              <div className="text-xs">
                <label className="block font-bold text-stone-700 mb-1">Açık Adres (Cadde, Sokak, No, Daire):</label>
                <textarea
                  rows={2}
                  required
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                />
              </div>
            </div>

            {/* 2. Payment Method Section */}
            <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-xs space-y-4">
              <h2 className="font-black text-base text-stone-900">2. Güvenli Ödeme Yöntemi</h2>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, paymentMethod: "CREDIT_CARD" })}
                  className={`p-4 rounded-2xl border text-left flex items-center gap-3 transition ${
                    formData.paymentMethod === "CREDIT_CARD"
                      ? "border-amber-800 bg-amber-50/70 ring-2 ring-amber-800/30"
                      : "border-stone-200 bg-white"
                  }`}
                >
                  <CreditCard className="w-5 h-5 text-amber-800" />
                  <div>
                    <span className="font-bold text-xs text-stone-900 block">Kredi / Banka Kartı</span>
                    <span className="text-[11px] text-stone-500">3D Secure ile anında onay</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, paymentMethod: "EFT_HAVALE" })}
                  className={`p-4 rounded-2xl border text-left flex items-center gap-3 transition ${
                    formData.paymentMethod === "EFT_HAVALE"
                      ? "border-amber-800 bg-amber-50/70 ring-2 ring-amber-800/30"
                      : "border-stone-200 bg-white"
                  }`}
                >
                  <Building2 className="w-5 h-5 text-amber-800" />
                  <div>
                    <span className="font-bold text-xs text-stone-900 block">Havale / EFT</span>
                    <span className="text-[11px] text-stone-500">Banka hesaplarımıza transfer</span>
                  </div>
                </button>
              </div>

              {formData.paymentMethod === "CREDIT_CARD" && (
                <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-3 text-xs">
                  <div>
                    <label className="block font-bold text-stone-700 mb-1">Kart Numarası:</label>
                    <input
                      type="text"
                      value={formData.cardNumber}
                      onChange={(e) => setFormData({ ...formData, cardNumber: e.target.value })}
                      className="w-full px-3 py-2 border border-stone-300 rounded-xl font-mono"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-bold text-stone-700 mb-1">Son Kullanma (AA/YY):</label>
                      <input
                        type="text"
                        value={formData.cardExp}
                        onChange={(e) => setFormData({ ...formData, cardExp: e.target.value })}
                        className="w-full px-3 py-2 border border-stone-300 rounded-xl font-mono text-center"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-stone-700 mb-1">CVV Güvenlik Kodu:</label>
                      <input
                        type="password"
                        maxLength={3}
                        value={formData.cardCvv}
                        onChange={(e) => setFormData({ ...formData, cardCvv: e.target.value })}
                        className="w-full px-3 py-2 border border-stone-300 rounded-xl font-mono text-center"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Summary (4 cols) */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-xs space-y-4 sticky top-24">
              <h3 className="font-black text-base text-stone-900">Sipariş Özeti</h3>

              {/* Items */}
              <div className="space-y-3 divide-y divide-stone-100 max-h-60 overflow-y-auto text-xs">
                {items.map((it, i) => (
                  <div key={i} className="pt-2 flex justify-between items-center">
                    <div>
                      <span className="font-bold text-stone-900 block truncate max-w-[180px]">{it.name}</span>
                      <span className="text-stone-400 text-[10px]">
                        {it.variantName ? `${it.variantName} • ` : ""}{it.quantity} {it.unit} x {it.price.toFixed(2)} TL
                      </span>
                    </div>
                    <span className="font-bold text-stone-900">{(it.price * it.quantity).toFixed(2)} TL</span>
                  </div>
                ))}
              </div>

              {/* Price Breakdown */}
              <div className="border-t border-stone-200 pt-3 space-y-1.5 text-xs text-stone-600">
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
                {promoPreview && (
                  <div className="flex justify-between text-amber-800 font-semibold">
                    <span className="truncate max-w-[180px]">
                      🎯 Kampanya ({promoPreview.appliedPromotions.map((p) => p.name).join(", ")})
                    </span>
                    <span>-{(promoPreview.totalDiscount || 0).toFixed(2)} TL</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Kargo Ücreti</span>
                  <span className="font-semibold text-emerald-700">
                    {shippingCost === 0 ? "Ücretsiz Kargo" : "59.00 TL"}
                  </span>
                </div>
                <div className="flex justify-between text-base font-black text-stone-900 pt-2 border-t border-stone-200">
                  <span>Toplam Tutar</span>
                  <span className="text-amber-800">{grandTotal.toFixed(2)} TL</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 bg-amber-800 hover:bg-amber-900 text-white font-bold text-xs rounded-xl shadow-md transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <span>{isSubmitting ? "İşleniyor..." : "Siparişi Onayla & Öde"}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <div className="flex items-center justify-center gap-2 text-[11px] text-stone-500 pt-1">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>256-Bit SSL & 3D Secure Güvenli Ödeme</span>
              </div>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
