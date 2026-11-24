"use client";

import React, { useEffect, useState } from "react";
import { authFetch } from "@/lib/client-auth";

type Item = { productName: string; variantName: string | null; quantity: number; totalPrice: string };
const money = (value: string) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(Number(value) || 0);

/** Pages after the first 200 items included in the order list. */
export function CrmOrderExtraItems({ customerId, orderId }: { customerId: number; orderId: number }) {
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const [more, setMore] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!page) return;
    const abort = new AbortController();
    async function load() {
      try {
        const response = await authFetch(`/api/crm/customers/${customerId}/orders/${orderId}/items?page=${page}`, { cache: "no-store", signal: abort.signal });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(typeof result.error === "string" ? result.error : "Ürünler yüklenemedi.");
        if (!abort.signal.aborted) { setItems(result.data); setMore(result.pagination.hasMore); setError(""); }
      } catch (err) {
        if (!abort.signal.aborted) { setItems([]); setMore(false); setError(err instanceof Error ? err.message : "Ürünler yüklenemedi."); }
      } finally { if (!abort.signal.aborted) setBusy(false); }
    }
    void load();
    return () => abort.abort();
  }, [customerId, orderId, page, retry]);
  const loadPage = (next: number) => { setItems([]); setMore(false); setError(""); setBusy(true); setPage(next); };
  if (!page) return <button type="button" className="mt-2 underline font-bold text-amber-800" onClick={() => loadPage(5)}>200. üründen sonraki ürünleri göster</button>;
  return <div className="mt-3 border-t border-stone-100 pt-3 space-y-2">
    {busy && <p role="status">Ürünler yükleniyor…</p>}
    {error && <p role="alert" className="text-rose-700">{error} <button type="button" className="underline" onClick={() => { setBusy(true); setRetry(value => value + 1); }}>Tekrar dene</button></p>}
    {!busy && !error && <><p>Ek ürün sayfası {page - 4} · Her sayfada en fazla 50 ürün. Sipariş değişirse sayfalar farklılaşabilir.</p>
      {items.length ? <ul className="space-y-2">{items.map((item, index) => <li key={index} className="flex justify-between gap-3"><span>{item.productName}{item.variantName ? ` · ${item.variantName}` : ""} × {item.quantity}</span><span>{money(item.totalPrice)}</span></li>)}</ul> : <p>Bu sayfada ürün bulunamadı.</p>}
      <div className="flex gap-2"><button type="button" disabled={page <= 5} onClick={() => loadPage(page - 1)} className="border rounded-lg px-3 py-1 disabled:opacity-40">Önceki ek ürünler</button><button type="button" disabled={!more} onClick={() => loadPage(page + 1)} className="border rounded-lg px-3 py-1 disabled:opacity-40">Sonraki ek ürünler</button></div>
    </>}
  </div>;
}
