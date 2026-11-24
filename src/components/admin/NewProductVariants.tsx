"use client";

import React from "react";

export type VariantDraft = { colorName: string; colorHex: string; size: string; length: string; sku: string; barcode: string; imageUrl: string; previewImageUrl?: string; imported?: boolean; buyPrice: string; retailPrice: string; initialStock: string };
function httpsImageLink(value: string): string {
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.href : ""; }
  catch { return ""; }
}
// Only server-validated imported addresses may be loaded automatically in the browser.
function importedPreviewUrl(row: VariantDraft): string {
  if (!row.imported || !row.imageUrl || row.imageUrl !== row.previewImageUrl) return "";
  try {
    const url = new URL(row.imageUrl), host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (url.protocol !== "https:" || url.username || url.password || url.port || !host.includes(".") || host.startsWith("[") || /^\d+\.\d+\.\d+\.\d+$/.test(host) || /(?:^|\.)(?:localhost|local|internal)$/.test(host)) return "";
    return url.href;
  } catch { return ""; }
}
function VariantPreview({ src, label }: { src: string; label: string }) {
  const [failed, setFailed] = React.useState(false);
  if (!src || failed) return <span className="w-14 h-14 rounded-lg bg-stone-100 flex items-center justify-center text-[10px] text-stone-500 text-center shrink-0">{failed ? "Görsel yüklenemedi" : "Önizleme yok"}</span>;
  // External URLs are provided by the import API after its HTTPS and public-DNS checks.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={`${label} varyant görseli`} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="w-14 h-14 rounded-lg border border-stone-200 object-cover shrink-0" />;
}

const emptyVariant = (): VariantDraft => ({ colorName: "", colorHex: "", size: "", length: "", sku: "", barcode: "", imageUrl: "", buyPrice: "", retailPrice: "", initialStock: "0" });

