"use client";

import React from "react";

/** Her CRM tesliminde içeriği gerçek özellik ve paneldeki konumuyla güncelleyin. */
export function CrmLatestUpdate() {
  return <section aria-label="Son CRM geliştirmesi" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
    <h3 className="font-bold">Son geliştirme · Sipariş bilgilerinde yetki sınırı</h3>
    <p className="mt-1 text-xs leading-relaxed"><strong>Nerede?</strong> Yönetim → Siparişler ve ana sayfadaki son siparişler; yetkiler Yönetim → Rol Matrisi. <strong>Ne değişti?</strong> Sipariş yetkisi olmayan personele toplu liste ve yönetim sayfasındaki sipariş ayrıntıları gönderilmez. POS yetkisi varsa iade aramasında yalnız gerekli alanlar gösterilir. Diğer eski API’ler ve kayıt bazlı CRM yetkileri bu çalışmanın dışındadır.</p>
  </section>;
}
