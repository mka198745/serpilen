import React from "react";
import Link from "next/link";
import { Scissors, ShieldCheck, Award, Heart, CheckCircle2 } from "lucide-react";

export default function AboutPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-12 space-y-10">
      <div className="text-center space-y-3 max-w-2xl mx-auto">
        <span className="text-xs font-black uppercase text-amber-800 bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
          30+ Yıllık Tuhafiye Tecrübesi
        </span>
        <h1 className="text-3xl sm:text-5xl font-black text-stone-900 tracking-tight">
          Hakkımızda & Kurumsal Vizyonumuz
        </h1>
        <p className="text-stone-500 text-sm leading-relaxed">
          1994 yılından bugüne Kadıköy Moda'daki fiziki mağazamız, İkitelli lojistik merkezimiz ve dijital perakende altyapımızla dikiş ve el sanatları dünyasına hizmet veriyoruz.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-xs space-y-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-base text-stone-900">%100 Orijinal Ürünler</h3>
          <p className="text-xs text-stone-500 leading-relaxed">
            YKK Fermuar, Gütermann İplik, Prym ve DMC gibi dünya standartlarında kalite üreten markaların resmi ve doğrudan tedarikçisiyiz.
          </p>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-xs space-y-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
            <Scissors className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-base text-stone-900">Usta Terzilerin Tercihi</h3>
          <p className="text-xs text-stone-500 leading-relaxed">
            Moda tasarımı öğrencileri, atölye ustaları ve hobi meraklılarına özel geniş renk kartelası ve her kumaşa uygun teknik malzeme danışmanlığı sunuyoruz.
          </p>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-xs space-y-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
            <Award className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-base text-stone-900">Tekil Dijital Entegrasyon</h3>
          <p className="text-xs text-stone-500 leading-relaxed">
            Fiziki mağaza kasamız (Web POS), online vitrinimiz ve B2B toptan ambarımız tek bir veritabanında çalışır; stoklarımız daima %100 günceldir.
          </p>
        </div>
      </div>
    </div>
  );
}
