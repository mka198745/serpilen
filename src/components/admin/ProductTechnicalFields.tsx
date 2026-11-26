"use client";

import React from "react";
import { PRODUCT_SPECIFICATION_FIELDS, type ProductSpecifications } from "@/lib/product-specifications";

export function ProductTechnicalFields({ value, onChange }: { value: ProductSpecifications; onChange: (value: ProductSpecifications) => void }) {
  return <fieldset className="space-y-2 rounded-xl border border-stone-200 bg-stone-50 p-3">
    <legend className="px-1 text-xs font-bold text-stone-800">Teknik özellikler</legend>
    <p className="text-[11px] text-stone-600">İsteğe bağlıdır. Doldurulan bilgiler ürünle kaydedilir ve ürün sayfasında gösterilir.</p>
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {PRODUCT_SPECIFICATION_FIELDS.map(field => <label key={field.key} className="block text-xs font-bold text-stone-700">
        <span className="mb-1 block">{field.label}</span>
        <input type="text" maxLength={300} value={value[field.key] || ""} onChange={event => onChange({ ...value, [field.key]: event.target.value })} className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 font-normal" />
      </label>)}
    </div>
  </fieldset>;
}
