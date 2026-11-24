"use client";

import React, { useEffect, useState } from "react";
import { authFetch } from "@/lib/client-auth";

type Row = { customer: { id: number; name: string }; status: "UNSURE" | "DISTINCT"; revision: number; reviewedByName: string; reviewedAt: number; stale: boolean };
type Result = { data: Row[]; pagination: { page: number; hasMore: boolean } };

/** A saved decision remains discoverable even when contact details no longer match. */
export function CrmDuplicateReviewHistory({ customerId, disabled, refresh, onChoose }: { customerId: number; disabled: boolean; refresh: number; onChoose: (id: number) => void }) {
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState("");
  const [retry, setRetry] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; result: Result } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const key = `${customerId}:${page}:${status}:${refresh}:${retry}`;
  useEffect(() => {
    if (!page) return;
    const abort = new AbortController();
    async function load() {
      try {
        const params = new URLSearchParams({ page: String(page), status });
        const response = await authFetch(`/api/crm/customers/${customerId}/duplicate-reviews?${params}`, { cache: "no-store", signal: abort.signal });
        const json = await response.json();
        if (!response.ok || !json.success) throw new Error(typeof json.error === "string" ? json.error : "Değerlendirmeler yüklenemedi.");
        if (!abort.signal.aborted) { setLoaded({ key, result: json }); setFailure(null); }
      } catch (err) {
        if (!abort.signal.aborted) { setLoaded(null); setFailure({ key, message: err instanceof Error ? err.message : "Değerlendirmeler yüklenemedi." }); }
      }
    }
    void load();
    return () => abort.abort();
  }, [customerId, page, status, refresh, retry, key]);
  const current = loaded?.key === key ? loaded.result : null;
  const error = failure?.key === key ? failure.message : "";
  const busy = page > 0 && !current && !error;
  const button = "rounded-xl border border-stone-200 px-3 py-2 text-xs font-bold disabled:opacity-40";
  return <div className="rounded-xl border border-stone-200 p-3 space-y-3">
    <div><h4 className="text-sm font-bold text-stone-900">Kaydedilmiş aday değerlendirmeleri</h4><p className="text-xs text-stone-500 mt-1">Bu karta bağlı insan değerlendirmeleri, telefon veya e-posta artık eşleşmese bile gösterilir. Karar kimlik doğrulaması veya birleştirme değildir.</p></div>
    <div className="flex flex-wrap items-end gap-2"><label htmlFor="crm-review-history-filter" className="text-xs font-bold text-stone-700">Değerlendirme durumu<select id="crm-review-history-filter" className="mt-1 block border rounded-xl px-3 py-2 text-sm font-normal" disabled={disabled || busy} value={status} onChange={e => { setStatus(e.target.value); if (page) setPage(1); }}><option value="">Tümü</option><option value="UNSURE">Karar verilemedi</option><option value="DISTINCT">Farklı kişiler</option></select></label><button type="button" className={button} disabled={disabled || busy} onClick={() => page ? setRetry(value => value + 1) : setPage(1)}>{page ? "Değerlendirmeleri yenile" : "Değerlendirmeleri göster"}</button></div>
    {busy && <p role="status" className="text-xs text-stone-500">Değerlendirmeler yükleniyor…</p>}
    {error && <p role="alert" className="text-xs text-rose-700">{error} <button type="button" disabled={disabled} className="underline" onClick={() => setRetry(value => value + 1)}>Tekrar dene</button></p>}
    {current && <>{current.data.length ? <ul className="divide-y divide-stone-100">{current.data.map(row => <li key={row.customer.id} className="py-3 flex flex-wrap justify-between gap-2 items-center"><div><p className="text-sm font-bold break-words">#{row.customer.id} · {row.customer.name}</p><p className="text-xs text-stone-600">{row.status === "DISTINCT" ? "Farklı kişiler olarak değerlendirildi" : "Karar verilemedi"} · {row.reviewedByName} · {new Date(row.reviewedAt * 1000).toLocaleString("tr-TR")}</p>{row.stale && <p className="text-xs font-bold text-amber-800">Kart alanları değişmiş; yeniden inceleyin.</p>}</div><button type="button" disabled={disabled} className={button} onClick={() => onChoose(row.customer.id)}>Karşılaştırmaya seç</button></li>)}</ul> : <p className="text-xs text-stone-500">Bu sayfada kayıtlı değerlendirme yok.</p>}
      <p className="text-xs text-stone-500">Değişiklik uyarısı yalnız ad, telefon, e-posta, şehir, adres ve şirket alanlarına bakar; bağlı siparişler, hesaplar ve dış kaynaklar denetlenmez. Sayfalar arasında eşzamanlı değişiklikler sonuçları etkileyebilir.</p>
      <div className="flex items-center gap-2"><button type="button" className={button} disabled={disabled || page <= 1} onClick={() => setPage(page - 1)}>Önceki değerlendirmeler</button><span className="text-xs text-stone-500">Sayfa {page}</span><button type="button" className={button} disabled={disabled || !current.pagination.hasMore} onClick={() => setPage(page + 1)}>Sonraki değerlendirmeler</button></div></>}
  </div>;
}
