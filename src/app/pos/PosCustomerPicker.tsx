"use client";

import React, { useEffect, useRef, useState } from "react";
import { authFetch } from "@/lib/client-auth";

export interface PosCustomer { id: number; name: string; phone: string; companyName: string | null; loyaltyPoints: number }
interface SearchResult { data: PosCustomer[]; page: number; hasMore: boolean; query: string }

export function PosCustomerPicker({ selected, onSelect }: { selected: PosCustomer | null; onSelect: (customer: PosCustomer | null) => void }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const pending = useRef<AbortController | null>(null);

  useEffect(() => () => { sequence.current++; pending.current?.abort(); }, []);
  const invalidate = () => { sequence.current++; pending.current?.abort(); pending.current = null; };
  const search = async (term: string, page: number) => {
    invalidate();
    const seq = sequence.current, controller = new AbortController();
    pending.current = controller;
    setResult(null); setError(null); setLoading(true);
    try {
      const response = await authFetch("/api/pos/customers/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: term, page }), signal: controller.signal, cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (seq !== sequence.current) return;
      if (response.ok && data?.success && Array.isArray(data.data) && data.pagination?.page === page && typeof data.pagination?.hasMore === "boolean") {
        setResult({ data: data.data, page, hasMore: data.pagination.hasMore, query: term });
      } else {
        if (response.status === 401 || response.status === 403) {
          onSelect(null);
          setError("POS erişimi doğrulanamadı. Seçili müşteri kaldırıldı; satış artık misafir olarak görünüyor.");
        } else setError(typeof data?.error === "string" ? data.error : data?.error?.message || "Müşteri araması tamamlanamadı.");
      }
    } catch {
      if (seq === sequence.current) setError("Bağlantı hatası: müşteri araması tamamlanamadı.");
    } finally {
      if (seq === sequence.current) { pending.current = null; setLoading(false); }
    }
  };
  const choose = (customer: PosCustomer | null) => {
    invalidate(); setResult(null); setQuery(""); setError(null); setLoading(false); onSelect(customer);
  };

  return <section aria-label="POS müşteri seçimi" className="space-y-2 flex-1 min-w-0 text-xs">
    <div className="rounded-xl border border-stone-200 bg-stone-100 p-2">
      <strong>Seçili müşteri:</strong> {selected ? <>{selected.name} · {selected.phone} · {selected.loyaltyPoints} puan</> : "Misafir Perakende Müşterisi"}
      {selected && <button type="button" onClick={() => choose(null)} className="ml-2 text-amber-800 underline">Misafire geç</button>}
    </div>
    <form onSubmit={event => { event.preventDefault(); void search(query, 1); }} className="flex gap-1">
      <label className="sr-only" htmlFor="pos-customer-search">Müşteri ara</label>
      <input id="pos-customer-search" value={query} maxLength={254} autoComplete="off" placeholder="Ad, telefon, e-posta veya #ID" onChange={event => { invalidate(); setQuery(event.target.value); setResult(null); setError(null); setLoading(false); }} className="min-w-0 flex-1 rounded-lg border border-stone-300 px-2 py-1.5" />
      <button type="submit" disabled={loading} className="rounded-lg bg-stone-800 px-3 text-white disabled:opacity-50">Ara</button>
    </form>
    <p className="text-stone-500">Ad: en az 3 harf; telefon: en az 4 rakam; e-posta: tamamı; numara: #ID. Sonuçlar kimlik kanıtı değildir.</p>
    {loading && <p role="status">Müşteriler aranıyor…</p>}
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-2 text-rose-800">{error}</p>}
    {result && <div className="space-y-1">
      {result.data.length === 0 ? <p role="status">Eşleşen müşteri bulunamadı.</p> : <ul className="max-h-44 space-y-1 overflow-auto">{result.data.map(customer => <li key={customer.id}><button type="button" onClick={() => choose(customer)} className="w-full rounded-lg border border-stone-200 bg-white p-2 text-left hover:bg-amber-50"><strong>{customer.name}</strong> · {customer.phone} {customer.companyName && <>· {customer.companyName} </>}· {customer.loyaltyPoints} puan <span className="text-stone-500">(#{customer.id})</span></button></li>)}</ul>}
      <div className="flex items-center gap-2"><button type="button" disabled={result.page <= 1} onClick={() => void search(result.query, result.page - 1)} className="underline disabled:opacity-40">Önceki</button><span>Sayfa {result.page}</span><button type="button" disabled={!result.hasMore} onClick={() => void search(result.query, result.page + 1)} className="underline disabled:opacity-40">Sonraki</button></div>
    </div>}
  </section>;
}
