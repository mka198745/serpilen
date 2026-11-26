"use client";

import React, { useState } from "react";
import { authFetch } from "@/lib/client-auth";

const fields = [
  { key: "name", label: "Ad soyad", max: 120, required: true },
  { key: "phone", label: "Telefon", max: 40, required: true },
  { key: "email", label: "E-posta", max: 254 },
  { key: "city", label: "Şehir", max: 100 },
  { key: "companyName", label: "Şirket unvanı", max: 160 },
  { key: "address", label: "Adres", max: 500 },
] as const;
type Values = Record<typeof fields[number]["key"], string>;
const empty: Values = { name: "", phone: "", email: "", city: "", companyName: "", address: "" };

export function CrmCustomerCreate({ onCreated }: { onCreated: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Values>(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const res = await authFetch("/api/crm/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(typeof body.error === "string" ? body.error : "Müşteri oluşturulamadı.");
      setOpen(false); setValues(empty); onCreated(body.data.id);
    } catch (err) { setError(err instanceof Error ? err.message : "Müşteri oluşturulamadı."); }
    finally { setBusy(false); }
  }
  return <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
    <div className="flex items-center justify-between gap-3"><div><h3 className="font-bold text-stone-900">Yeni müşteri kartı</h3><p className="text-xs text-stone-500 mt-1">Cari kart açar; web üyeliği oluşturmaz.</p></div><button type="button" disabled={busy} onClick={() => { setOpen(!open); setError(""); }} className="px-3 py-2 rounded-xl bg-amber-800 text-white text-xs font-bold disabled:opacity-50" aria-expanded={open}>{open ? "Kapat" : "+ Müşteri ekle"}</button></div>
    {open && <form onSubmit={submit} className="mt-4 space-y-3"><div className="grid gap-3 sm:grid-cols-2">{fields.map(field => <label key={field.key} className={`text-xs font-bold text-stone-700 ${field.key === "address" ? "sm:col-span-2" : ""}`}>{field.label}{"required" in field && field.required ? " *" : ""}{field.key === "address" ? <textarea maxLength={field.max} rows={2} value={values[field.key]} onChange={event => setValues({ ...values, [field.key]: event.target.value })} className="mt-1 w-full rounded-xl border border-stone-300 p-2 text-sm font-normal"/> : <input required={"required" in field && field.required} type={field.key === "email" ? "email" : "text"} maxLength={field.max} value={values[field.key]} onChange={event => setValues({ ...values, [field.key]: event.target.value })} className="mt-1 w-full rounded-xl border border-stone-300 p-2 text-sm font-normal"/>}</label>)}</div><p className="text-xs text-stone-500">Telefon 7–15 rakam içermeli; e-posta isteğe bağlıdır. Benzer kayıtlar her durumda otomatik tespit edilemeyebilir.</p>{error && <p role="alert" className="text-xs text-rose-700">{error}</p>}<button disabled={busy} className="px-4 py-2 rounded-xl bg-amber-800 text-white text-xs font-bold disabled:opacity-50">{busy ? "Kaydediliyor…" : "Müşteriyi kaydet"}</button></form>}
  </section>;
}
