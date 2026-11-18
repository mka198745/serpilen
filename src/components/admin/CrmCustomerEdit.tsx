"use client";

import React, { useState } from "react";
import { authFetch } from "@/lib/client-auth";

type Editable = { id: number; name: string; phone: string; email: string | null; city: string | null; address?: string | null; companyName?: string | null };
type Fields = { name: string; phone: string; email: string; city: string; address: string; companyName: string };
const labels: { key: keyof Fields; label: string; max: number }[] = [
  { key: "name", label: "Ad soyad *", max: 120 },
  { key: "phone", label: "Telefon *", max: 40 },
  { key: "email", label: "E-posta", max: 254 },
  { key: "city", label: "Şehir", max: 100 },
  { key: "companyName", label: "Şirket unvanı", max: 160 },
  { key: "address", label: "Adres", max: 500 },
];

const toFields = (customer: Editable): Fields => ({ name: customer.name, phone: customer.phone, email: customer.email ?? "", city: customer.city ?? "", companyName: customer.companyName ?? "", address: customer.address ?? "" });

export function CrmCustomerEdit({ customer, editVersion, onSaved }: { customer: Editable; editVersion: string; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Fields>(() => toFields(customer));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(""); setMessage(""); setBusy(true);
    try {
      const response = await authFetch(`/api/crm/customers/${customer.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, editVersion }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(typeof result.error === "string" ? result.error : "Müşteri kaydedilemedi.");
      setValues(toFields(result.data.customer)); setMessage("Müşteri kartı güncellendi."); setEditing(false); onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : "Müşteri kaydedilemedi."); }
    finally { setBusy(false); }
  }
  return <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm space-y-3">
    <div className="flex justify-between items-start gap-3"><div><h3 className="font-bold text-stone-900">Müşteri bilgileri</h3><p className="text-xs text-stone-500 mt-1">Buradaki değişiklikler yalnız müşteri kartını etkiler; üye giriş hesabını ve eski sipariş bilgilerini değiştirmez.</p></div><button type="button" onClick={() => { if (editing) setValues(toFields(customer)); setEditing(value => !value); setError(""); setMessage(""); }} className="px-3 py-2 rounded-xl border border-stone-200 text-xs font-bold hover:bg-stone-50" disabled={busy}>{editing ? "İptal" : "Düzenle"}</button></div>
    {editing ? <form onSubmit={submit} className="space-y-3"><div className="grid gap-3 sm:grid-cols-2">{labels.map(field => <label key={field.key} className={`text-xs font-bold text-stone-700 ${field.key === "address" ? "sm:col-span-2" : ""}`}>{field.label}{field.key === "address" ? <textarea rows={2} maxLength={field.max} value={values[field.key]} onChange={e => setValues({ ...values, [field.key]: e.target.value })} className="mt-1 w-full rounded-xl border border-stone-300 p-2 text-sm font-normal"/> : <input maxLength={field.max} value={values[field.key]} onChange={e => setValues({ ...values, [field.key]: e.target.value })} className="mt-1 w-full rounded-xl border border-stone-300 p-2 text-sm font-normal"/>}</label>)}</div><p className="text-xs text-stone-500">E-posta isteğe bağlıdır. Telefon değiştirildiğinde 7–15 rakam içermelidir.</p><button disabled={busy} className="px-4 py-2 rounded-xl bg-amber-800 text-white text-xs font-bold disabled:opacity-50">{busy ? "Kaydediliyor…" : "Değişiklikleri kaydet"}</button></form> : <dl className="grid gap-3 sm:grid-cols-2 text-xs">{labels.map(field => <div key={field.key}><dt className="text-stone-500">{field.label.replace(" *", "")}</dt><dd className="mt-1 text-stone-900 break-words whitespace-pre-wrap">{values[field.key] || "—"}</dd></div>)}</dl>}
    {error && <p role="alert" className="text-xs text-rose-700">{error} <button type="button" onClick={() => { setValues(toFields(customer)); setEditing(false); setError(""); onSaved(); }} className="font-bold underline ml-2">Profili yenile (taslağı iptal et)</button></p>}{message && <p role="status" className="text-xs text-emerald-700">{message}</p>}
  </section>;
}
