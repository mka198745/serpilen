"use client";

import React from "react";

/** Her CRM tesliminde içeriği gerçek özellik ve paneldeki konumuyla güncelleyin. */
export function CrmLatestUpdate() {
  return <section aria-label="Son CRM geliştirmesi" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
    <h3 className="font-bold">Son geliştirme · Denetim kayıtlarında erişim sınırı</h3>
    <p className="mt-1 text-xs leading-relaxed"><strong>Nerede?</strong> Denetim Kaydı ve Rol Yetki Matrisi. Kişisel bilgiler içerebilen kayıtlar yalnız audit yetkisiyle görüntülenir; bu yetki tüm ayrıntıları açar ve yalnız güvenilir personele verilmelidir. İstemciden serbest denetim kaydı yazımı kapatıldı. Eski kayıtların doğruluğu ve değiştirilemezliği garanti edilmez; diğer API’ler ayrıca incelenmelidir.</p>
  </section>;
}
