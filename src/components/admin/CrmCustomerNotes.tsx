"use client";

import React, { useState } from "react";
import { authFetch } from "@/lib/client-auth";

export type CrmNote = { id: number; body: string; createdByName: string; createdAt: number };

export function CrmCustomerNotes({ customerId, initialNotes, onCreated }: { customerId: number; initialNotes: CrmNote[]; onCreated?: () => void }) {
  const [notes, setNotes] = useState(initialNotes);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!body.trim() || body.trim().length > 2000) { setError("Not 1–2000 karakter olmalıdır."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const res = await authFetch(`/api/crm/customers/${customerId}/notes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(typeof result.error === "string" ? result.error : "Not kaydedilemedi.");
      setNotes(previous => [result.data, ...previous].slice(0, 50));
      setBody(""); setMessage("Not kaydedildi."); onCreated?.();
    } catch (err) { setError(err instanceof Error ? err.message : "Not kaydedilemedi."); }
    finally { setBusy(false); }
  }

  return <section className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4 space-y-4">
    <div><h3 className="font-bold text-stone-900">Müşteri notları</h3><p className="text-xs text-stone-500 mt-1">Yalnız CRM yetkisi olan personel görür. Hassas kişisel bilgiler ve şifreler eklemeyin. Notlar bu aşamada düzenlenemez veya silinemez.</p></div>
    <form onSubmit={submit} className="space-y-2"><label htmlFor="crm-note" className="block text-xs font-bold text-stone-700">Yeni not</label><textarea id="crm-note" value={body} onChange={event => setBody(event.target.value)} maxLength={2000} rows={3} className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm" placeholder="Müşteriyle ilgili takip notu…"/><div className="flex justify-between items-center"><span className="text-xs text-stone-400">{body.length}/2000</span><button type="submit" disabled={busy} className="px-4 py-2 bg-amber-800 text-white rounded-xl text-xs font-bold disabled:opacity-50">{busy ? "Kaydediliyor…" : "Not ekle"}</button></div></form>
    {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}{message && <p role="status" className="text-xs text-emerald-700">{message}</p>}
    <div><p className="text-xs text-stone-500 mb-2">En yeni 50 not gösterilir.</p>{notes.length ? <ul className="divide-y divide-stone-100">{notes.map(note => <li key={note.id} className="py-3"><p className="whitespace-pre-wrap break-words text-sm text-stone-800">{note.body}</p><p className="text-xs text-stone-400 mt-1">{note.createdByName} · {new Date(note.createdAt * 1000).toLocaleString("tr-TR")}</p></li>)}</ul> : <p className="text-xs text-stone-500">Henüz not eklenmedi.</p>}</div>
  </section>;
}
