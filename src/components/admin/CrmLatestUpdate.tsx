"use client";

import React from "react";

/** Her CRM tesliminde içeriği gerçek özellik ve paneldeki konumuyla güncelleyin. */
export function CrmLatestUpdate() {
  return <section aria-label="Son CRM geliştirmesi" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
    <h3 className="font-bold">Son geliştirme · Şehir ve kayıt tarihiyle filtreleme</h3>
    <p className="mt-1 text-xs leading-relaxed"><strong>Nerede?</strong> Müşteri CRM 360 ana listesindeki <strong>Şehir ve müşteri kayıt tarihi</strong> alanı. <strong>Ne değişti?</strong> Şehir ve kayıt tarihi aralığı diğer müşteri filtreleriyle birlikte uygulanır. Şehir tam yazımla eşleşir; tarih aralığı UTC günlerine göredir.</p>
  </section>;
}
