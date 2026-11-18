"use client";

import React, { useEffect, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Search, ShoppingBag, Wallet } from "lucide-react";
import { authFetch } from "@/lib/client-auth";
import { CrmRoadmap } from "./CrmRoadmap";
import { CrmCustomerNotes, type CrmNote } from "./CrmCustomerNotes";
import { CrmCustomerEdit } from "./CrmCustomerEdit";
import { type CrmTimelineEvent } from "./CrmTimeline";
import { CrmTimelineExplorer } from "./CrmTimelineExplorer";
import { CrmCustomerCreate } from "./CrmCustomerCreate";
import { CrmCustomerTags, type CrmTag } from "./CrmCustomerTags";
import { CrmCustomerOrders } from "./CrmCustomerOrders";
import { CrmOverview, type CrmMetrics } from "./CrmOverview";
import { CrmMergePreview } from "./CrmMergePreview";

type Customer = { id: number; name: string; email: string | null; phone: string; type: string; segment: string | null; city: string | null; loyaltyPoints: number; createdAt: number; orderCount: number; paidOrderTotal: number; lastOrderAt: number | null; companyName?: string | null; address?: string | null; isBlocked?: number };
type Order = { id: number; orderNumber: string; orderType: string; status: string; paymentStatus: string; paymentMethod: string; grandTotal: string; createdAt: number };
type Detail = { customer: Customer; editVersion: string; orders: Order[]; notes: CrmNote[]; tags: CrmTag[]; timeline: CrmTimelineEvent[]; summary: { orderCount: number; paidOrderTotal: number; firstOrderAt: number | null; lastOrderAt: number | null } };
const date = (value: number | null | undefined) => value ? new Date(value * 1000).toLocaleDateString("tr-TR") : "—";
const money = (value: number | string) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(Number(value) || 0);
const panel = "bg-white rounded-2xl border border-stone-200 shadow-sm";
const button = "px-3 py-2 rounded-xl border border-stone-200 text-xs font-bold hover:bg-stone-50 disabled:opacity-40";
const note = "Ödenmiş sipariş tutarı, ödeme durumu PAID olan ve iptal/iade durumunda olmayan siparişlerin brüt toplamıdır. Kısmi iadeler düşülmez; net gelir veya kâr değildir.";

