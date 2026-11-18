"use client";

import React from "react";

/** Her CRM tesliminde içeriği gerçek özellik ve paneldeki konumuyla güncelleyin. */
export function CrmLatestUpdate() {
  return <section aria-label="Son CRM geliştirmesi" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
    <h3 className="font-bold">Son geliştirme · Müşteri notlarında sayfalama</h3>
    <p className="mt-1 text-xs leading-relaxed"><strong>Nerede?</strong> Müşteri listesinden <strong>Profili aç → Müşteri notları</strong>. <strong>Ne değişti?</strong> Önceki ve Sonraki düğmeleriyle 50 kayıttan daha eski notlara da ulaşabilirsiniz. Kayıt bulunmuyorsa örnek not gösterilmez; not düzenleme ve silme henüz yoktur.</p>
  </section>;
}
