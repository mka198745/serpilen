"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/client-auth";
import { useAuth } from "@/context/AuthContext";
import { PosTerminalClient } from "./PosTerminalClient";
import type { Category, PosShift, Product, ProductVariant } from "@/lib/types";

type Bootstrap={products:(Product & {variants:ProductVariant[]})[];categories:Category[];shift:PosShift|null;cashierName:string;warehouseId:number};
const IDLE_MS=60_000;
export function PosScreenGate() {
 const {user,loading}=useAuth();
 const [pin,setPin]=useState("");const [busy,setBusy]=useState(false);const [error,setError]=useState("");
 const [data,setData]=useState<Bootstrap|null>(null);
 const token=useRef<string|null>(null), owner=useRef<number|null>(null), last=useRef(0), lastTouch=useRef(0), leaving=useRef(false), generation=useRef(0);
 const lock=useCallback((navigate:boolean)=>{
  generation.current++;const grant=token.current;token.current=null;
  if(grant)void authFetch('/api/pos/access',{method:'POST',headers:{'Content-Type':'application/json','X-Pos-Grant':grant},body:JSON.stringify({action:'LOCK'}),keepalive:true}).catch(()=>{});
  if(navigate&&!leaving.current){leaving.current=true;window.location.replace('/');}
 },[]);
 const posFetch=useCallback(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const grant=token.current;const headers=new Headers(init?.headers);if(grant)headers.set('X-Pos-Grant',grant);
  const res=await authFetch(input,{...init,headers});
  if(res.status===401)lock(true);
  if(res.status===403){const body=await res.clone().json().catch(()=>null);if(body?.code==='POS_LOCKED')lock(true);}
  return res;
 },[lock]);
 useEffect(()=>{
  last.current=Date.now();
  const activity=()=>{
   const now=Date.now();if(now-last.current>=IDLE_MS){lock(true);return;}last.current=now;
   if(token.current&&now-lastTouch.current>=8000){lastTouch.current=now;void posFetch('/api/pos/access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'TOUCH'})}).catch(()=>lock(true));}
  };
  const check=setInterval(()=>{if(Date.now()-last.current>=IDLE_MS)lock(true);},1000);
  const visibility=()=>{if(document.visibilityState==='hidden')lock(true);};
  const pagehide=()=>lock(false);
  const pageshow=(event:PageTransitionEvent)=>{if(event.persisted)lock(true);};
  for(const name of ['pointerdown','pointermove','keydown','touchstart','wheel'])window.addEventListener(name,activity,{passive:true});
  document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',pagehide);window.addEventListener('pageshow',pageshow);
  return ()=>{clearInterval(check);for(const name of ['pointerdown','pointermove','keydown','touchstart','wheel'])window.removeEventListener(name,activity);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',pagehide);window.removeEventListener('pageshow',pageshow);lock(false);};
 },[lock,posFetch]);
 useEffect(()=>{if(!loading&&owner.current!==null&&owner.current!==user?.id)lock(true);},[user?.id,loading,lock]);
 const unlock=async(e:React.FormEvent)=>{
  e.preventDefault();if(busy)return;const attempt=generation.current;setBusy(true);setError("");
  try {
   const res=await authFetch('/api/pos/access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'UNLOCK',pin})});
   const result=await res.json().catch(()=>({}));if(!res.ok||!result.success){setError(typeof result.error==='string'?result.error:result.error?.message||'PIN doğrulanamadı.');return;}
   if(generation.current!==attempt){void authFetch('/api/pos/access',{method:'POST',headers:{'Content-Type':'application/json','X-Pos-Grant':result.data.grant},body:JSON.stringify({action:'LOCK'}),keepalive:true}).catch(()=>{});return;}
   token.current=result.data.grant;owner.current=user?.id??null;last.current=Date.now();lastTouch.current=Date.now();setPin('');
   const boot=await posFetch('/api/pos/bootstrap',{cache:'no-store'});const payload=await boot.json();if(!boot.ok||!payload.success){lock(false);setError(payload.error||'POS bilgileri yüklenemedi.');return;}
   if(generation.current===attempt)setData(payload.data);
  } catch {lock(false);setError('Sunucuya ulaşılamadı; tekrar deneyin.');} finally {setBusy(false);}
 };
 if(data)return <PosTerminalClient initialProducts={data.products} categories={data.categories} initialShift={data.shift} cashierName={data.cashierName} warehouseId={data.warehouseId} posFetch={posFetch}/>;
 return <main className="max-w-md mx-auto px-4 py-14"><form onSubmit={unlock} className="rounded-2xl bg-white border border-stone-200 shadow-sm p-6 space-y-4">
  <h1 className="font-black text-xl text-stone-900">POS ekran kilidi</h1><p className="text-sm text-stone-600">{user?.name || 'Personel'} için 6 haneli ekran PIN’inizi girin. 60 saniye işlem yapılmazsa anasayfaya dönülür.</p>
  <label className="block text-sm font-bold">Ekran PIN’i<input aria-label="Ekran PIN’i" type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{6}" maxLength={6} required value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,6))} className="block w-full mt-2 border border-stone-300 rounded-xl p-3" /></label>
  {error&&<p role="alert" className="text-sm text-rose-700">{error}</p>}
  <button disabled={busy||loading} className="w-full py-3 rounded-xl bg-amber-800 text-white font-bold disabled:opacity-50">{busy?'Doğrulanıyor…':'POS ekranını aç'}</button>
  <p className="text-xs text-stone-600">PIN belirlemek veya unutulan PIN’i değiştirmek için <Link className="underline font-bold" href="/hesabim">Hesabım</Link> bölümünü kullanın.</p>
 </form></main>;
}