export function CustomerCRM({ canWrite }: { canWrite: boolean }) {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [availableTags, setAvailableTags] = useState<CrmTag[]>([]);
  const [tagError, setTagError] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [metrics, setMetrics] = useState<CrmMetrics | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const abort = new AbortController();
    async function load() {
      try {
        const url = selected ? `/api/crm/customers/${selected}` : `/api/crm/customers?${new URLSearchParams({ q: query, page: String(page), tag: tagFilter })}`;
        const res = await authFetch(url, { cache: "no-store", signal: abort.signal });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || "Veriler yüklenemedi.");
        if (abort.signal.aborted) return;
        if (selected) setDetail(json.data); else { setRows(json.data); setTotal(json.pagination.total); setMetrics(json.metrics); }
        setError("");
      } catch (err) {
        if (!abort.signal.aborted) setError(err instanceof Error ? err.message : "Veriler yüklenemedi.");
      } finally { if (!abort.signal.aborted) setBusy(false); }
    }
    void load();
    return () => abort.abort();
  }, [page, query, selected, retry, tagFilter]);

  useEffect(() => {
    if (selected) return;
    const abort = new AbortController();
    async function loadTags() {
      try {
        const res = await authFetch("/api/crm/tags", { cache: "no-store", signal: abort.signal });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error("Etiketler yüklenemedi.");
        if (!abort.signal.aborted) { setAvailableTags(data.data); setTagError(""); }
      } catch {
        if (!abort.signal.aborted) setTagError("Etiketler yüklenemedi; filtre kullanılamıyor.");
      }
    }
    void loadTags();
    return () => abort.abort();
  }, [selected, retry]);
  const startLoading = () => { setBusy(true); setError(""); };
  const open = (id: number) => { startLoading(); setDetail(null); setSelected(id); };
  const back = () => { startLoading(); setSelected(null); setDetail(null); };

  return <div className="space-y-5">
    <header className="flex flex-wrap justify-between items-start gap-3"><div><div className="text-[10px] uppercase tracking-widest text-amber-800 font-black">Müşteri ilişkileri</div><h2 className="text-xl font-black text-stone-900">Müşteri CRM 360</h2><p className="text-xs text-stone-500 mt-1">Müşteri kartları ve ilişkili siparişlerin güvenli görünümü</p></div>{selected && <button className={`${button} flex items-center gap-1`} onClick={back}><ArrowLeft size={14}/> Müşterilere dön</button>}</header>
    {!selected && <CrmRoadmap />}
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error} <button className="underline font-bold ml-2" onClick={() => { startLoading(); setRetry(value => value + 1); }}>Tekrar dene</button></div>}
    {busy && <p role="status" className="text-sm text-stone-500">Yükleniyor…</p>}
    {!selected && !busy && !error && <>
      {metrics && <CrmOverview metrics={metrics} filtered={!!(query || tagFilter)} />}
      {canWrite && <CrmCustomerCreate onCreated={open} />}
      <div className={`${panel} p-4 flex flex-wrap gap-3 items-center`}><label htmlFor="crm-tag-filter" className="text-xs font-bold text-stone-700">Etikete göre filtrele</label><select id="crm-tag-filter" value={tagFilter} disabled={!!tagError} onChange={event => { startLoading(); setPage(1); setTagFilter(event.target.value); }} className="border border-stone-300 rounded-xl px-3 py-2 text-sm"><option value="">Tüm müşteriler</option>{availableTags.map(tag => <option key={tag.id} value={tag.id}>{tag.name} ({tag.customerCount ?? 0})</option>)}</select>{tagError && <p role="alert" className="text-xs text-rose-700">{tagError}</p>}</div>
      <section className={`${panel} overflow-hidden`}><div className="p-4 flex flex-wrap gap-3 items-center justify-between"><div><h3 className="font-bold text-stone-900">Müşteriler</h3><p className="text-xs text-stone-500 mt-1">Ad, e-posta, telefon veya müşteri numarası ile arayın.</p></div><form className="flex gap-2" onSubmit={e => { e.preventDefault(); startLoading(); if (page === 1 && query === input.trim()) { setBusy(false); return; } setPage(1); setQuery(input.trim()); }}><label className="sr-only" htmlFor="crm-search">Müşteri ara</label><input id="crm-search" maxLength={100} value={input} onChange={e => setInput(e.target.value)} placeholder="Müşteri ara" className="px-3 py-2 border border-stone-200 rounded-xl text-sm w-48"/><button className={`${button} flex items-center gap-1`}><Search size={14}/> Ara</button></form></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs"><thead className="bg-stone-50 text-stone-500 border-y border-stone-100"><tr>{["Müşteri", "İletişim", "Tip / Segment", "Sipariş", "Ödenmiş sipariş tutarı", "Son sipariş", ""].map(x => <th className="p-3" key={x}>{x}</th>)}</tr></thead><tbody className="divide-y divide-stone-100">{rows.map(c => <tr key={c.id}><td className="p-3"><b>{c.name}</b><div className="text-stone-400">#{c.id} · {c.city || "Şehir belirtilmemiş"}</div></td><td className="p-3">{c.phone || "—"}<div className="text-stone-400">{c.email || "—"}</div></td><td className="p-3">{c.type}<div className="text-stone-400">{c.segment || "—"}</div></td><td className="p-3">{c.orderCount}</td><td className="p-3 font-semibold">{money(c.paidOrderTotal)}</td><td className="p-3">{date(c.lastOrderAt)}</td><td className="p-3"><button className={button} onClick={() => open(c.id)}>Profili aç</button></td></tr>)}{!rows.length && <tr><td colSpan={7} className="p-8 text-center text-stone-500">Müşteri bulunamadı.</td></tr>}</tbody></table></div>
        <div className="p-4 flex justify-between items-center gap-2"><span className="text-xs text-stone-500">Sayfa {page} · {total} kayıt</span><div className="flex gap-2"><button className={button} disabled={page <= 1} onClick={() => { startLoading(); setPage(page - 1); }} aria-label="Önceki sayfa"><ChevronLeft size={15}/></button><button className={button} disabled={page * 20 >= total} onClick={() => { startLoading(); setPage(page + 1); }} aria-label="Sonraki sayfa"><ChevronRight size={15}/></button></div></div></section><p className="text-xs text-stone-500">{note}</p>
    </>}
    {selected && !busy && !error && detail && <><section className={`${panel} p-5`}><div className="flex flex-wrap gap-4 justify-between"><div><span className="text-xs text-amber-800 font-bold">MÜŞTERİ #{detail.customer.id}</span><h3 className="text-xl font-black text-stone-900 mt-1">{detail.customer.name}</h3><p className="text-sm text-stone-500 mt-1">{detail.customer.email || "E-posta yok"} · {detail.customer.phone || "Telefon yok"}</p></div><div className="text-xs text-stone-500 leading-6">Kayıt: {date(detail.customer.createdAt)}<br/>Tip: {detail.customer.type} · Segment: {detail.customer.segment || "—"}<br/>Sadakat puanı: {detail.customer.loyaltyPoints}</div></div></section>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{[{ label: "Sipariş sayısı", value: String(detail.summary.orderCount), Icon: ShoppingBag }, { label: "Ödenmiş sipariş tutarı", value: money(detail.summary.paidOrderTotal), Icon: Wallet }, { label: "Son sipariş", value: date(detail.summary.lastOrderAt), Icon: ShoppingBag }].map(({label,value,Icon}) => <div key={label} className={`${panel} p-4`}><Icon size={18} className="text-amber-800"/><p className="text-xs text-stone-500 mt-2">{label}</p><p className="text-lg font-black mt-1">{value}</p></div>)}</div><p className="text-xs text-stone-500">{note}</p>
      <CrmCustomerOrders customerId={detail.customer.id} /><CrmCustomerEdit key={`${detail.customer.id}-${detail.editVersion}`} customer={detail.customer} canWrite={canWrite} editVersion={detail.editVersion} onSaved={() => setRetry(value => value + 1)} /><CrmCustomerTags key={`tags-${detail.customer.id}`} customerId={detail.customer.id} canWrite={canWrite} initialTags={detail.tags} /><CrmCustomerNotes key={`notes-${detail.customer.id}`} customerId={detail.customer.id} canWrite={canWrite} initialNotes={detail.notes} onCreated={() => setRetry(value => value + 1)} /><CrmTimelineExplorer customerId={detail.customer.id} refresh={retry} />{canWrite && <CrmMergePreview customerId={detail.customer.id} />}<p className="text-xs text-stone-500">Henüz iletişim, destek, izin geçmişi, müşteri birleştirme işlemi ve otomasyon bilgileri bu profilde sunulmamaktadır.</p></>}
  </div>;
}