export function NewProductVariants({ value, onChange, disabled, productName }: { value: VariantDraft[]; onChange: (value: VariantDraft[]) => void; disabled: boolean; productName: string }) {
  const update = (index: number, patch: Partial<VariantDraft>) => onChange(value.map((row, i) => i === index ? { ...row, ...patch } : row));
  return <fieldset className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 space-y-3" disabled={disabled}>
    <legend className="px-1 text-sm font-bold text-stone-900">Varyantlar</legend>
    <p className="text-stone-600 leading-relaxed">İsteğe bağlı renk, ölçü veya uzunluk seçenekleri ekleyin. Her varyantın stoğu seçilen giriş deposuna kaydedilir; varyantlı ürünlerde ana ürün başlangıç stoğu kullanılmaz.</p>
    {value.some(row => row.imported) && <p className="text-stone-600">Kaynak renk adı yerine yalnızca kod sunuyorsa kod gösterilir; gerekirse düzenleyin. Görseller dış siteden yüklenir ve erişilemiyorsa önizleme görünmez.</p>}
    {value.map((row, index) => <div key={index} className="rounded-xl border border-amber-200 bg-white p-3 space-y-2">
      <div className="flex items-center gap-3">
        <VariantPreview key={importedPreviewUrl(row) || "no-preview"} src={importedPreviewUrl(row)} label={[productName, row.colorName, row.size, row.length].filter(Boolean).join(" · ") || `Varyant ${index + 1}`} />
        <div className="min-w-0 flex-1"><strong className="block break-words">{[productName, row.colorName, row.size, row.length].filter(Boolean).join(" · ") || `Varyant ${index + 1}`}</strong><span className="text-stone-500">Varyant {index + 1}{row.imported && !row.imageUrl ? " · Görsel aktarılmadı" : ""}</span></div>
        <button type="button" onClick={() => onChange(value.filter((_, i) => i !== index))} aria-label={`Varyant ${index + 1} kaldır`} className="text-rose-700 font-bold underline shrink-0">Kaldır</button>
      </div>
      <details open={!row.imported || undefined}>
        <summary className="cursor-pointer font-semibold text-amber-900">{row.colorName || row.size || row.length || "Bilgileri düzenle"} · Bilgileri düzenle</summary>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
        <label className="font-semibold">Renk adı<input maxLength={100} value={row.colorName} onChange={e => update(index, { colorName: e.target.value })} placeholder="Siyah" className="mt-1 w-full px-3 py-2 border border-stone-300 rounded-xl font-normal" /></label>
        <label className="font-semibold">Renk kodu (isteğe bağlı)<div className="flex items-center gap-2 mt-1"><input type="color" aria-label={`Varyant ${index + 1} renk seçimi`} value={row.colorHex || "#111827"} onChange={e => update(index, { colorHex: e.target.value })} className="h-9 w-12 border border-stone-300 rounded-lg" /><input aria-label={`Varyant ${index + 1} renk kodu`} placeholder="#111827" maxLength={7} pattern="#[0-9a-fA-F]{6}" value={row.colorHex} onChange={e => update(index, { colorHex: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-xl font-normal" /></div></label>
        <label className="font-semibold">Ölçü<input maxLength={100} value={row.size} onChange={e => update(index, { size: e.target.value })} placeholder="20 mm / 50 cm" className="mt-1 w-full px-3 py-2 border border-stone-300 rounded-xl font-normal" /></label>
        <label className="font-semibold">Uzunluk<input maxLength={100} value={row.length} onChange={e => update(index, { length: e.target.value })} placeholder="100m" className="mt-1 w-full px-3 py-2 border border-stone-300 rounded-xl font-normal" /></label>
        <label className="font-semibold">Varyant SKU (isteğe bağlı)<input maxLength={40} value={row.sku} onChange={e => update(index, { sku: e.target.value })} placeholder="Otomatik oluşturulur" className="mt-1 w-full px-3 py-2 border border-stone-300 rounded-xl font-normal" /></label>
        <label className="font-semibold">Varyant barkodu (isteğe bağlı)<input maxLength={80} value={row.barcode} onChange={e => update(index, { barcode: e.target.value })} placeholder="Boş bırakılabilir" className="mt-1 w-full px-3 py-2 border border-stone-300 rounded-xl font-normal" /></label>
        <label className="font-semibold">Alış fiyatı (TL)<input type="number" min="0" step="0.01" value={row.buyPrice} onChange={e => update(index, { buyPrice: e.target.value })} placeholder="Ürün fiyatı" className="mt-1 w-full px-3 py-2 border border-stone-300 rounded-xl font-normal" /></label>
        <label className="font-semibold">Satış fiyatı (TL)<input type="number" min="0" step="0.01" value={row.retailPrice} onChange={e => update(index, { retailPrice: e.target.value })} placeholder="Ürün fiyatı" className="mt-1 w-full px-3 py-2 border border-stone-300 rounded-xl font-normal" /></label>
        <label className="font-semibold">Başlangıç stoğu<input type="number" required min="0" step="1" max="100000000" value={row.initialStock} onChange={e => update(index, { initialStock: e.target.value })} className="mt-1 w-full px-3 py-2 border border-stone-300 rounded-xl font-normal" /></label>
      </div>
      <label className="block font-semibold mt-2">Varyant fotoğraf bağlantısı (HTTPS, isteğe bağlı)<input type="url" maxLength={2048} value={row.imageUrl} onChange={e => update(index, { imageUrl: e.target.value, previewImageUrl: "" })} placeholder="https://..." className="mt-1 w-full px-3 py-2 border border-stone-300 rounded-xl font-normal" /></label>
      {httpsImageLink(row.imageUrl) && <a href={httpsImageLink(row.imageUrl)} target="_blank" rel="noopener noreferrer" className="block mt-1 text-amber-800 underline">Varyant fotoğrafını kontrol et ↗</a>}
      <p className="text-stone-500 mt-2">Renk adı, ölçü veya uzunluktan en az birini girin. Boş fiyatlar ürün fiyatını kullanır; boş barkod üretilmez.</p>
      </details>
    </div>)}
    <button type="button" onClick={() => onChange([...value, emptyVariant()])} disabled={value.length >= 50} className="px-3 py-2 border border-amber-700 text-amber-900 font-bold rounded-xl disabled:opacity-50">+ Varyant Ekle</button>
    {value.length === 50 && <p>En fazla 50 varyant eklenebilir.</p>}
  </fieldset>;
}
