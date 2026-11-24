"use client";

import React, { useEffect, useState } from "react";
import { authFetch } from "@/lib/client-auth";
import { CrmOrderExtraItems } from "./CrmOrderExtraItems";

type Item = { productName: string; variantName: string | null; quantity: number; unitPrice: string; totalPrice: string };
type Order = { id: number; orderNumber: string; orderType: string; status: string; paymentStatus: string; paymentMethod: string; grandTotal: string; createdAt: number; items: Item[]; hasMoreItems: boolean };
const money = (value: string) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(Number(value) || 0);

export function CrmCustomerOrders({ customerId }: { customerId: number }) {
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    async function load() {
      try {
        const res = await authFetch(`/api/crm/customers/${customerId}/orders?page=${page}`, { signal: abort.signal, cache: "no-store" });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(typeof data.error === "string" ? data.error : "Siparişler yüklenemedi.");
        if (!abort.signal.aborted) { setRows(data.data); setTotal(data.pagination.total); setError(""); }
      } catch (err) { if (!abort.signal.aborted) setError(err instanceof Error ? err.message : "Siparişler yüklenemedi."); }
      finally { if (!abort.signal.aborted) setBusy(false); }
    }
    void load();
    return () => abort.abort();
  }, [customerId, page, retry]);
  const changePage = (value: number) => { setBusy(true); setPage(value); };
  return <section className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4 space-y-3"><div><h3 className="font-bold text-stone-900">İlişkili siparişler</h3><p className="text-xs text-stone-500 mt-1">Siparişlerin kayıtlı ödeme durumu ve yöntemi gösterilir; ayrı bir ödeme sağlayıcısı işlem geçmişi değildir. Sipariş başına ilk 200 ürün gösterilir; daha fazla ürün varsa devamı ayrıca sayfalanır.</p></div>
    {busy && <p role="status" className="text-xs text-stone-500">Siparişler yükleniyor…</p>}
    {error && <p role="alert" className="text-xs text-rose-700">{error} <button className="underline font-bold" onClick={() => { setBusy(true); setRetry(value => value + 1); }}>Tekrar dene</button></p>}
    {!busy && !error && <><div className="space-y-2">{rows.map(order => <details key={order.id} className="border border-stone-200 rounded-xl"><summary className="cursor-pointer p-3 flex flex-wrap gap-x-5 gap-y-1 items-center text-xs"><b className="text-stone-900">{order.orderNumber}</b><span>{new Date(order.createdAt * 1000).toLocaleDateString("tr-TR")}</span><span>{order.orderType} · {order.status}</span><span>Ödeme: {order.paymentStatus} · {order.paymentMethod}</span><strong className="ml-auto">{money(order.grandTotal)}</strong></summary><div className="border-t border-stone-100 p-3 text-xs">{order.items.length ? <ul className="space-y-2">{order.items.map((item, index) => <li key={index} className="flex justify-between gap-3"><span>{item.productName}{item.variantName ? ` · ${item.variantName}` : ""} × {item.quantity}</span><span>{money(item.totalPrice)}</span></li>)}</ul> : <p className="text-stone-500">Kayıtlı ürün bulunamadı.</p>}{order.hasMoreItems && <CrmOrderExtraItems customerId={customerId} orderId={order.id} />}</div></details>)}{!rows.length && <p className="text-xs text-stone-500">İlişkili sipariş yok.</p>}</div><div className="flex justify-between items-center text-xs text-stone-500"><span>Sayfa {page} · {total} sipariş</span><div className="flex gap-2"><button disabled={page <= 1} onClick={() => changePage(page - 1)} className="border border-stone-200 rounded-lg px-3 py-1.5 disabled:opacity-40">Önceki</button><button disabled={page * 20 >= total} onClick={() => changePage(page + 1)} className="border border-stone-200 rounded-lg px-3 py-1.5 disabled:opacity-40">Sonraki</button></div></div></>}
  </section>;
}
