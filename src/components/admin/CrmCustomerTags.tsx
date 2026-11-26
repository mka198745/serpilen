"use client";

import React, { useState } from "react";
import { authFetch } from "@/lib/client-auth";

export type CrmTag = { id: number; name: string; customerCount?: number };

export function CrmCustomerTags({ customerId, initialTags, canWrite = true }: { customerId: number; initialTags: CrmTag[]; canWrite?: boolean }) {
  const [tags, setTags] = useState(initialTags);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function change(body: { action: "ADD"; name: string } | { action: "REMOVE"; tagId: number }) {
    if (busy) return;
    setError(""); setMessage(""); setBusy(true);
    try {
      const res = await authFetch(`/api/crm/customers/${customerId}/tags`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(typeof data.error === "string" ? data.error : "Etiket güncellenemedi.");
      setTags(data.data); if (body.action === "ADD") setName("");
      setMessage(body.action === "ADD" ? "Etiket eklendi." : "Etiket müşteriden kaldırıldı.");
    } catch (err) { setError(err instanceof Error ? err.message : "Etiket güncellenemedi."); }
    finally { setBusy(false); }
  }
  return <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm space-y-3"><div><h3 className="font-bold text-stone-900">Müşteri etiketleri</h3><p className="text-xs text-stone-500 mt-1">Etiketler müşterileri gruplamak ve listede filtrelemek içindir; otomatik segment oluşturmaz.</p></div>
    <div className="flex flex-wrap gap-2">{tags.map(tag => <span key={tag.id} className="flex items-center gap-2 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs text-amber-900">{tag.name}{canWrite && <button type="button" disabled={busy} aria-label={`${tag.name} etiketini kaldır`} onClick={() => void change({ action: "REMOVE", tagId: tag.id })} className="font-bold disabled:opacity-40">×</button>}</span>)}{!tags.length && <p className="text-xs text-stone-500">Henüz etiket yok.</p>}</div>
    {canWrite && <form onSubmit={event => { event.preventDefault(); if (!name.trim()) { setError("Etiket adı girin."); return; } void change({ action: "ADD", name }); }} className="flex gap-2 flex-wrap"><label className="sr-only" htmlFor="crm-tag-name">Etiket adı</label><input id="crm-tag-name" maxLength={40} value={name} onChange={event => setName(event.target.value)} placeholder="Etiket adı" className="px-3 py-2 border border-stone-300 rounded-xl text-sm"/><button disabled={busy} className="px-3 py-2 rounded-xl border border-stone-200 text-xs font-bold disabled:opacity-40">{busy ? "Kaydediliyor…" : "Etiket ekle"}</button></form>}
    {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}{message && <p role="status" className="text-xs text-emerald-700">{message}</p>}
  </section>;
}
