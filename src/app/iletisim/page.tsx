"use client";

import React, { useState } from "react";
import { Mail, Phone, MapPin } from "lucide-react";

const SUBJECT_OPTIONS = [
  "Sipariş Takibi & Kargo",
  "Ürün Teknik Bilgisi / İplik Seçimi",
  "İade veya Değişim Talebi",
  "Diğer",
];

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    subject: SUBJECT_OPTIONS[0],
    message: "",
  });

  const setField = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        setSubmitted(true);
        setForm({ name: "", phone: "", email: "", subject: SUBJECT_OPTIONS[0], message: "" });
      } else {
        setError(data?.error?.message || "Mesajınız gönderilemedi. Lütfen tekrar deneyin.");
      }
    } catch {
      setError("Bağlantı hatası. Lütfen internet bağlantınızı kontrol edip tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 space-y-10">
      <div>
        <h1 className="text-3xl sm:text-4xl font-black text-stone-900 tracking-tight">
          İletişim & Destek Masası
        </h1>
        <p className="text-stone-500 text-sm mt-1">
          Dikiş malzemesi danışmanlığı veya siparişleriniz için bize ulaşın.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        <div className="md:col-span-5 space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-xs space-y-4">
            <h3 className="font-bold text-sm text-stone-900">İletişim Bilgilerimiz</h3>

            <div className="space-y-3 text-xs text-stone-600">
              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-amber-800 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-stone-900">Merkez:</strong>
                  <span>Moda Caddesi No: 18, Kadıköy / İstanbul</span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Phone className="w-4 h-4 text-amber-800 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-stone-900">Müşteri Hizmetleri:</strong>
                  <span>0850 888 20 26 & 0216 333 44 55</span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Mail className="w-4 h-4 text-amber-800 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-stone-900">E-Posta:</strong>
                  <span>siparis@serpilencollection.com</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="md:col-span-7 bg-white p-6 rounded-3xl border border-stone-200 shadow-xs space-y-4">
          <h3 className="font-bold text-sm text-stone-900">Bize Mesaj Gönderin</h3>

          {submitted ? (
            <div className="p-6 bg-emerald-50 rounded-2xl border border-emerald-200 text-center space-y-2">
              <h4 className="font-bold text-emerald-900 text-sm">✓ Mesajınız Alındı</h4>
              <p className="text-xs text-emerald-800">
                Müşteri hizmetleri ekibimiz en kısa sürede sizinle iletişime geçecektir.
              </p>
              <button
                type="button"
                onClick={() => setSubmitted(false)}
                className="mt-2 text-[11px] font-bold text-emerald-900 underline hover:no-underline"
              >
                Yeni mesaj gönder
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3 text-xs">
              {error && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-medium">
                  {error}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Adınız Soyadınız:</label>
                  <input
                    type="text" required minLength={2} autoComplete="name"
                    value={form.name} onChange={setField("name")}
                    className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Telefon / WhatsApp:</label>
                  <input
                    type="tel" required minLength={6} autoComplete="tel"
                    value={form.phone} onChange={setField("phone")}
                    className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">E-Posta Adresiniz:</label>
                <input
                  type="email" required autoComplete="email"
                  value={form.email} onChange={setField("email")}
                  className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">Konu:</label>
                <select
                  value={form.subject} onChange={setField("subject")}
                  className="w-full px-3 py-2 border border-stone-300 rounded-xl bg-white"
                >
                  {SUBJECT_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">Mesajınız:</label>
                <textarea
                  rows={4} required minLength={5} maxLength={4000}
                  value={form.message} onChange={setField("message")}
                  className="w-full px-3 py-2 border border-stone-300 rounded-xl"
                />
              </div>

              <button
                type="submit" disabled={busy}
                className="py-3 px-6 bg-amber-800 hover:bg-amber-900 disabled:opacity-60 text-white font-bold rounded-xl text-xs transition"
              >
                {busy ? "Gönderiliyor…" : "Mesajı Gönder"}
              </button>
              <p className="text-[11px] text-stone-400">
                Mesajınız Destek Masasına iletilir; yönetim panelindeki Destek Masası ekranından takip edilir.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
