"use client";

import React from "react";

/** Her CRM tesliminde içeriği gerçek özellik ve paneldeki konumuyla güncelleyin. */
export function CrmLatestUpdate() {
  return <section aria-label="Son CRM geliştirmesi" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
    <h3 className="font-bold">Son geliştirme · Hesap yönetimi yetki sınırı</h3>
    <p className="mt-1 text-xs leading-relaxed"><strong>Nerede?</strong> Yönetim → Kullanıcılar &amp; Roller ve Kayıtlı Müşteriler. <strong>Ne değişti?</strong> Hesap listeleri ayrı modül izinleriyle korunur; personel oluşturma ve değişiklikleri yalnız Süper Admin yapabilir. Müşteri üyeliği yönetimi ilgili modül iznine bağlıdır. Bu, kayıt bazlı CRM yetkisi veya diğer API ve panel yüzeylerinde genel kişisel veri izolasyonu değildir.</p>
  </section>;
}
