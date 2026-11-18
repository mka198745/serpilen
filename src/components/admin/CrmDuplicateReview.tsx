"use client";

import React, { useState } from "react";
import { authFetch } from "@/lib/client-auth";

export type DuplicateReview = { status: "DISTINCT" | "UNSURE"; revision: number; reviewedByName: string; reviewedAt: number; stale: boolean };
type Versions = { source: string; target: string };

export function CrmDuplicateReview({ customerId, targetId, versions, review, onSaved, onBusyChange }: { customerId: number; targetId: number; versions: Versions; review: DuplicateReview | null; onSaved: (review: DuplicateReview) => void; onBusyChange: (busy: boolean) => void }) {
  const [choice, setChoice] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !["DISTINCT", "UNSURE"].includes(choice) || !confirm) return;
    setBusy(true); onBusyChange(true); setError(""); setMessage("");
    try {
      const res = await authFetch(`/api/crm/customers/${customerId}/duplicate-review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetId, status: choice, sourceVersion: versions.source, targetVersion: versions.target, expectedRevision: review?.revision ?? null }) });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(typeof json.error === "string" ? json.error : "Değerlendirme kaydedilemedi.");
      onSaved(json.review); setChoice(""); setConfirm(false); setMessage("Değerlendirme kaydedildi; hiçbir müşteri birleştirilmedi.");
    } catch (err) { setError(err instanceof Error ? err.message : "Değerlendirme kaydedilemedi."); }
    finally { setBusy(false); onBusyChange(false); }
  }
  return <div className="rounded-xl border border-stone-200 p-3 space-y-3">
    <div><h4 className="text-sm font-bold text-stone-900">Aday değerlendirmesi</h4><p className="text-xs text-stone-500 mt-1">İki kart için yalnızca personelin değerlendirmesi kaydedilir. Bu işlem kimliği doğrulamaz, adayı gizlemez ve birleştirme yapmaz.</p></div>
    {review ? <p className={`rounded-lg p-2 text-xs ${review.stale ? "bg-amber-50 text-amber-900" : "bg-stone-50 text-stone-700"}`}>Son değerlendirme: <strong>{review.status === "DISTINCT" ? "Farklı kişiler olarak değerlendirildi" : "Karar verilemedi"}</strong> · {review.reviewedByName} · {new Date(review.reviewedAt * 1000).toLocaleString("tr-TR")}{review.stale && <strong> · Kart alanları değişmiş; yeniden inceleyin.</strong>}</p> : <p className="text-xs text-stone-500">Bu iki kart için kayıtlı değerlendirme yok.</p>}
    <p className="text-xs text-stone-500">Ad, telefon, e-posta, şehir, adres veya şirketin güncel değeri önceki incelemeden farklıysa uyarı gösterilir. Siparişler, üyelikler ve dış kaynaklardaki değişiklikler bu uyarı kapsamında değildir.</p>
    <form onSubmit={submit} className="space-y-2"><label htmlFor="crm-review-choice" className="block text-xs font-bold text-stone-700">Değerlendirme<select id="crm-review-choice" disabled={busy} value={choice} onChange={event => { setChoice(event.target.value); setMessage(""); }} className="mt-1 block rounded-xl border border-stone-300 px-3 py-2 text-sm font-normal"><option value="">Seçin</option><option value="DISTINCT">Farklı kişiler olarak değerlendiriyorum</option><option value="UNSURE">Karar veremedim · yeniden incelensin</option></select></label><label className="flex items-start gap-2 text-xs text-stone-700"><input type="checkbox" disabled={busy} checked={confirm} onChange={event => setConfirm(event.target.checked)} className="mt-0.5"/>Bu kaydın birleştirme yapmadığını ve bir kimlik doğrulaması olmadığını anlıyorum.</label><button disabled={busy || !choice || !confirm} className="rounded-xl bg-amber-800 text-white px-3 py-2 text-xs font-bold disabled:opacity-40">{busy ? "Kaydediliyor…" : "Değerlendirmeyi kaydet"}</button></form>
    {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}{message && <p role="status" className="text-xs text-emerald-700">{message}</p>}
  </div>;
}
