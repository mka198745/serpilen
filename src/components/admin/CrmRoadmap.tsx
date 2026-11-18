"use client";

import React from "react";
import { ClipboardList } from "lucide-react";

const stages = [
  { title: "Faz 1 · Çekirdek CRM", status: "Kodlanıyor · Kısmen hazır", done: "Müşteri listesi, arama, sayfalama, profil, temel kart bilgilerini düzenleme, bağlı sipariş özeti, rol matrisi, müşteri notu ekleme ve mevcut kayıtlara dayalı temel zaman çizelgesi. Müşteri oluşturma ve etiketlemenin sunucu altyapısı test edildi; panel arayüzleri henüz yok.", next: "Müşteri oluşturma ve etiketleme arayüzleri, güvenli birleştirme ve temel segmentasyon; zaman çizelgesi filtreleri, işlem/kayıt bazlı yetkiler ve daha kapsamlı sipariş/ödeme entegrasyonu." },
  { title: "Faz 2 · Müşteri analitiği", status: "Planlandı · Başlanmadı", done: "CRM 360 kapsamında henüz tamamlanmış bir teslim yok.", next: "RFM, müşteri yaşam döngüsü, davranış analizi, segmentasyon, raporlar ve elde tutma." },
  { title: "Faz 3 · İletişim ve otomasyon", status: "Planlandı · Başlanmadı", done: "CRM 360 kapsamında henüz tamamlanmış bir teslim yok.", next: "İzin geçmişi, iletişim merkezi, sağlayıcı entegrasyonları, destek ve otomasyonlar." },
  { title: "Faz 4 · Sadakat ve gelişmiş CRM", status: "Planlandı · Başlanmadı", done: "CRM 360 kapsamında henüz tamamlanmış bir teslim yok.", next: "Sadakat, VIP, geri bildirim, risk göstergeleri ve gelişmiş segmentler." },
  { title: "Faz 5 · Yapay zekâ", status: "Planlandı · Başlanmadı", done: "CRM 360 kapsamında henüz tamamlanmış bir teslim yok.", next: "Yetki kısıtlı AI özetleri, öngörüler, öneriler ve müşteri asistanı." },
];

export function CrmRoadmap() {
  return <details className="rounded-2xl border border-amber-200 bg-amber-50/50 overflow-hidden">
    <summary className="cursor-pointer list-none p-4 flex gap-3 items-center justify-between"><span className="flex items-center gap-3"><ClipboardList className="text-amber-800" size={20}/><span><span className="font-black text-sm text-stone-900 block">CRM geliştirme yol haritası</span><span className="text-xs text-stone-600">Kodlamaya başlandı · Faz 1 kısmen hazır · Ayrıntıları aç</span></span></span><span aria-hidden="true" className="text-amber-800 text-lg">⌄</span></summary>
    <div className="px-4 pb-4 space-y-3"><p className="text-xs text-stone-600">Bu bilgiler CRM 360 geliştirme durumunu gösterir; önceki bağımsız modüllerin durumunu değiştirmez. Önizlemedeki yenilikler, ayrıca dağıtılmadıkça canlı sistemde yer almaz.</p>
      <div className="grid md:grid-cols-2 gap-3">{stages.map(stage => <article key={stage.title} className="bg-white rounded-xl border border-stone-200 p-3"><div className="flex flex-wrap gap-2 justify-between items-center"><h3 className="font-bold text-sm text-stone-900">{stage.title}</h3><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${stage.title.startsWith("Faz 1") ? "bg-amber-100 text-amber-900" : "bg-stone-100 text-stone-600"}`}>{stage.status}</span></div><p className="text-xs text-stone-600 mt-2 leading-relaxed"><strong>Mevcut:</strong> {stage.done}</p><p className="text-xs text-stone-600 mt-2 leading-relaxed"><strong>Yapılacak:</strong> {stage.next}</p></article>)}</div>
      <p className="text-xs text-stone-500">Hazır olmayan iletişim kanalları, rıza, tahmin ve otomasyonlar çalışıyormuş gibi gösterilmez. İlerlemenin yüzdesi veya tamamlanma tarihi henüz belirlenmedi.</p>
    </div>
  </details>;
}
