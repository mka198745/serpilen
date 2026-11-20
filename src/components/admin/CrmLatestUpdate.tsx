"use client";

import React from "react";

/** Her CRM tesliminde içeriği gerçek özellik ve paneldeki konumuyla güncelleyin. */
export function CrmLatestUpdate() {
  return <section aria-label="Son CRM geliştirmesi" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
    <h3 className="font-bold">Son geliştirme · Son ödenmiş sipariş tarihi</h3>
    <p className="mt-1 text-xs leading-relaxed"><strong>Nerede?</strong> Müşteri CRM 360 → Şehir ve müşteri kayıt tarihi → Son ödenmiş sipariş tarihi. Seçili aralığa son uygun siparişinin oluşturulma günü düşen müşteri kartları listelenir. Tarih UTC’dir, ödeme zamanı değildir; misafir siparişleri ve iptal/iade durumları dahil edilmez.</p>
  </section>;
}
