"use client";

import React from "react";

export type CrmTimelineEvent = { kind: "CUSTOMER_CREATED" | "ORDER_CREATED" | "ORDER_STATUS" | "NOTE_CREATED" | "NOTE_UPDATED" | "PROFILE_UPDATED" | "RETURN_CREATED" | "LOYALTY_TRANSACTION"; eventId: number; occurredAt: number; orderNumber: string | null; channel: string | null; actor: string | null; fromStatus: string | null; toStatus: string | null; returnNumber?: string | null; returnStatus?: string | null; loyaltyType?: string | null; points?: number | null };

const title = (event: CrmTimelineEvent) => {
  switch (event.kind) {
    case "CUSTOMER_CREATED": return "Müşteri kartı oluşturuldu";
    case "ORDER_CREATED": return `Sipariş oluşturuldu · ${event.orderNumber}`;
    case "ORDER_STATUS": return `Sipariş durumu değişti · ${event.orderNumber}: ${event.fromStatus} → ${event.toStatus}`;
    case "RETURN_CREATED": return `İade kaydı oluşturuldu · ${event.returnNumber} · Sipariş ${event.orderNumber} · Güncel durum: ${event.returnStatus}`;
    case "LOYALTY_TRANSACTION": return `Sadakat puan hareketi · ${event.loyaltyType} · ${event.points} puan${event.orderNumber ? ` · Sipariş ${event.orderNumber}` : ""}`;
    case "NOTE_CREATED": return "Müşteri notu eklendi";
    case "NOTE_UPDATED": return "Müşteri notu düzenlendi";
    case "PROFILE_UPDATED": return "Müşteri kartı güncellendi";
  }
};

export function CrmTimeline({ events }: { events: CrmTimelineEvent[] }) {
  return <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"><h4 className="font-bold text-stone-900">Hareketler</h4><p className="text-xs text-stone-500 mt-1">Kart, bağlı siparişler ve durum değişiklikleri, iade kayıtları, sadakat puan hareketleri, CRM notları ve kart güncellemeleri. İadede gösterilen durum günceldir; oluşturulduğu andaki durum veya ödeme sağlayıcısı iadesi değildir. Puan hareketi tutarı mevcut bakiyedeki değişimi garantilemez. Misafir siparişleri ve kaydedilmemiş hareketler gösterilmez.</p>{events.length ? <ol className="mt-3 divide-y divide-stone-100">{events.map(event => <li key={`${event.kind}-${event.eventId}`} className="py-3 flex gap-3"><span aria-hidden="true" className="mt-1 w-2 h-2 shrink-0 bg-amber-700 rounded-full"/><div><p className="text-sm font-semibold text-stone-800">{title(event)}</p><p className="text-xs text-stone-500 mt-1">{new Date(event.occurredAt * 1000).toLocaleString("tr-TR")}{event.channel ? ` · Kanal: ${event.channel}` : ""}{event.actor ? ` · ${event.actor}` : ""}</p></div></li>)}</ol> : <p className="text-xs text-stone-500 mt-3">Seçili filtrelere uygun kayıtlı hareket bulunamadı. Filtreleri temizleyerek tekrar kontrol edebilirsiniz.</p>}</section>;
}
