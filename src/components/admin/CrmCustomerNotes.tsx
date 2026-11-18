"use client";

import React, { useEffect, useState } from "react";
import { authFetch } from "@/lib/client-auth";

export type CrmNote = { id: number; body: string; createdByName: string; createdAt: number };

export function CrmCustomerNotes({ customerId, initialNotes, onCreated, canWrite = true }: { customerId: number; initialNotes: CrmNote[]; onCreated?: () => void; canWrite?: boolean }) {
  const [notes, setNotes] = useState(() => initialNotes.slice(0, 20));
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState<number | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const abort = new AbortController();
    async function load() {
      try {
        const res = await authFetch(`/api/crm/customers/${customerId}/notes?page=${page}`, { signal: abort.signal, cache: "no-store" });
        const result = await res.json();
        if (!res.ok || !result.success) throw new Error(typeof result.error === "string" ? result.error : "Notlar yüklenemedi.");
        if (!abort.signal.aborted) { setNotes(result.data); setTotal(result.pagination.total); setLoadError(""); }
      } catch (err) { if (!abort.signal.aborted) setLoadError(err instanceof Error ? err.message : "Notlar yüklenemedi."); }
      finally { if (!abort.signal.aborted) setLoading(false); }
    }
    void load();
    return () => abort.abort();
  }, [customerId, page, refresh]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || loading) return;
    if (!body.trim() || body.trim().length > 2000) { setError("Not 1–2000 karakter olmalıdır."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const res = await authFetch(`/api/crm/customers/${customerId}/notes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(typeof result.error === "string" ? result.error : "Not kaydedilemedi.");
      setBody(""); setMessage("Not kaydedildi; en yeni notlar gösteriliyor."); setLoading(true); setPage(1); setRefresh(value => value + 1); onCreated?.();
    } catch (err) { setError(err instanceof Error ? err.message : "Not kaydedilemedi."); }
    finally { setBusy(false); }
  }
  const button = "border border-stone-200 rounded-lg px-3 py-1.5 disabled:opacity-40";
  const visible = !loadError && (!loading || total === null);

  return <section id="crm-notes" className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4 space-y-4 scroll-mt-24">
    <div><h3 className="font-bold text-stone-900">Müşteri notları</h3><p className="text-xs text-stone-500 mt-1">Notlar en yeniden eskiye sayfa başına 20 kayıtla gösterilir. Önceki ve Sonraki düğmeleriyle eski notlara ulaşabilirsiniz. Liste görüntülemesi denetim kaydına yazılır.</p><p className="text-xs text-stone-500 mt-1">Yalnız CRM yetkisi olan personel görür. Hassas kişisel bilgiler ve şifreler eklemeyin. Notlar bu aşamada düzenlenemez veya silinemez.</p></div>
    {canWrite && <form onSubmit={submit} className="space-y-2"><label htmlFor="crm-note" className="block text-xs font-bold text-stone-700">Yeni not</label><textarea id="crm-note" value={body} onChange={event => setBody(event.target.value)} maxLength={2000} rows={3} className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm" placeholder="Müşteriyle ilgili takip notu…"/><div className="flex justify-between items-center"><span className="text-xs text-stone-400">{body.length}/2000</span><button type="submit" disabled={busy || loading} className="px-4 py-2 bg-amber-800 text-white rounded-xl text-xs font-bold disabled:opacity-50">{busy ? "Kaydediliyor…" : "Not ekle"}</button></div></form>}
    {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}{message && <p role="status" className="text-xs text-emerald-700">{message}</p>}
    {loading && <p role="status" className="text-xs text-stone-500">Notlar yükleniyor…</p>}
    {loadError && <p role="alert" className="text-xs text-rose-700">{loadError} <button type="button" className="underline font-bold" onClick={() => { setLoading(true); setLoadError(""); setRefresh(value => value + 1); }}>Tekrar dene</button></p>}
    {visible && <div>{notes.length ? <ul className="divide-y divide-stone-100">{notes.map(note => <li key={note.id} className="py-3"><p className="whitespace-pre-wrap break-words text-sm text-stone-800">{note.body}</p><p className="text-xs text-stone-400 mt-1">{note.createdByName} · {new Date(note.createdAt * 1000).toLocaleString("tr-TR")}</p></li>)}</ul> : !loading && <p className="text-xs text-stone-500">{page === 1 ? "Henüz not eklenmedi." : "Bu sayfada not bulunamadı; önceki sayfaya dönün."}</p>}</div>}
    {!loading && !loadError && total !== null && <div className="flex justify-between items-center text-xs text-stone-500"><span>Sayfa {page} · {total} not</span><div className="flex gap-2"><button type="button" disabled={busy || page <= 1} onClick={() => { setLoading(true); setPage(page - 1); }} className={button}>Önceki</button><button type="button" disabled={busy || page * 20 >= total} onClick={() => { setLoading(true); setPage(page + 1); }} className={button}>Sonraki</button></div></div>}
  </section>;
}
