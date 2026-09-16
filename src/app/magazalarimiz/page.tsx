import React from "react";
import Link from "next/link";
import { MapPin, Phone, Clock, MonitorCheck } from "lucide-react";

export default function StoresPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-12 space-y-10">
      <div>
        <h1 className="text-3xl sm:text-4xl font-black text-stone-900 tracking-tight">
          Mağazalarımız & Depo Noktalarımız
        </h1>
        <p className="text-stone-500 text-sm mt-1">
          Fiziki olarak ürünlerimizi görüp seçebileceğiniz mağazamız ve lojistik merkezlerimiz.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Kadıköy Mağaza */}
        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <span className="bg-amber-100 text-amber-900 text-xs font-bold px-2.5 py-0.5 rounded-full">
              Fiziki Satış Mağazası & Kasa
            </span>
            <span className="text-emerald-700 text-xs font-bold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Şu Anda Açık
            </span>
          </div>

          <h3 className="text-xl font-black text-stone-900">Kadıköy Moda Mağazası</h3>

          <div className="space-y-2 text-xs text-stone-600">
            <p className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-amber-800 shrink-0 mt-0.5" />
              <span>Moda Caddesi No: 18 (Tramvay Durağı Karşısı), Kadıköy / İstanbul</span>
            </p>
            <p className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-amber-800 shrink-0" />
              <span>0216 333 44 55</span>
            </p>
            <p className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-800 shrink-0" />
              <span>Pazartesi - Cumartesi: 09:00 - 19:30 | Pazar: 11:00 - 18:00</span>
            </p>
          </div>

          <div className="pt-2 flex items-center gap-2">
            <Link
              href="/pos"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-lg text-xs font-bold transition"
            >
              <MonitorCheck className="w-3.5 h-3.5 text-amber-800" />
              <span>Kasiyer POS Ekranı</span>
            </Link>
          </div>
        </div>

        {/* Merkez Depo */}
        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <span className="bg-sky-100 text-sky-900 text-xs font-bold px-2.5 py-0.5 rounded-full">
              Merkez Depo & Lojistik Üssü
            </span>
            <span className="text-sky-700 text-xs font-bold">B2B & E-Ticaret Sevk</span>
          </div>

          <h3 className="text-xl font-black text-stone-900">İkitelli Lojistik & Toptan Depo</h3>

          <div className="space-y-2 text-xs text-stone-600">
            <p className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-sky-800 shrink-0 mt-0.5" />
              <span>İkitelli OSB Dokumacılar Sanayi Sitesi 4. Blok No: 42, Başakşehir / İstanbul</span>
            </p>
            <p className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-sky-800 shrink-0" />
              <span>0850 888 20 26</span>
            </p>
            <p className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-sky-800 shrink-0" />
              <span>Hafta İçi: 08:30 - 18:00 (Koli & Palet Mal Kabul)</span>
            </p>
          </div>

          <div className="pt-2">
            <Link
              href="/toptan-b2b"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-900 rounded-lg text-xs font-bold transition"
            >
              <span>Toptan Cari Sevk Portalı →</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
