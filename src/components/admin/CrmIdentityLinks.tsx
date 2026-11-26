"use client";

import React from "react";

export type CrmIdentityLinksData = {
  activeWebAccounts: number;
  inactiveWebAccounts: number;
  unknownWebAccounts: number;
  otherRoleAccounts: number;
  onlineOrders: number;
  posOrders: number;
  otherOrders: number;
};

/** Counts of existing direct relationships only; no identity matching or linking action. */
export function CrmIdentityLinks({ links }: { links?: CrmIdentityLinksData }) {
  return <section aria-label="Müşteri kimliği ve bağlantılar" className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm space-y-3">
    <div><h3 className="font-bold text-stone-900">Kimlik ve kanal bağlantıları</h3><p className="text-xs text-stone-500 mt-1">Bu karta doğrudan bağlı mevcut kayıtların anlık sayılarıdır; hesap ve siparişler değiştirilmez.</p></div>
    {links ? <>
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
        {([
          ["Aktif web üyeliği", links.activeWebAccounts], ["Pasif web üyeliği", links.inactiveWebAccounts],
          ["Durumu belirsiz web üyeliği", links.unknownWebAccounts], ["Diğer rollü hesap bağlantısı", links.otherRoleAccounts],
          ["Online sipariş", links.onlineOrders], ["POS siparişi", links.posOrders], ["Diğer kanal siparişi", links.otherOrders],
        ] as const).map(([label, count]) => <div key={label} className="rounded-xl bg-stone-50 p-2"><dt className="text-stone-500">{label}</dt><dd className="font-bold text-stone-900">{count}</dd></div>)}
      </dl>
      {(links.activeWebAccounts + links.inactiveWebAccounts + links.unknownWebAccounts > 1 || links.otherRoleAccounts > 0 || links.unknownWebAccounts > 0) && <p className="rounded-xl border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">Birden fazla üyelik, farklı rol veya belirsiz durum bağlantısı olabilir; yetkili personel ayrıca incelemelidir. Bu durum tek başına hata veya aynı kişi kanıtı değildir.</p>}
      <p className="text-xs leading-relaxed text-stone-500">Üyelik sayıları yalnızca bu karta bağlı B2C hesaplarını aktiflik durumuna göre sayar; diğer rol bağlantıları yalnız adet olarak gösterilir. Sipariş sayıları ödeme ve durum ayrımı yapmaz. Bağlantısız hesaplar ve misafir siparişleri dahil değildir; sıfır sonuç bunların bulunmadığını kanıtlamaz.</p>
    </> : <p role="status" className="text-xs text-amber-800">Bağlantı sayıları alınamadı; sayfayı yenileyip tekrar deneyin.</p>}
  </section>;
}
