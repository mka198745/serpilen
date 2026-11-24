"use client";

import React from "react";

export type VariantDraft = { colorName: string; colorHex: string; size: string; length: string; sku: string; barcode: string; imageUrl: string; imported?: boolean; buyPrice: string; retailPrice: string; initialStock: string };
function httpsImageLink(value: string): string {
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.href : ""; }
  catch { return ""; }
}
const emptyVariant = (): VariantDraft => ({ colorName: "", colorHex: "", size: "", length: "", sku: "", barcode: "", imageUrl: "", buyPrice: "", retailPrice: "", initialStock: "0" });

export function NewProductVariants({ value, onChange, disabled }: { value: VariantDraft[]; onChange: (value: VariantDraft[]) => void; disabled: boolean }) {
  const update = (index: number, patch: Partial<VariantDraft>) => onChange(value.map((row, i) => i === index ? { ...row, ...patch } : row));
  return <fieldset className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 space-y-3" disabled={disabled}>
    <legend className="px-1 text-sm font-bold text-stone-900">Varyantlar</legend>
    <p className="text-stone-600 leading-relaxed">İsteğe bağlı renk, ölçü veya uzunluk seçenekleri ekleyin. Her varyantın stoğu seçilen giriş deposuna kaydedilir; varyantlı ürünlerde ana ürün başlangıç stoğu kullanılmaz.</p>
    {value.map((row, index) => <div key={index} className="rounded-xl border border-amber-200 bg-white p-3 space-y-2">
      <div className="flex justify-between items-center"><strong>Varyant {index + 1}</strong><button type="button" onClick={() => onChange(value.filter((_, i) => i !== index))} aria-label={`Varyant ${index + 1} kaldır`} className="text-rose-700 font-bold underline">Kaldır</button></div>
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
      <label className="block font-semibold mt-2">Varyant fotoğraf bağlantısı (HTTPS, isteğe bağlı)<input type="url" maxLength={2048} value={row.imageUrl} onChange={e => update(index, { imageUrl: e.target.value })} placeholder="https://..." className="mt-1 w-full px-3 py-2 border border-stone-300 rounded-xl font-normal" /></label>
      {httpsImageLink(row.imageUrl) && <a href={httpsImageLink(row.imageUrl)} target="_blank" rel="noopener noreferrer" className="block mt-1 text-amber-800 underline">Varyant fotoğrafını kontrol et ↗</a>}
      <p className="text-stone-500 mt-2">Renk adı, ölçü veya uzunluktan en az birini girin. Boş fiyatlar ürün fiyatını kullanır; boş barkod üretilmez.</p>
      </details>
    </div>)}
    <button type="button" onClick={() => onChange([...value, emptyVariant()])} disabled={value.length >= 50} className="px-3 py-2 border border-amber-700 text-amber-900 font-bold rounded-xl disabled:opacity-50">+ Varyant Ekle</button>
    {value.length === 50 && <p>En fazla 50 varyant eklenebilir.</p>}
  </fieldset>;
}
