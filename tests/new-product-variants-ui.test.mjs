import test from 'node:test';
import assert from 'node:assert/strict';
import React, {act} from 'react';
import {JSDOM} from 'jsdom';

test('Varyant stok toplamı ve manuel hedef tutarlı; ortak alanlar ve taslak korunur', async () => {
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://admin.example.test'});
 for(const key of ['window','document','navigator','self','localStorage']) Object.defineProperty(globalThis,key,{value:key==='self'?dom.window:dom.window[key],configurable:true});
 globalThis.IS_REACT_ACT_ENVIRONMENT=true; globalThis.alert=()=>{}; const originalFetch=globalThis.fetch; const requests=[]; let resolveSave;
 globalThis.fetch=async(url,opts={})=>{
  if(url==='/api/role-matrix')return Response.json({success:true,data:{matrix:{}}});
  if(url==='/api/products/import')return Response.json({success:true,allowed:true});
  if(url==='/api/products' && opts.method==='POST'){requests.push(JSON.parse(opts.body));return new Promise(resolve=>{resolveSave=resolve;});}
  return Response.json({success:true,data:[]});
 };
 try {
  const {createRoot}=await import('react-dom/client');const {AdminDashboardClient}=await import('../src/app/admin/AdminDashboardClient.tsx'); const root=createRoot(document.getElementById('root'));
  const props={products:[],categories:[{id:1,name:'Dikiş'}],brands:[{id:1,name:'Örnek'}],warehouses:[{id:1,name:'Merkez',code:'M'}],inventory:[],ledger:[],orders:[],suppliers:[],purchaseOrders:[],coupons:[],shifts:[],currentRole:'SUPER_ADMIN'};
  const wait=async(fn)=>{for(let i=0;i<100;i++){await act(async()=>{await new Promise(r=>setTimeout(r,10));});if(fn())return;}throw Error('UI timeout');};
  const click=async(label)=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent?.trim()===label);assert.ok(b,label);await act(async()=>b.click());};
  const input=async(el,value)=>{assert.ok(el);await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));el.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});};
  const row=n=>document.querySelector(`button[aria-label="Varyant ${n} kaldır"]`)?.parentElement.parentElement;
  const field=(n,label)=>[...row(n).querySelectorAll('label')].find(x=>x.textContent.trim()===label)?.querySelector('input');
  const mainStock=()=>[...document.querySelectorAll('label')].find(x=>x.textContent.trim()==='Başlangıç Stoğu:').parentElement.querySelector('input');
  const spec=label=>[...document.querySelectorAll('fieldset legend')].find(x=>x.textContent==='Teknik özellikler').parentElement.querySelectorAll('label');
  await act(async()=>root.render(React.createElement(AdminDashboardClient,props)));await wait(()=>document.body.textContent.includes('Ürün & Katalog'));await click('Ürün & Katalog');await click('Yeni Ürün Ekle');
  const globalSize=[...spec()].find(x=>x.textContent.trim()==='Ölçü').querySelector('input');await input(globalSize,'20 mm');
  await click('+ Varyant Ekle');await click('+ Varyant Ekle');
  for(const label of ['Ölçü','Uzunluk','Alış fiyatı (TL)','Satış fiyatı (TL)'])assert.equal(field(1,label),undefined,label);
  await input(field(1,'Renk adı'),'Siyah');await input(field(1,'Başlangıç stoğu'),'8');
  await input(field(2,'Renk adı'),'Kırmızı');await input(field(2,'Başlangıç stoğu'),'3');
  assert.equal(mainStock().disabled,false);assert.equal(mainStock().value,'11');
  await input(mainStock(),'0');assert.equal(mainStock().value,'0');assert.match(document.body.textContent,/Hedef: 0 · Varyant stokları toplamı: 11/);await input(mainStock(),'11');
  await input(mainStock(),'15');assert.equal(field(1,'Başlangıç stoğu').value,'8');assert.equal(field(2,'Başlangıç stoğu').value,'3');assert.match(document.body.textContent,/Hedef: 15 · Varyant stokları toplamı: 11/);
  const form=document.querySelector('#product-source-url').closest('form');
  await act(async()=>form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));assert.equal(requests.length,0);assert.match(document.body.textContent,/hedefi varyant stokları toplamıyla eşleşmeli/);
  await input(field(2,'Başlangıç stoğu'),'7');assert.equal(mainStock().value,'15');assert.match(document.body.textContent,/Hedef: 15 · Varyant stokları toplamı: 15/);assert.doesNotMatch(document.body.textContent,/hedefi varyant stokları toplamıyla eşleşmeli/);
  await input(field(2,'Başlangıç stoğu'),'6');assert.equal(mainStock().value,'15');await act(async()=>form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));assert.equal(requests.length,0);assert.match(document.body.textContent,/hedefi varyant stokları toplamıyla eşleşmeli/);await input(field(2,'Başlangıç stoğu'),'7');
  await input(field(1,'Başlangıç stoğu'),'');assert.equal(mainStock().value,'15');assert.match(document.body.textContent,/varyant stokları toplamı: eksik veya geçersiz/i);
  await input(field(1,'Başlangıç stoğu'),'10');assert.equal(mainStock().value,'15');
  await act(async()=>document.querySelector('button[aria-label="Varyant 2 kaldır"]').click());assert.equal(mainStock().value,'15');
  await click('+ Varyant Ekle');await input(field(2,'Renk adı'),'Kırmızı');await input(field(2,'Başlangıç stoğu'),'3');assert.equal(mainStock().value,'15');await input(mainStock(),'13');
  await act(async()=>form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));await wait(()=>!!resolveSave);
  assert.equal(requests.length,1);assert.equal(requests[0].initialStock,0);assert.equal(requests[0].variants.length,2);assert.equal(requests[0].variants[0].initialStock,'10');assert.equal(requests[0].variants[1].initialStock,'3');assert.equal(requests[0].variants[0].buyPrice,'');assert.equal(requests[0].variants[0].retailPrice,'');assert.equal(requests[0].technicalDetails.size,'20 mm');
  await act(async()=>form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));assert.equal(requests.length,1);
  await act(async()=>resolveSave(Response.json({success:false,error:'SKU kullanımda'},{status:422})));await wait(()=>document.body.textContent.includes('SKU kullanımda'));assert.equal(field(1,'Renk adı').value,'Siyah');assert.equal(mainStock().value,'13');
  resolveSave=null;await act(async()=>form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));await wait(()=>!!resolveSave);await act(async()=>resolveSave(Response.json({success:true,data:{id:1}})));await wait(()=>!document.querySelector('#product-source-url'));
  await click('Yeni Ürün Ekle');assert.equal(document.querySelector('button[aria-label="Varyant 1 kaldır"]'),null);assert.equal(mainStock().disabled,false);assert.equal(mainStock().value,'50');
  await click('+ Varyant Ekle');await input(field(1,'Başlangıç stoğu'),'4');await act(async()=>document.querySelector('button[aria-label="Varyant 1 kaldır"]').click());assert.equal(mainStock().value,'0');assert.match(document.body.textContent,/Son varyant kaldırıldı/);
  await act(async()=>root.unmount());
 } finally {globalThis.fetch=originalFetch;dom.window.close();}
});
