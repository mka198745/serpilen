"use client";

import { useEffect } from "react";

/**
 * URL'den tek kullanımlık ?kt= jetonunu adres çubuğundan/geçmişten temizler.
 * (Korumalı sayfa jetonu sunucuda tüketmeden görür; tarayıcı geçmişinde
 * ve referer başlıklarında kalıcı olmasın diye istemci açılışında silinir.)
 */
export function StripQueryParam({ name }: { name: string }) {
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has(name)) {
        url.searchParams.delete(name);
        window.history.replaceState(
          null,
          "",
          url.pathname + (url.search || "") + url.hash
        );
      }
    } catch {
      /* yoksay */
    }
  }, [name]);
  return null;
}
