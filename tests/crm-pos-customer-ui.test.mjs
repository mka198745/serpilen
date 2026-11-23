import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';

test('POS hızlı kayıtta hata ve belirsiz sonuç gösterilir, taslak korunur ve tek istek yapılır',async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://admin.example.test'});for(const key of ['window','document','navigator','self','localStorage'])Object.defineProperty(globalThis,key,{value:key==='self'?dom.window:dom.window[key],configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;const oldFetch=globalThis.fetch;let mode='duplicate',resolveRequest;const requests=[];
 globalThis.fetch=async(url,opts={})=>{requests.push({url,body:opts.body});if(mode==='duplicate')return Response.json({success:false,error:'Bu e-posta veya telefonla bir müşteri kartı mevcut. Önce mevcut kayıtları kontrol edin.'},{status:409});if(mode==='pending')return new Promise(resolve=>{resolveRequest=resolve;});if(mode==='network')throw Error('disconnected');return new Response('<html>gateway</html>',{status:502});};
 try{
  const {createRoot}=await import('react-dom/client');const {PosTerminalClient}=await import('../src/app/pos/PosTerminalClient.tsx');const root=createRoot(document.getElementById('root'));const wait=async(fn)=>{for(let i=0;i<100;i++){await act(async()=>{await new Promise(r=>setTimeout(r,10));});if(fn())return;}throw Error('UI timeout')};
  await act(async()=>root.render(React.createElement(PosTerminalClient,{initialProducts:[],categories:[],initialShift:{id:1,cashierName:'Kasiyer',terminalCode:'KASA'}})));
  const picker=()=>document.querySelector('[aria-label="POS müşteri seçimi"]');assert.match(picker().textContent,/Misafir Perakende Müşterisi/);
  await act(async()=>document.querySelector('button[title="Hızlı Müşteri Ekle"]').click());const setInput=async(selector,value)=>{const el=document.querySelector(selector);assert.ok(el);await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));el.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});};
  await setInput('input[placeholder="Örn: Gülizar Aydın"]','Yeni Müşteri');await setInput('input[placeholder="0532 000 00 00"]','5553334455');await setInput('input[placeholder="gulizar@gmail.com"]','new@example.test');
  const form=()=>document.querySelector('input[placeholder="Örn: Gülizar Aydın"]').closest('form');const submit=()=>act(async()=>form().dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
  await submit();await wait(()=>document.querySelector('[role="alert"]'));assert.match(document.querySelector('[role="alert"]').textContent,/müşteri kartı mevcut/);assert.equal(document.querySelector('input[placeholder="Örn: Gülizar Aydın"]').value,'Yeni Müşteri');assert.match(picker().textContent,/Misafir Perakende Müşterisi/);
  mode='network';await submit();await wait(()=>document.querySelector('[role="alert"]')?.textContent.includes('işlem sonucu bilinmiyor'));assert.match(picker().textContent,/Misafir Perakende Müşterisi/);
  mode='html';await submit();await wait(()=>document.querySelector('[role="alert"]')?.textContent.includes('İşlem sonucu doğrulanamadı'));assert.equal(document.querySelector('input[placeholder="0532 000 00 00"]').value,'5553334455');
  mode='pending';await submit();await wait(()=>!!resolveRequest);assert.equal(form().querySelector('button[type="submit"]').disabled,true);assert.equal(form().querySelector('input').disabled,true);const count=requests.length;await submit();assert.equal(requests.length,count);assert.deepEqual(JSON.parse(requests.at(-1).body),{name:'Yeni Müşteri',phone:'5553334455',email:'new@example.test'});
  await act(async()=>resolveRequest(Response.json({success:true,data:{id:9,name:'Yeni Müşteri',phone:'5553334455',companyName:null,loyaltyPoints:0}},{status:201})));await wait(()=>!document.querySelector('input[placeholder="Örn: Gülizar Aydın"]'));assert.match(picker().textContent,/Yeni Müşteri/);
  await act(async()=>root.unmount());
 }finally{globalThis.fetch=oldFetch;dom.window.close();}
});
