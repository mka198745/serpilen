"use client";

import React, { useEffect, useRef, useState } from "react";
import { authFetch } from "@/lib/client-auth";
import type { ImportedProduct } from "@/lib/product-import/extract";
import { validateProductSpecifications } from "@/lib/product-specifications";

function unexpectedResponseMessage(response: Response): string {
  if (response.status === 401 || response.redirected) return "Oturum doğrulanamadı. Yeniden giriş yapıp tekrar deneyin.";
  if (response.status === 403) return "İstek reddedildi. Katalog yetkinizi ve oturumunuzu kontrol edin.";
  if (response.status === 404 || response.status === 405) return "Ürün getirme servisi bu sunucuda bulunamadı. Uygulamanın güncel sürümünü kontrol edin.";
  return `Ürün getirme servisi beklenmeyen bir yanıt döndürdü (HTTP ${response.status}). Daha sonra tekrar deneyin.`;
}

function isImportedProduct(value: unknown): value is ImportedProduct {
  if (!value || typeof value !== "object") return false;
  const product = value as Record<string, unknown>;
  try { if (product.technicalDetails !== undefined) validateProductSpecifications(product.technicalDetails); } catch { return false; }
  return ["name", "description", "sku", "barcode", "brand", "category"].every(key => typeof product[key] === "string") &&
    Array.isArray(product.images) && product.images.every((item: unknown) => typeof item === "string") &&
    Array.isArray(product.warnings) && product.warnings.every((item: unknown) => typeof item === "string");
}

/** Hide the control until the server confirms the current account has both required permissions. */
export function AuthorizedProductLinkImport({ onImport }: { onImport: (product: ImportedProduct) => string[] }) {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    let active = true;
    let request: AbortController | null = null;
    let sequence = 0;
    const refresh = async () => {
      request?.abort();
      const abort = new AbortController();
      request = abort;
      const current = ++sequence;
      try {
        const response = await authFetch("/api/products/import", { cache: "no-store", signal: abort.signal });
        const data = await response.json();
        if (active && !abort.signal.aborted && current === sequence) setAllowed(response.ok && data?.success === true && data.allowed === true);
      } catch {
        if (active && !abort.signal.aborted && current === sequence) setAllowed(false);
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => { active = false; ++sequence; request?.abort(); window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, []);
  return allowed ? <ProductLinkImport onImport={onImport} /> : null;
}

export function ProductLinkImport({ onImport }: { onImport: (product: ImportedProduct) => string[] }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function fetchProduct() {
    if (busy) return;
    const value = url.trim();
    if (!value) { setError("Ürün bağlantısını girin."); return; }
    setBusy(true); setError(""); setMessage("");
    const abort = new AbortController(); controller.current = abort;
    try {
      const response = await authFetch("/api/products/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: value }), signal: abort.signal });
      // Proxies, stale deployments and login redirects may return HTML rather than our API JSON.
      if (!/^application\/(?:[\w.+-]*\+)?json(?:\s*;|\s*$)/i.test(response.headers.get("content-type") || "")) throw new Error(unexpectedResponseMessage(response));
      let data: unknown;
      try { data = await response.json(); } catch { throw new Error(unexpectedResponseMessage(response)); }
      if (!data || typeof data !== "object") throw new Error(unexpectedResponseMessage(response));
      const result = data as Record<string, unknown>;
      if (!response.ok || result.success !== true) {
        const apiError = result.error;
        const message = typeof apiError === "string" ? apiError : apiError && typeof apiError === "object" && typeof (apiError as Record<string, unknown>).message === "string" ? (apiError as Record<string, string>).message : unexpectedResponseMessage(response);
        throw new Error(message);
      }
      if (!isImportedProduct(result.data)) throw new Error(unexpectedResponseMessage(response));
      if (abort.signal.aborted) return;
      const warning = [...result.data.warnings, ...onImport(result.data)].join(" ");
      setMessage(`Bilgiler forma aktarıldı. ${warning} Ürünü kaydetmeden önce tüm alanları kontrol edin.`);
    } catch (err) { if (!abort.signal.aborted) setError(err instanceof Error ? err.message : "Ürün bilgileri getirilemedi."); }
    finally { if (!abort.signal.aborted) { setBusy(false); controller.current = null; } }
  }
  return <section aria-label="Ürün bağlantısından bilgiler" className="rounded-xl border border-sky-200 bg-sky-50 p-3 space-y-2">
    <label htmlFor="product-source-url" className="block font-bold text-sky-950">Ürün Linki ekle</label>
    <div className="flex gap-2"><input id="product-source-url" type="url" value={url} disabled={busy} onChange={e => setUrl(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void fetchProduct(); } }} placeholder="https://bayi-sitesindeki-urun-adresi" className="min-w-0 flex-1 px-3 py-2 bg-white border border-sky-300 rounded-xl"/><button type="button" disabled={busy} onClick={() => void fetchProduct()} className="px-3 py-2 bg-sky-800 text-white font-bold rounded-xl disabled:opacity-50 whitespace-nowrap">{busy ? "Getiriliyor…" : "Ürünü getir"}</button></div>
    <p className="text-[11px] leading-relaxed text-sky-950">Yalnızca güvendiğiniz ve içerik kullanımına yetkili olduğunuz bayi sitelerini kullanın. Boş alanlar doldurulur; mevcut bilgiler korunur. Marka ve kategori yalnız tam eşleşirse ve elle seçilmediyse atanır. Fotoğraf bağlantıları en fazla 6 adede eklenir, sunucumuza kopyalanmaz. Tarayıcı ve müşteriler görselleri üçüncü taraf sitelerden yükler; bu adresler sonradan değişebilir veya yönlendirebilir. Fiyat, stok ve depo değiştirilmez; formda görünen değerler (varsayılanlar dahil) kaydedilecektir. Tüm bilgileri kaydetmeden önce doğrulayın.</p>
    <p className="text-[11px] text-sky-900">Giriş gerektiren veya bilgileri yalnız JavaScript ile oluşturan siteler desteklenmeyebilir. Siteye sizin adınıza giriş yapılmaz.</p>
    {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}{message && <p role="status" className="text-xs text-emerald-800">{message}</p>}
  </section>;
}
