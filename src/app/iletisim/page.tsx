"use client";

import React, { useState } from "react";
import { Mail, Phone, MapPin } from "lucide-react";

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 space-y-10">
      <div>
        <h1 className="text-3xl sm:text-4xl font-black text-stone-900 tracking-tight">
          İletişim & Destek Masası
        </h1>
        <p className="text-stone-500 text-sm mt-1">
          Dikiş malzemesi danışmanlığı, toptan alım talepleri veya siparişleriniz için bize ulaşın.
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
                  <span>siparis@ipektuhafiye.com</span>
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
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Adınız Soyadınız:</label>
                  <input type="text" required className="w-full px-3 py-2 border border-stone-300 rounded-xl" />
                </div>
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Telefon / WhatsApp:</label>
                  <input type="text" required className="w-full px-3 py-2 border border-stone-300 rounded-xl" />
                </div>
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">E-Posta Adresiniz:</label>
                <input type="email" required className="w-full px-3 py-2 border border-stone-300 rounded-xl" />
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">Konu:</label>
                <select className="w-full px-3 py-2 border border-stone-300 rounded-xl">
                  <option>Sipariş Takibi & Kargo</option>
                  <option>B2B Toptan Fiyat Talebi</option>
                  <option>Ürün Teknik Bilgisi / İplik Seçimi</option>
                  <option>İade veya Değişim Talebi</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">Mesajınız:</label>
                <textarea rows={4} required className="w-full px-3 py-2 border border-stone-300 rounded-xl" />
              </div>

              <button
                type="submit"
                className="py-3 px-6 bg-amber-800 hover:bg-amber-900 text-white font-bold rounded-xl text-xs transition"
              >
                Mesajı Gönder
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
