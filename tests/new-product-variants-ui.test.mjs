import test from 'node:test';
import assert from 'node:assert/strict';
import React, {act} from 'react';
import {JSDOM} from 'jsdom';

test('Ürün formunda varyant eklenir, düzenlenir, kaldırılır; hata taslağı korur, başarı sıfırlar', async () => {
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
  const row=(n)=>[...document.querySelectorAll('fieldset div')].find(x=>x.firstElementChild?.textContent?.includes(`Varyant ${n}`) && x.querySelector('input'));
  const field=(n,label)=>[...row(n).querySelectorAll('label')].find(x=>x.textContent.trim()===label)?.querySelector('input');
  await act(async()=>root.render(React.createElement(AdminDashboardClient,props)));await wait(()=>document.body.textContent.includes('Ürün & Katalog'));await click('Ürün & Katalog');await click('Yeni Ürün Ekle');
  assert.match(document.body.textContent,/Varyantlar/);await click('+ Varyant Ekle');await click('+ Varyant Ekle');
  await input(field(1,'Renk adı'),'Siyah');await input(field(1,'Ölçü'),'20 mm');await input(field(1,'Başlangıç stoğu'),'8');await input(field(1,'Satış fiyatı (TL)'),'70.00');
  await input(field(2,'Renk adı'),'Kırmızı');await input(field(2,'Başlangıç stoğu'),'3');
  const mainStock=[...document.querySelectorAll('label')].find(x=>x.textContent.trim()==='Başlangıç Stoğu:').parentElement.querySelector('input');assert.equal(mainStock.disabled,true);
  await act(async()=>document.querySelector('button[aria-label="Varyant 2 kaldır"]').click());assert.equal(document.querySelector('button[aria-label="Varyant 2 kaldır"]'),null);
  await click('+ Varyant Ekle');await input(field(2,'Uzunluk'),'100m');await input(field(2,'Başlangıç stoğu'),'3');
  const form=document.querySelector('#product-source-url').closest('form');
  await act(async()=>form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));await wait(()=>!!resolveSave);
  assert.equal(requests.length,1);assert.equal(requests[0].initialStock,0);assert.equal(requests[0].variants.length,2);assert.equal(requests[0].variants[0].colorName,'Siyah');assert.equal(requests[0].variants[0].initialStock,'8');assert.equal(requests[0].variants[1].length,'100m');
  await act(async()=>form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));assert.equal(requests.length,1);
  await act(async()=>resolveSave(Response.json({success:false,error:'SKU kullanımda'},{status:422})));await wait(()=>document.body.textContent.includes('SKU kullanımda'));assert.equal(field(1,'Renk adı').value,'Siyah');assert.equal(field(2,'Uzunluk').value,'100m');
  resolveSave=null;await act(async()=>form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));await wait(()=>!!resolveSave);await act(async()=>resolveSave(Response.json({success:true,data:{id:1}})));await wait(()=>!document.querySelector('#product-source-url'));
  await click('Yeni Ürün Ekle');assert.equal(document.querySelector('button[aria-label="Varyant 1 kaldır"]'),null);assert.equal([...document.querySelectorAll('label')].find(x=>x.textContent.trim()==='Başlangıç Stoğu:').parentElement.querySelector('input').disabled,false);
  await act(async()=>root.unmount());
 } finally {globalThis.fetch=originalFetch;dom.window.close();}
});
