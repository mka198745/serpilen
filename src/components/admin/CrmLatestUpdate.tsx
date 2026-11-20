"use client";

import React from "react";

/** Her CRM tesliminde içeriği gerçek özellik ve paneldeki konumuyla güncelleyin. */
export function CrmLatestUpdate() {
  return <section aria-label="Son CRM geliştirmesi" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
    <h3 className="font-bold">Son geliştirme · Müşteri notu düzenleme</h3>
    <p className="mt-1 text-xs leading-relaxed"><strong>Nerede?</strong> Müşteri CRM 360 → Profili aç → Müşteri notları → Düzenle. Değiştirme yetkisi olan personel notu güncelleyebilir; eşzamanlı değişiklik varsa taslak korunur ve yenileme istenir. Son düzenleyen gösterilir, işlem metin içermeden denetlenir. Silme ve eski metin sürümlerini geri getirme yoktur.</p>
  </section>;
}
