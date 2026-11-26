import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';

test('Bağlantıdaki varyantlar inceleme taslağına gelir, elle değişiklikler korunur',async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://admin.example.test'});
 for(const key of ['window','document','navigator','self','localStorage'])Object.defineProperty(globalThis,key,{value:key==='self'?dom.window:dom.window[key],configurable:true});
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.alert=()=>{};const original=globalThis.fetch;let resolveImport,saveBody;
 const product={name:'BABY BEST',description:'Açıklama',sku:'',barcode:'',brand:'Alize',category:'',images:[],warnings:[],technicalDetails:{composition:'%100 Akrilik',length:'100g / 200m'},variants:[{colorName:'55',size:'',imageUrl:'https://alize.gen.tr/uploads/55.jpg'},{colorName:'506',size:'36',imageUrl:'https://alize.gen.tr/uploads/506.jpg'}]};
 globalThis.fetch=async(url,opts={})=>{
  if(url==='/api/role-matrix')return Response.json({success:true,data:{matrix:{}}});
  if(url==='/api/products/import'&&opts.method!=='POST')return Response.json({success:true,allowed:true});
  if(url==='/api/products/import')return new Promise(resolve=>{resolveImport=()=>resolve(Response.json({success:true,data:product}));});
  if(url==='/api/products'&&opts.method==='POST'){saveBody=JSON.parse(opts.body);return Response.json({success:true,data:{id:1}});}
  return Response.json({success:true,data:[]});
 };
 try{
  const {createRoot}=await import('react-dom/client');const {AdminDashboardClient}=await import('../src/app/admin/AdminDashboardClient.tsx');const root=createRoot(document.getElementById('root'));
  const props={products:[],categories:[{id:1,name:'Diğer'}],brands:[{id:1,name:'Alize'}],warehouses:[{id:1,name:'Merkez',code:'M'}],inventory:[],ledger:[],orders:[],suppliers:[],purchaseOrders:[],coupons:[],shifts:[],currentRole:'SUPER_ADMIN'};
  const wait=async fn=>{for(let i=0;i<100;i++){await act(async()=>{await new Promise(r=>setTimeout(r,10));});if(fn())return;}throw Error('timeout');};
  const click=async label=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent?.trim()===label);assert.ok(b,label);await act(async()=>b.click());};
  const set=async(el,value)=>{assert.ok(el);await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});};
  const row=n=>document.querySelector(`button[aria-label="Varyant ${n} kaldır"]`)?.parentElement.parentElement;
  const field=(n,name)=>[...row(n).querySelectorAll('label')].find(x=>x.textContent.trim()===name)?.querySelector('input');
  const doImport=async()=>{resolveImport=null;await click('Ürünü getir');await wait(()=>!!resolveImport);await act(async()=>resolveImport());await wait(()=>document.body.textContent.includes('Bilgiler forma aktarıldı.'));};
  await act(async()=>root.render(React.createElement(AdminDashboardClient,props)));await wait(()=>document.body.textContent.includes('Ürün & Katalog'));await click('Ürün & Katalog');await click('Yeni Ürün Ekle');await wait(()=>!!document.querySelector('#product-source-url'));
  await set(document.querySelector('#product-source-url'),'https://alize.gen.tr/yumak/baby-best');await doImport();
  assert.equal(field(1,'Renk adı').value,'55');assert.equal(field(2,'Renk adı').value,'506');assert.equal(field(1,'Başlangıç stoğu').value,'0');assert.match(row(2).textContent,/36/);assert.equal([...document.querySelectorAll('label')].find(x=>x.textContent.trim()==='Başlangıç Stoğu:').parentElement.querySelector('input').value,'0');for (const name of ['Ölçü','Uzunluk','Alış fiyatı (TL)','Satış fiyatı (TL)']) assert.equal(field(1,name),undefined);assert.equal(field(1,'Varyant barkodu (isteğe bağlı)').value,'');assert.equal(field(1,'Varyant fotoğraf bağlantısı (HTTPS, isteğe bağlı)').value,'https://alize.gen.tr/uploads/55.jpg');
  assert.match(document.body.textContent,/2 varyant taslağa eklendi/);
  assert.match(row(1).textContent,/BABY BEST · 55/);assert.equal(row(1).querySelector('img').getAttribute('src'),'https://alize.gen.tr/uploads/55.jpg');
  assert.equal(row(1).querySelector('details').open,false);
  assert.ok([...document.querySelectorAll('input')].some(x=>x.value==='%100 Akrilik'));assert.ok([...document.querySelectorAll('input')].some(x=>x.value==='100g / 200m'));
  await act(async()=>row(1).querySelector('img').dispatchEvent(new dom.window.Event('error')));assert.match(row(1).textContent,/Görsel yüklenemedi/);
  await set(field(1,'Varyant fotoğraf bağlantısı (HTTPS, isteğe bağlı)'),'https://127.0.0.1/private.jpg');assert.equal(row(1).querySelector('img'),null);
  await set(field(1,'Varyant fotoğraf bağlantısı (HTTPS, isteğe bağlı)'),'https://alize.gen.tr/uploads/55.jpg');
  await set(field(1,'Renk adı'),'Elle değişti');await set(field(1,'Başlangıç stoğu'),'7');await doImport();
  assert.equal(field(1,'Renk adı').value,'Elle değişti');assert.equal(field(1,'Başlangıç stoğu').value,'7');assert.equal(document.querySelector('button[aria-label="Varyant 3 kaldır"]'),null);assert.match(document.body.textContent,/Mevcut varyantlar korunuyor/);
  const mainStock=[...document.querySelectorAll('label')].find(x=>x.textContent.trim()==='Başlangıç Stoğu:').parentElement.querySelector('input');assert.equal(mainStock.value,'7');await set(mainStock,'9');
  const form=document.querySelector('#product-source-url').closest('form');await act(async()=>form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));assert.equal(saveBody,undefined);assert.match(document.body.textContent,/hedefi varyant stokları toplamıyla eşleşmeli/);
  await set(field(2,'Başlangıç stoğu'),'2');assert.equal(mainStock.value,'9');
  await set(document.querySelector('input[placeholder="GUT-120-SIY"]'),'DEMO');await act(async()=>form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));await wait(()=>!!saveBody);assert.equal(saveBody.initialStock,0);assert.equal(saveBody.variants[0].colorName,'Elle değişti');assert.equal(saveBody.variants[1].size,'36');assert.equal(saveBody.variants[0].imageUrl,'https://alize.gen.tr/uploads/55.jpg');
  await wait(()=>!document.querySelector('#product-source-url'));await click('Yeni Ürün Ekle');await wait(()=>!!document.querySelector('#product-source-url'));
  // A draft added while the import request is in flight must not be overwritten.
  await set(document.querySelector('#product-source-url'),'https://alize.gen.tr/yumak/baby-best');resolveImport=null;await click('Ürünü getir');await wait(()=>!!resolveImport);assert.equal([...document.querySelectorAll('button')].find(b=>b.textContent.includes('Ürün bilgileri getiriliyor')).disabled,true);const pendingForm=document.querySelector('#product-source-url').closest('form');await act(async()=>pendingForm.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));assert.equal(saveBody.variants[0].colorName,'Elle değişti');await click('+ Varyant Ekle');await set(field(1,'Renk adı'),'Manuel');await act(async()=>resolveImport());await wait(()=>document.body.textContent.includes('Mevcut varyantlar korunuyor'));assert.equal(field(1,'Renk adı').value,'Manuel');assert.equal(document.querySelector('button[aria-label="Varyant 2 kaldır"]'),null);
  // A different named product must not acquire these variants, even with an empty variant list.
  await act(async()=>document.querySelector('button[aria-label="Varyant 1 kaldır"]').click());await set(document.querySelector('input[placeholder="Örn: Gütermann 100m Dikiş İpliği No: 120"]'),'Başka ürün');await doImport();assert.match(document.body.textContent,/ürün adı kaynak ürünle farklı/);assert.equal(document.querySelector('button[aria-label="Varyant 1 kaldır"]'),null);
  await act(async()=>root.unmount());
 }finally{globalThis.fetch=original;dom.window.close();}
});
