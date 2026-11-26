"use client";
import React, { useEffect, useState } from "react";
import { authFetch } from "@/lib/client-auth";
export function PosPinSettings() {
 const [configured,setConfigured]=useState<boolean|null>(null),[allowed,setAllowed]=useState(true);
 const [password,setPassword]=useState(''),[pin,setPin]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState<{ok:boolean;text:string}|null>(null);
 useEffect(()=>{let active=true;void authFetch('/api/pos/pin',{cache:'no-store'}).then(async r=>{const d=await r.json();if(!active)return;if(r.status===403){setAllowed(false);return;}if(r.ok&&d.success)setConfigured(!!d.data.configured);else setMessage({ok:false,text:'PIN durumu alınamadı.'});}).catch(()=>{if(active)setMessage({ok:false,text:'PIN durumu alınamadı.'});});return()=>{active=false;};},[]);
 if(!allowed)return null;
 const submit=async(e:React.FormEvent)=>{
  e.preventDefault();setMessage(null);if(!/^\d{6}$/.test(pin)||pin!==confirm){setMessage({ok:false,text:'PIN 6 rakam olmalı ve tekrarı eşleşmelidir.'});return;}
  setBusy(true);try{const r=await authFetch('/api/pos/pin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({currentPassword:password,pin})});const d=await r.json().catch(()=>({}));if(!r.ok||!d.success){setMessage({ok:false,text:d.error||'PIN kaydedilemedi.'});return;}setPassword('');setPin('');setConfirm('');setConfigured(true);setMessage({ok:true,text:'POS ekran PIN’iniz kaydedildi. Açık POS ekranları kilitlenir.'});}catch{setMessage({ok:false,text:'Sunucuya ulaşılamadı.'});}finally{setBusy(false);}
 };
 return <form onSubmit={submit} className="bg-white rounded-2xl border border-stone-200 shadow-xs p-5 space-y-4">
  <h2 className="text-sm font-black text-stone-800 uppercase">POS ekran PIN’i</h2>
  <p className="text-xs text-stone-600">{configured?'PIN’inizi değiştirmek veya sıfırlamak':'POS’a girmek için ilk PIN’inizi belirlemek'} için hesap şifrenizi doğrulayın. PIN hesap şifrenizden farklı 6 rakam olmalıdır.</p>
  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
   <label className="text-xs font-bold">Hesap şifresi<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} className="w-full p-2 border border-stone-300 rounded-xl" /></label>
   <label className="text-xs font-bold">Yeni PIN<input type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{6}" maxLength={6} required value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,6))} className="w-full p-2 border border-stone-300 rounded-xl" /></label>
   <label className="text-xs font-bold">Yeni PIN tekrar<input type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{6}" maxLength={6} required value={confirm} onChange={e=>setConfirm(e.target.value.replace(/\D/g,'').slice(0,6))} className="w-full p-2 border border-stone-300 rounded-xl" /></label>
  </div>
  {message&&<p role="status" className={message.ok?'text-xs text-emerald-700':'text-xs text-rose-700'}>{message.text}</p>}
  <button disabled={busy||configured===null} className="px-5 py-2.5 bg-stone-900 text-white rounded-xl text-xs font-bold disabled:opacity-50">{busy?'Kaydediliyor…':'PIN’i Kaydet'}</button>
 </form>;
}
