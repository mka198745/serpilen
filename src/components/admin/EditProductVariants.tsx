"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { authFetch } from "@/lib/client-auth";
import type { VariantEditPreview, VariantEditRow } from "@/lib/edit-product-variants";

type Draft=Omit<VariantEditRow,'physicalQty'> & {physicalQty:string};
export function EditProductVariants({productId,selectedVariantId,onSaved,onDirtyChange,onBusyChange}:{productId:number;selectedVariantId?:number;onSaved:()=>Promise<void>;onDirtyChange:(dirty:boolean)=>void;onBusyChange:(busy:boolean)=>void}) {
 const [preview,setPreview]=useState<VariantEditPreview|null>(null),[rows,setRows]=useState<Draft[]>([]),[dirty,setDirty]=useState(false),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const request=useRef(0),lock=useRef(false);
 const setDirtyState=(value:boolean)=>{setDirty(value);onDirtyChange(value);};
 const load=useCallback(async (warehouseId?:number)=>{
  const seq=++request.current;setBusy(true);onBusyChange(true);setMessage('');
  try {const res=await authFetch(`/api/product-variant-edit?id=${productId}${warehouseId?`&warehouseId=${warehouseId}`:''}`,{cache:'no-store'});const data=await res.json();if(seq!==request.current)return;if(!res.ok||!data.success){setPreview(null);setMessage(data.error||'Varyantlar yüklenemedi.');return;}
   const p=data.data as VariantEditPreview;setPreview(p);setRows(p.variants.map(v=>({...v,physicalQty:String(v.physicalQty)})));setDirtyState(false);setConfirmed(false);
  }catch{if(seq===request.current){setPreview(null);setMessage('Varyantlar yüklenemedi. Yeniden deneyin.');}}finally{if(seq===request.current){setBusy(false);onBusyChange(false);}}
 // Parent callbacks are stable React setters; productId determines the initial load.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[productId]);
 // Initial network synchronization; load manages busy and stale requests.
 // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
 useEffect(()=>{void load();return()=>{request.current++;};},[load]);
 const update=(i:number,key:keyof Draft,value:string)=>{setRows(old=>old.map((r,j)=>j===i?{...r,[key]:value}:r));setDirtyState(true);setConfirmed(false);setMessage('');};
 const changedStock=!!preview&&rows.some((v,i)=>v.physicalQty!==String(preview.variants[i].physicalQty));
 const save=async()=>{
  if(lock.current||!preview||!preview.warehouseId||(selectedVariantId!==undefined&&!rows.some(r=>r.id===selectedVariantId)))return;
  if(rows.filter(r=>selectedVariantId===undefined||r.id===selectedVariantId).some(r=>!/^(0|[1-9]\d*)$/.test(r.physicalQty)||!Number.isSafeInteger(Number(r.physicalQty))||Number(r.physicalQty)>100000000)){setMessage('Fiili stok miktarını sıfır veya pozitif tam sayı olarak girin.');return;}
  if(changedStock&&!confirmed){setMessage('Önce fiziksel stok kontrolünü onaylayın.');return;}
  lock.current=true;setBusy(true);onBusyChange(true);setMessage('');
  try {const variants=rows.filter(r=>selectedVariantId===undefined||r.id===selectedVariantId).map(({id,colorName,colorHex,size,length,buyPrice,retailPrice,sku,barcode,imageUrl,physicalQty})=>({id,colorName,colorHex,size,length,buyPrice,retailPrice,sku,barcode,imageUrl,physicalQty:Number(physicalQty)}));
   const res=await authFetch('/api/product-variant-edit',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({productId,warehouseId:preview.warehouseId,fingerprint:preview.fingerprint,physicalConfirmed:confirmed,variants,...(selectedVariantId===undefined?{}:{variantId:selectedVariantId})})});const data=await res.json();
   if(!res.ok||!data.success){setMessage(data.error||'Varyantlar kaydedilemedi.');return;}
   setDirtyState(false);await onSaved().catch(()=>{});await load(preview.warehouseId);setMessage(`${selectedVariantId===undefined?"Varyantlar":"Varyant"} kaydedildi.${data.data.promoted?` ${data.data.promoted} bekleyen siparişe stok ayrıldı.`:''} Ürün ana bilgileri ayrı kaydedilir.`);
  }catch{setMessage('Bağlantı kesildi; kayıt sonucu doğrulanamadı. Yeniden yükleyip kontrol edin.');}
  finally{lock.current=false;setBusy(false);onBusyChange(false);}
 };
 const fields:[keyof Draft,string,number][]=[['colorName','Renk adı',100],['colorHex','Renk kodu (#RRGGBB)',7],['size','Beden / ölçü',100],['length','Uzunluk',100],['sku','SKU',40],['barcode','Barkod',80],['buyPrice','Alış fiyatı (boş olabilir)',20],['retailPrice','Perakende fiyatı',20],['imageUrl','Görsel HTTPS bağlantısı',2048]];
 return <section className="border-t border-stone-200 pt-4 space-y-3 text-xs" aria-label="Varyant düzenleme">
  <h4 className="font-black text-sm">{selectedVariantId===undefined?"Mevcut varyantlar ve depo stokları":"Seçilen varyant ve depo stoğu"}</h4>
  <p>Varyant bilgileri tüm depolarda geçerlidir; stok yalnız seçili depoda değişir. Varyantları aşağıdaki ayrı düğmeyle kaydedin. Ürün ana bilgileri ürün düzenleme ekranında ayrıca kaydedilir.</p>
  {message&&<p role="status" className="p-2 bg-amber-50 text-amber-950 rounded-lg">{message}</p>}
  {!preview&&<button type="button" disabled={busy} onClick={()=>void load()} className="underline font-bold">{busy?'Yükleniyor…':'Varyantları yeniden yükle'}</button>}
  {preview&&<>
   <label className="block font-bold">Stok düzenlenecek depo
    <select disabled={busy} value={preview.warehouseId??''} onChange={e=>{if(dirty&&!window.confirm('Kaydedilmemiş varyant değişiklikleri silinecek. Depo değiştirilsin mi?'))return;void load(Number(e.target.value));}} className="block w-full mt-1 p-2 border rounded-xl"><option value="" disabled>Depo seçin</option>{preview.warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select>
   </label>
   {!preview.warehouseId&&<p>Ortak satış deposu seçilmemiş; düzenlemek için aktif bir depo seçin.</p>}
   {selectedVariantId!==undefined&&!rows.some(r=>r.id===selectedVariantId)&&<p role="alert">Seçilen varyant bulunamadı. Listeyi yenileyin.</p>}
   {rows.map((row,i)=>({row,i})).filter(({row})=>selectedVariantId===undefined||row.id===selectedVariantId).map(({row,i})=><fieldset key={row.id} disabled={busy||!preview.warehouseId} className={`border rounded-xl p-3 space-y-2 ${selectedVariantId===row.id?"border-amber-600 bg-amber-50":"border-stone-200"}`}><legend className="font-bold">{selectedVariantId===row.id?"Seçilen varyant ":"Varyant "}{i+1}{!row.isActive?' (pasif)':''}</legend>
    <div className="grid grid-cols-2 gap-2">{fields.map(([key,label,max])=><label key={key} className={key==='imageUrl'?'col-span-2 font-semibold':'font-semibold'}>{label}<input maxLength={max} value={String(row[key]??'')} onChange={e=>update(i,key,e.target.value)} className="block w-full mt-1 p-2 border border-stone-300 rounded-lg font-normal" /></label>)}</div>
    <p>Mevcut fiili: <strong>{preview.variants[i].physicalQty}</strong> · Ayrılmış: <strong>{row.reservedQty}</strong> · Kullanılabilir: <strong>{row.availableQty}</strong></p>
    <label className="block font-bold">Yeni fiili stok (toplam fiziksel miktar, ekleme miktarı değil)<input type="number" min="0" max="100000000" step="1" value={row.physicalQty} onChange={e=>update(i,'physicalQty',e.target.value)} className="block w-full mt-1 p-2 border border-stone-300 rounded-lg font-normal" /></label>
   </fieldset>)}
   {changedStock&&<label className="flex gap-2 items-start"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} disabled={busy} />Seçili depodaki fiziksel miktarları kontrol ettim; girilen değerlerin toplam fiili stok olduğunu ve ayrılmış stoktan az olamayacağını doğruluyorum.</label>}
   <button type="button" disabled={busy||!preview.warehouseId||!dirty||(selectedVariantId!==undefined&&!rows.some(r=>r.id===selectedVariantId))} onClick={()=>void save()} className="w-full py-3 bg-stone-800 text-white font-bold rounded-xl disabled:opacity-50">{busy?'İşleniyor…':selectedVariantId===undefined?'Varyantları ve seçili depo stoklarını kaydet':'Varyantı ve seçili depo stoğunu kaydet'}</button>
  </>}
 </section>;
}
