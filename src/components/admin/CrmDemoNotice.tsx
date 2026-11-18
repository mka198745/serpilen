"use client";

import React from "react";

/** Yalnız bu ortamdaki özel demo kartı yüklendiğinde gösterilir; gerçek ödeme değildir. */
export const isCrmPreviewDemo = (customer: { email: string | null; name: string }) => customer.email === "crm.demo.onizleme@example.test" && customer.name.startsWith("[DEMO CRM]");

export function CrmDemoNotice() {
  return <section aria-label="CRM demo verileri" className="rounded-2xl border border-sky-300 bg-sky-50 p-4 text-sm text-sky-950">
    <h3 className="font-bold">CRM test verileri · Yalnız bu ortam</h3>
    <p className="mt-1 text-xs leading-relaxed">[DEMO CRM] Deniz Örnek profilini açarak siparişleri, iade ve sadakat hareketlerini, etiketleri, sayfalı notları ve yinelenen kart ön incelemesini deneyin. DEMO-CRM siparişleri gerçek ödeme, kargo veya stok hareketi değildir; bu ortamın özet ve raporlarına örnek tutar olarak yansıyabilir.</p>
  </section>;
}
