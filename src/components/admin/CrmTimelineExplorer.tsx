"use client";

import React, { useEffect, useState } from "react";
import { authFetch } from "@/lib/client-auth";
import { CrmTimeline, type CrmTimelineEvent } from "./CrmTimeline";

type Filters = { kind: string; channel: string; actor: string; from: string; to: string };
const blank: Filters = { kind: "", channel: "", actor: "", from: "", to: "" };

export function CrmTimelineExplorer({ customerId, refresh }: { customerId: number; refresh: number }) {
  const [form, setForm] = useState<Filters>(blank);
  const [filters, setFilters] = useState<Filters>(blank);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<CrmTimelineEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    async function load() {
      try {
        const params = new URLSearchParams({ ...filters, page: String(page) });
        const res = await authFetch(`/api/crm/customers/${customerId}/timeline?${params}`, { signal: abort.signal, cache: "no-store" });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(typeof data.error === "string" ? data.error : "Zaman çizelgesi yüklenemedi.");
        if (!abort.signal.aborted) { setRows(data.data); setTotal(data.pagination.total); setError(""); }
      } catch (err) { if (!abort.signal.aborted) setError(err instanceof Error ? err.message : "Zaman çizelgesi yüklenemedi."); }
      finally { if (!abort.signal.aborted) setBusy(false); }
    }
    void load(); return () => abort.abort();
  }, [customerId, filters, page, refresh, retry]);
  const field = "block mt-1 border border-stone-300 rounded-xl px-2 py-2 w-full text-sm font-normal";
  return <div className="space-y-3"><form onSubmit={event => { event.preventDefault(); setBusy(true); setPage(1); setFilters({ ...form }); }} className="bg-white rounded-2xl border border-stone-200 p-4 space-y-3"><div><h3 className="font-bold text-stone-900">Hareket filtreleri</h3><p className="text-xs text-stone-500 mt-1">Tarih aralığı UTC gün sınırlarına göre uygulanır. Kanal yalnız bağlı siparişten; işlemi yapan yalnız kaynak kayıtta varsa gösterilir.</p></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 text-xs font-bold text-stone-700"><label>İşlem türü<select className={field} value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}><option value="">Tümü</option><option value="CUSTOMER_CREATED">Müşteri kaydı</option><option value="ORDER_CREATED">Sipariş</option><option value="ORDER_STATUS">Sipariş durumu</option><option value="RETURN_CREATED">İade kaydı</option><option value="LOYALTY_TRANSACTION">Sadakat puan hareketi</option><option value="NOTE_CREATED">Not</option><option value="PROFILE_UPDATED">Kart güncelleme</option></select></label><label>Kanal<select className={field} value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value })}><option value="">Tümü</option><option value="POS">POS</option><option value="ONLINE_B2C">Online</option></select></label><label>İşlemi yapan<input className={field} maxLength={100} value={form.actor} onChange={e => setForm({ ...form, actor: e.target.value })}/></label><label>Başlangıç<input className={field} type="date" value={form.from} onChange={e => setForm({ ...form, from: e.target.value })}/></label><label>Bitiş<input className={field} type="date" value={form.to} onChange={e => setForm({ ...form, to: e.target.value })}/></label></div><button className="rounded-xl border border-stone-200 px-3 py-2 text-xs font-bold">Filtrele</button></form>
    {busy && <p role="status" className="text-xs text-stone-500">Hareketler yükleniyor…</p>}{error && <p role="alert" className="text-xs text-rose-700">{error} <button className="underline" onClick={() => { setBusy(true); setRetry(value => value + 1); }}>Tekrar dene</button></p>}
    {!busy && !error && <><CrmTimeline events={rows}/><div className="flex justify-between items-center text-xs text-stone-500"><span>Sayfa {page} · {total} hareket</span><div className="flex gap-2"><button disabled={page <= 1} onClick={() => { setBusy(true); setPage(page - 1); }} className="border border-stone-200 rounded-lg px-3 py-1.5 disabled:opacity-40">Önceki</button><button disabled={page * 20 >= total} onClick={() => { setBusy(true); setPage(page + 1); }} className="border border-stone-200 rounded-lg px-3 py-1.5 disabled:opacity-40">Sonraki</button></div></div></>}
  </div>;
}
