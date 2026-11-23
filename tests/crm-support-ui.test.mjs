import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';

test('Destek Masası yetki hatasında eski veriyi ve boş liste yanılsamasını göstermez',async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://admin.example.test'});for(const key of ['window','document','navigator','localStorage'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});globalThis.self=dom.window;globalThis.IS_REACT_ACT_ENVIRONMENT=true;const oldFetch=globalThis.fetch;
 const msg={id:1,name:'Gizli Ad',phone:'5551234567',email:'private@example.test',subject:'Destek',message:'Özel mesaj',status:'NEW',source:'iletisim',createdBy:null,createdAt:1700000000,readAt:null};let mode='success',resolveOld;const calls=[];
 globalThis.fetch=async(url,opts={})=>{calls.push([String(url),opts.method||'GET']);if(opts.method==='PATCH')return Response.json({success:false,error:{message:'Destek Masası erişim yetkiniz bulunmuyor.'}},{status:403});if(mode==='pending')return new Promise(resolve=>{resolveOld=resolve;});if(mode==='denied')return Response.json({success:false,error:{message:'Destek Masası erişim yetkiniz bulunmuyor.'}},{status:403});return Response.json({success:true,data:[msg],counts:{total:1,NEW:1,READ:0,ANSWERED:0}});};
 try{
  const {createRoot}=await import('react-dom/client');const {SupportDesk}=await import('../src/components/admin/SupportDesk.tsx');const root=createRoot(document.getElementById('root'));const wait=async(fn)=>{for(let i=0;i<100;i++){await act(async()=>{await new Promise(r=>setTimeout(r,10));});if(fn())return;}throw Error('UI timeout')};const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
  await act(async()=>root.render(React.createElement(SupportDesk)));await wait(()=>document.body.textContent.includes('Gizli Ad'));
  mode='pending';await act(async()=>button('Yenile').click());await wait(()=>!!resolveOld);mode='denied';await act(async()=>button('Yeni').click());await wait(()=>document.querySelector('[role=alert]'));
  assert.doesNotMatch(document.body.textContent,/Gizli Ad|5551234567|Henüz mesaj yok/);await act(async()=>resolveOld(Response.json({success:true,data:[msg],counts:{total:1,NEW:1,READ:0,ANSWERED:0}})));assert.doesNotMatch(document.body.textContent,/Gizli Ad|5551234567/);
  mode='success';await act(async()=>button('Yenile').click());await wait(()=>document.body.textContent.includes('Gizli Ad'));await act(async()=>[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()==='Okundu').at(-1).click());await wait(()=>!!document.querySelector('[role=alert]'));assert.doesNotMatch(document.body.textContent,/Gizli Ad|5551234567|Henüz mesaj yok/);assert.ok(calls.some(([url,method])=>url==='/api/contact'&&method==='PATCH'));
  await act(async()=>root.unmount());
 }finally{globalThis.fetch=oldFetch;dom.window.close();}
});
