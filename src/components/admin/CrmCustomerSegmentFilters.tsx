"use client";

import React from "react";

export type SegmentFilters = { city: string; createdFrom: string; createdTo: string };
export const emptySegmentFilters: SegmentFilters = { city: "", createdFrom: "", createdTo: "" };

export function CrmCustomerSegmentFilters({ draft, onChange, onApply, onClear, error }: { draft: SegmentFilters; onChange: (filters: SegmentFilters) => void; onApply: () => void; onClear: () => void; error: string }) {
  const input = "mt-1 block w-full border border-stone-300 rounded-xl px-3 py-2 text-sm font-normal";
  return <form onSubmit={event => { event.preventDefault(); onApply(); }} className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4 space-y-3">
    <div><h3 className="font-bold text-stone-900">Şehir ve müşteri kayıt tarihi</h3><p className="text-xs text-stone-500 mt-1">Şehir müşteri kartındaki yazımla tam ve büyük/küçük harfe duyarlı eşleşir. Tarihler müşteri kartının kayıt zamanını UTC gün sınırlarına göre süzer; sipariş tarihini değiştirmez.</p></div>
    <div className="grid gap-3 sm:grid-cols-3 text-xs font-bold text-stone-700"><label htmlFor="crm-city-filter">Şehir (tam eşleşme)<input id="crm-city-filter" className={input} maxLength={100} value={draft.city} placeholder="Örn. Adana" onChange={event => onChange({ ...draft, city: event.target.value })}/></label><label htmlFor="crm-created-from">Kayıt başlangıcı<input id="crm-created-from" className={input} type="date" value={draft.createdFrom} onChange={event => onChange({ ...draft, createdFrom: event.target.value })}/></label><label htmlFor="crm-created-to">Kayıt bitişi<input id="crm-created-to" className={input} type="date" value={draft.createdTo} onChange={event => onChange({ ...draft, createdTo: event.target.value })}/></label></div>
    {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
    <div className="flex flex-wrap gap-2"><button type="submit" className="px-3 py-2 rounded-xl bg-amber-800 text-white text-xs font-bold">Şehir ve tarihi uygula</button><button type="button" onClick={onClear} className="px-3 py-2 rounded-xl border border-stone-200 text-xs font-bold">Şehir ve tarihi temizle</button></div>
    <p className="text-xs text-stone-500">Arama, etiket, üyelik ve sipariş filtreleriyle birlikte uygulanır. Özet, seçilen kartların tüm zamanlardaki siparişlerini gösterir.</p>
  </form>;
}
