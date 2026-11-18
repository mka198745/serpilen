"use client";

import React from "react";
import { Users, UserCheck, ShoppingBag, Repeat2, Wallet, Calculator } from "lucide-react";

export type CrmMetrics = { customerCount: number; registeredCount: number; paidCustomers: number; repeatCustomers: number; paidOrderCount: number; paidOrderTotal: number; averagePaidOrder: number | null };
const currency = (value: number | null) => value === null ? "—" : new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(value);

export function CrmOverview({ metrics, filtered }: { metrics: CrmMetrics; filtered: boolean }) {
  const cards = [
    { label: "Müşteri kartı", value: String(metrics.customerCount), Icon: Users },
    { label: "Bağlı web üyeliği olan", value: String(metrics.registeredCount), Icon: UserCheck },
    { label: "Ödenmiş siparişi olan", value: String(metrics.paidCustomers), Icon: ShoppingBag },
    { label: "Birden fazla ödenmiş sipariş", value: String(metrics.repeatCustomers), Icon: Repeat2 },
    { label: "Ödenmiş sipariş toplamı", value: currency(metrics.paidOrderTotal), Icon: Wallet },
    { label: "Ortalama ödenmiş sipariş", value: currency(metrics.averagePaidOrder), Icon: Calculator },
  ];
  return <section aria-label="CRM özet göstergeleri" className="space-y-2"><div className="flex justify-between items-end gap-3"><h3 className="font-bold text-stone-900">Müşteri özeti</h3><span className="text-xs text-stone-500">{filtered ? "Seçili arama ve filtreler · tüm zamanlar" : "Tüm müşteri kartları · tüm zamanlar"}</span></div><div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">{cards.map(({ label, value, Icon }) => <div key={label} className="rounded-2xl border border-stone-200 bg-white shadow-sm p-4 flex items-center gap-3"><div className="p-2.5 rounded-xl bg-amber-50 text-amber-800"><Icon size={19}/></div><div><p className="text-xs text-stone-500">{label}</p><p className="text-xl font-black text-stone-900 mt-0.5">{value}</p></div></div>)}</div><p className="text-xs text-stone-500">Ödenmiş sipariş: ödeme durumu PAID olan, iptal ve iade durumunda olmayan sipariştir. Tutarlar brüttür; kısmi iadeler düşülmez, net gelir veya kâr değildir. Misafir siparişleri dahil değildir; web üyeliği sayısı bağlı müşteri kartlarını sayar.</p></section>;
}
