"use client";

import React, { useState } from "react";
import { authFetch } from "@/lib/client-auth";

type Card = { customer: { id: number; name: string; email: string | null; phone: string; companyName: string | null; balance: string | number | null; loyaltyPoints: number; isBlocked: number }; counts: { accounts: number; orders: number; accountTransactions: number; loyaltyTransactions: number; notes: number; tags: number; rfmScores: number } };
type Preview = { source: Card; target: Card };
const amount = (value: string | number | null) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(Number(value) || 0);

export function CrmMergePreview({ customerId }: { customerId: number }) {
  const [target, setTarget] = useState("");
  const [data, setData] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!/^[1-9]\d{0,14}$/.test(target) || !Number.isSafeInteger(Number(target)) || Number(target) === customerId) { setData(null); setError("Farklı bir müşteri numarası girin."); return; }
    setBusy(true); setError(""); setData(null);
    try {
      const response = await authFetch(`/api/crm/customers/${customerId}/merge-preview?${new URLSearchParams({ target })}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(typeof json.error === "string" ? json.error : "Ön inceleme yüklenemedi.");
      setData(json.data);
    } catch (err) { setError(err instanceof Error ? err.message : "Ön inceleme yüklenemedi."); }
    finally { setBusy(false); }
  }
  return <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm space-y-3"><div><h3 className="font-bold text-stone-900">Birleştirme ön incelemesi</h3><p className="text-xs text-stone-500 mt-1">İki müşteri kartını ve bağlı kayıt sayılarını karşılaştırır. <strong>Birleştirme yapmaz veya müşteri kayıtlarını değiştirmez.</strong> İnceleme denetim kaydına yazılır.</p></div>
    <form onSubmit={submit} className="flex flex-wrap gap-2 items-end"><label className="text-xs font-bold text-stone-700">Karşılaştırılacak müşteri numarası<input inputMode="numeric" disabled={busy} value={target} onChange={e => { setTarget(e.target.value); setData(null); }} maxLength={15} placeholder="Örn. 25" className="mt-1 block rounded-xl border border-stone-300 px-3 py-2 text-sm font-normal"/></label><button disabled={busy} className="rounded-xl border border-stone-200 px-3 py-2 text-xs font-bold disabled:opacity-40">{busy ? "İnceleniyor…" : "Karşılaştır"}</button></form>
    {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
    {data && <><div className="grid gap-3 sm:grid-cols-2">{([['Mevcut kart', data.source], ['Karşılaştırılan kart', data.target]] as const).map(([label, row]) => <div key={label} className="rounded-xl border border-stone-200 bg-stone-50 p-3"><h4 className="text-xs font-black text-amber-800">{label} · #{row.customer.id}</h4><p className="font-bold text-sm mt-1 break-words">{row.customer.name}</p><p className="text-xs text-stone-500 break-words">{row.customer.email || "E-posta yok"} · {row.customer.phone || "Telefon yok"}</p>{row.customer.companyName && <p className="text-xs text-stone-500 mt-1">{row.customer.companyName}</p>}<dl className="grid grid-cols-2 gap-2 mt-3 text-xs">{([['Üyelik',row.counts.accounts],['Sipariş',row.counts.orders],['Cari hareket',row.counts.accountTransactions],['Sadakat işlemi',row.counts.loyaltyTransactions],['Not',row.counts.notes],['Etiket',row.counts.tags],['RFM kaydı',row.counts.rfmScores],['Sadakat puanı',row.customer.loyaltyPoints],['Cari bakiye',amount(row.customer.balance)],['Engelli',row.customer.isBlocked ? 'Evet' : 'Hayır']] as const).map(([key,value])=><div key={key}><dt className="text-stone-500">{key}</dt><dd className="font-bold text-stone-900">{value}</dd></div>)}</dl></div>)}</div><p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3">Birleştirme işlemi henüz kullanıma açık değil. Üyelikler, cari bakiye, sadakat ve farklı kayıt bağlantıları ayrıca güvenle ele alınmalıdır. E-posta veya telefon üzerinden bağlantısız mesajlar ve misafir siparişleri bu sayılara dahil değildir.</p></>}
  </section>;
}
