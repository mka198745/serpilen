"use client";

import React from "react";

export type CrmTimelineEvent = { kind: "CUSTOMER_CREATED" | "ORDER_CREATED" | "ORDER_STATUS" | "NOTE_CREATED" | "PROFILE_UPDATED"; eventId: number; occurredAt: number; orderNumber: string | null; channel: string | null; actor: string | null; fromStatus: string | null; toStatus: string | null };

const title = (event: CrmTimelineEvent) => {
  switch (event.kind) {
    case "CUSTOMER_CREATED": return "Müşteri kartı oluşturuldu";
    case "ORDER_CREATED": return `Sipariş oluşturuldu · ${event.orderNumber}`;
    case "ORDER_STATUS": return `Sipariş durumu değişti · ${event.orderNumber}: ${event.fromStatus} → ${event.toStatus}`;
    case "NOTE_CREATED": return "Müşteri notu eklendi";
    case "PROFILE_UPDATED": return "Müşteri kartı güncellendi";
  }
};

export function CrmTimeline({ events }: { events: CrmTimelineEvent[] }) {
  return <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"><h3 className="font-bold text-stone-900">Müşteri zaman çizelgesi</h3><p className="text-xs text-stone-500 mt-1">Kart, bağlı sipariş ve durum değişiklikleri, CRM notları ve kart güncellemeleri. Geçmişte kaydedilmemiş hareketler veya misafir siparişleri gösterilmez.</p>{events.length ? <ol className="mt-3 divide-y divide-stone-100">{events.map(event => <li key={`${event.kind}-${event.eventId}`} className="py-3 flex gap-3"><span aria-hidden="true" className="mt-1 w-2 h-2 shrink-0 bg-amber-700 rounded-full"/><div><p className="text-sm font-semibold text-stone-800">{title(event)}</p><p className="text-xs text-stone-500 mt-1">{new Date(event.occurredAt * 1000).toLocaleString("tr-TR")}{event.channel ? ` · Kanal: ${event.channel}` : ""}{event.actor ? ` · ${event.actor}` : ""}</p></div></li>)}</ol> : <p className="text-xs text-stone-500 mt-3">Kayıtlı hareket bulunamadı.</p>}</section>;
}
