"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  PackageSearch,
  Truck,
  CheckCircle2,
  Clock,
  MapPin,
  Phone,
  Hash,
  AlertTriangle,
  RotateCcw,
  Box,
  CreditCard,
} from "lucide-react";

const STEP_FLOW = ["PAID", "PREPARING", "READY_FOR_SHIPMENT", "SHIPPED", "DELIVERED"];
const STEP_LABELS: Record<string, string> = {
  PAID: "Ödeme Alındı",
  PREPARING: "Hazırlanıyor",
  READY_FOR_SHIPMENT: "Sevke Hazır",
  SHIPPED: "Kargoda",
  DELIVERED: "Teslim Edildi",
};

export function OrderTrackClient() {
  const [orderNumber, setOrderNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<any | null>(null);

  const track = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setOrder(null);
    setLoading(true);
    try {
      const params = new URLSearchParams({ orderNumber: orderNumber.trim() });
      if (phone.trim()) params.set("phone", phone.trim());
      const res = await fetch(`/api/orders?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Sipariş bulunamadı.");
      } else {
        setOrder(data.data);
      }
    } catch {
      setError("Sunucuya ulaşılamadı.");
    } finally {
      setLoading(false);
    }
  };

  const currentStepIndex = order ? STEP_FLOW.indexOf(order.status) : -1;
  const isCancelled = order && ["CANCELLED", "REFUNDED", "RETURNED", "RETURN_REQUESTED"].includes(order.status);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
      <div className="text-center space-y-2">
        <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center mx-auto">
          <PackageSearch className="w-7 h-7" />
        </div>
        <h1 className="text-2xl font-black text-stone-900 tracking-tight">Sipariş Takibi</h1>
        <p className="text-sm text-stone-500">Sipariş numaranız ve telefonunuz ile durumu görüntüleyin.</p>
      </div>

      <form onSubmit={track} className="bg-white rounded-3xl border border-stone-200 shadow-xs p-6 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block font-bold text-stone-700 mb-1">Sipariş Numarası</label>
            <div className="relative">
              <Hash className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
              <input
                required
                placeholder="OR-2026-12345"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 border border-stone-300 rounded-xl font-mono focus:outline-none focus:ring-2 focus:ring-amber-700/40"
              />
            </div>
          </div>
          <div>
            <label className="block font-bold text-stone-700 mb-1">Telefon (opsiyonel)</label>
            <div className="relative">
              <Phone className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
              <input
                placeholder="0542 333 44 55"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-700/40"
              />
            </div>
          </div>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-amber-800 hover:bg-amber-900 text-white font-bold text-sm rounded-xl transition disabled:opacity-60"
        >
          {loading ? "Sorgulanıyor…" : "Siparişi Sorgula"}
        </button>
      </form>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl px-4 py-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="font-medium">{error}</span>
        </div>
      )}

      {order && (
        <div className="space-y-4">
          {/* Özet kart */}
          <div className="bg-white rounded-3xl border border-stone-200 shadow-xs p-6 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <span className="font-mono font-black text-lg text-stone-900">{order.orderNumber}</span>
                <p className="text-xs text-stone-500">{new Date(order.createdAt).toLocaleString("tr-TR")}</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${isCancelled ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"}`}>
                {order.statusLabel}
              </span>
            </div>

            {/* Adım çizelgesi */}
            {!isCancelled && currentStepIndex >= 0 && (
              <div className="flex items-center justify-between pt-2">
                {STEP_FLOW.map((step, i) => {
                  const done = i <= currentStepIndex;
                  const Icon = step === "SHIPPED" ? Truck : step === "DELIVERED" ? CheckCircle2 : step === "PAID" ? CreditCard : step === "PREPARING" ? Box : Clock;
                  return (
                    <React.Fragment key={step}>
                      <div className="flex flex-col items-center gap-1 flex-1">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center ${done ? "bg-amber-800 text-white" : "bg-stone-100 text-stone-400"}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className={`text-[9px] text-center font-semibold ${done ? "text-stone-800" : "text-stone-400"}`}>{STEP_LABELS[step]}</span>
                      </div>
                      {i < STEP_FLOW.length - 1 && (
                        <div className={`h-0.5 flex-1 mb-4 ${i < currentStepIndex ? "bg-amber-800" : "bg-stone-200"}`} />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            )}

            {order.trackingNumber && (
              <div className="bg-sky-50 border border-sky-200 rounded-xl px-4 py-3 text-xs flex items-center gap-2 text-sky-900">
                <Truck className="w-4 h-4 shrink-0" />
                <span><strong>{order.carrier}</strong> takip no: <span className="font-mono font-bold">{order.trackingNumber}</span></span>
              </div>
            )}

            {order.shippingAddress && (
              <p className="text-xs text-stone-600 flex items-start gap-2">
                <MapPin className="w-4 h-4 text-amber-800 shrink-0 mt-0.5" />
                <span>{order.shippingAddress}</span>
              </p>
            )}
          </div>

          {/* Kalemler */}
          <div className="bg-white rounded-3xl border border-stone-200 shadow-xs overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-stone-50 text-stone-500 uppercase border-b border-stone-200">
                <tr>
                  <th className="py-2.5 px-4">Ürün</th>
                  <th className="py-2.5 px-4">Adet</th>
                  <th className="py-2.5 px-4 text-right">Tutar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {order.items.map((it: any) => (
                  <tr key={it.id}>
                    <td className="py-2.5 px-4">
                      <span className="font-semibold text-stone-800">{it.productName}</span>
                      {it.variantName && <span className="block text-[10px] text-amber-800">{it.variantName}</span>}
                    </td>
                    <td className="py-2.5 px-4">{it.quantity}</td>
                    <td className="py-2.5 px-4 text-right font-bold">{Number(it.totalPrice).toFixed(2)} TL</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-stone-200 bg-stone-50">
                <tr>
                  <td colSpan={2} className="py-2.5 px-4 font-bold text-stone-700 text-right">Genel Toplam</td>
                  <td className="py-2.5 px-4 text-right font-black text-amber-900">{Number(order.grandTotal).toFixed(2)} TL</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Durum geçmişi */}
          {order.history?.length > 0 && (
            <div className="bg-white rounded-3xl border border-stone-200 shadow-xs p-5 space-y-3">
              <h3 className="font-bold text-sm text-stone-900 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-amber-800" /> Sipariş Geçmişi
              </h3>
              <ol className="space-y-2.5">
                {order.history.map((h: any) => (
                  <li key={h.id} className="flex items-start gap-3 text-xs">
                    <span className="w-2 h-2 rounded-full bg-amber-700 mt-1.5 shrink-0" />
                    <div>
                      <span className="font-semibold text-stone-800">{h.statusLabel}</span>
                      <span className="text-stone-400"> — {new Date(h.createdAt).toLocaleString("tr-TR")}</span>
                      {h.note && <p className="text-stone-500">{h.note}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      <p className="text-center text-[11px] text-stone-400">
        <Link href="/" className="hover:text-amber-800 font-semibold">← Mağazaya dön</Link>
      </p>
    </div>
  );
}
