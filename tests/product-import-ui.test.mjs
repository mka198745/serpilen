import test from 'node:test';
import assert from 'node:assert/strict';
import React, {act} from 'react';
import {JSDOM} from 'jsdom';

test('Yeni ürün formu bağlantıdan alanları doldurur, elle girilenleri ve ticari alanları korur', async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://admin.example.test'});
 for(const key of ['window','document','navigator','self','localStorage'])Object.defineProperty(globalThis,key,{value:key==='self'?dom.window:dom.window[key],configurable:true});
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.alert=()=>{}; let resolveImport;let importSignal;let requests=[];let nextImportError=false;let responseOverride=null;
 const imported={name:'Kaynak Ürün',description:'Açıklama\n\nTeknik özellikler:\nMalzeme: Pamuk',sku:'SKU-123',barcode:'8691234567890',brand:'Örnek',category:'Dikiş',images:['https://cdn.example.com/a.jpg','https://cdn.example.com/b.jpg'],warnings:[],technicalDetails:{articleNo:'260',composition:'%10 Bambu - %90 Akrilik',length:'100 gr - 240 m',knittingNeedle:'4-5',crochetNeedle:'2-4'}};
 const originalFetch=globalThis.fetch;globalThis.fetch=async(url,opts={})=>{
  requests.push({url,method:opts.method||'GET',body:opts.body});
  if(url==='/api/role-matrix')return Response.json({success:true,data:{matrix:{}}});
  if(url==='/api/products/import'&&opts.method!=='POST')return Response.json({success:true,allowed:true});
  if(url==='/api/products/import')return new Promise(resolve=>{importSignal=opts.signal;resolveImport=()=>resolve(responseOverride ? responseOverride() : nextImportError ? Response.json({success:false,error:'Siteye ulaşılamadı.'},{status:502}) : Response.json({success:true,data:imported}));});
  if(url==='/api/products'&&opts.method==='POST')return Response.json({success:true});
  return Response.json({success:true,data:[]});
 };
 try{
  const {createRoot}=await import('react-dom/client');const {AdminDashboardClient}=await import('../src/app/admin/AdminDashboardClient.tsx');const root=createRoot(document.getElementById('root'));
  const props={products:[],categories:[{id:1,name:'Dikiş'},{id:2,name:'Diğer'}],brands:[{id:1,name:'Diğer'},{id:2,name:'Örnek'}],warehouses:[{id:1,name:'Merkez',code:'M'}],inventory:[],ledger:[],orders:[],suppliers:[],purchaseOrders:[],coupons:[],shifts:[],currentRole:'SUPER_ADMIN'};
  const wait=async(fn)=>{for(let i=0;i<100;i++){await act(async()=>{await new Promise(r=>setTimeout(r,10));});if(fn())return;}throw Error('UI timeout');};
  const click=async(label)=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent?.trim()===label);assert.ok(b,label);await act(async()=>b.click());};
  const setInput=async(selector,value)=>{const input=document.querySelector(selector);assert.ok(input,selector);await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));input.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});};
  await act(async()=>root.render(React.createElement(AdminDashboardClient,props)));await wait(()=>document.body.textContent.includes('Ürün & Katalog'));await click('Ürün & Katalog');await click('Yeni Ürün Ekle');
  await wait(()=>!!document.querySelector('#product-source-url'));assert.ok(document.querySelector('#product-source-url'));assert.ok(document.body.textContent.includes('Ürün Linki ekle'));
  await setInput('#product-source-url','https://fixture.example/product');
  const select=[...document.querySelectorAll('form select')].find(x=>[...x.options].some(o=>o.text==='Dikiş')&&[...x.options].some(o=>o.text==='Diğer'));assert.ok(select);
  await act(async()=>{select.value='2';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
  await click('Ürünü getir');await wait(()=>!!resolveImport);
  // User edits during the request; the result must not clobber that edit.
  await setInput('input[placeholder="Örn: Gütermann 100m Dikiş İpliği No: 120"]','Elle girilen ad');
  const specInput=label=>[...document.querySelectorAll('fieldset label')].find(el=>el.textContent.trim()===label)?.querySelector('input');
  assert.ok(specInput('Artikel No'));const composition=specInput('Karışım');
  await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(composition,'El ile seçildi');composition.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
  await act(async()=>resolveImport());await wait(()=>document.body.textContent.includes('Bilgiler forma aktarıldı.'));
  assert.equal(document.querySelector('input[placeholder="Örn: Gütermann 100m Dikiş İpliği No: 120"]').value,'Elle girilen ad');
  assert.match(document.querySelector('textarea[placeholder^="Ürünün detaylı"]').value,/Malzeme: Pamuk/);
  assert.equal(document.querySelector('input[placeholder="GUT-120-SIY"]').value,'SKU-123');assert.equal(document.querySelector('#new-product-sku').disabled,false);assert.equal(document.querySelector('#new-product-sku').required,true);assert.equal(document.querySelector('#new-product-barcode').disabled,false);assert.equal(document.querySelector('#new-product-barcode').value,'8691234567890');
  assert.equal(document.querySelector('input[placeholder="869001122..."]').value,'8691234567890');
  assert.equal(specInput('Artikel No').value,'260');assert.equal(specInput('Karışım').value,'El ile seçildi');
  assert.equal(specInput('Metraj / Gramaj').value,'100 gr - 240 m');assert.equal(specInput('Şiş No').value,'4-5');assert.equal(specInput('Tığ No').value,'2-4');
  assert.ok([...document.querySelectorAll('img')].some(x=>x.src==='https://cdn.example.com/a.jpg'));
  const selects=[...document.querySelectorAll('form select')];assert.ok(selects.some(s=>s.value==='2'&&[...s.options].some(o=>o.text==='Örnek')));assert.equal(select.value,'2');assert.match(document.body.textContent,/Kategoriyi kontrol edip seçin/);
  assert.ok([...document.querySelectorAll('input[type=number]')].some(x=>x.value==='30.00'));assert.ok([...document.querySelectorAll('input[type=number]')].some(x=>x.value==='55.00'));assert.ok([...document.querySelectorAll('input[type=number]')].some(x=>x.value==='50'));
  assert.equal(requests.filter(x=>x.url==='/api/products'&&x.method==='POST').length,0);
  assert.match(document.body.textContent,/sunucumuza kopyalanmaz/);assert.match(document.body.textContent,/Fiyat, stok ve depo değiştirilmez/);
  // A failed import must leave the current form untouched.
  nextImportError=true;resolveImport=null;await click('Ürünü getir');await wait(()=>!!resolveImport);await act(async()=>resolveImport());await wait(()=>document.body.textContent.includes('Siteye ulaşılamadı.'));
  assert.equal(document.querySelector('input[placeholder="Örn: Gütermann 100m Dikiş İpliği No: 120"]').value,'Elle girilen ad');
  // HTML from an old deployment, proxy, or redirect must never reach JSON.parse or overwrite the draft.
  nextImportError=false;
  for(const [makeResponse, expected] of [
    [()=>new Response('<!DOCTYPE html><html>not found</html>',{status:404,headers:{'content-type':'text/html'}}),'Ürün getirme servisi bu sunucuda bulunamadı.'],
    [()=>new Response('<!DOCTYPE html><html>gateway error</html>',{status:502,headers:{'content-type':'text/html'}}),'beklenmeyen bir yanıt döndürdü (HTTP 502)'],
    [()=>new Response('<!DOCTYPE html><html>login</html>',{status:200,headers:{'content-type':'text/html'}}),'beklenmeyen bir yanıt döndürdü (HTTP 200)'],
    [()=>new Response('<!DOCTYPE html>',{status:200,headers:{'content-type':'application/json'}}),'beklenmeyen bir yanıt döndürdü (HTTP 200)'],
    [()=>Response.json({success:false,error:{message:'Oturumunuz sona erdi.'}},{status:401}),'Oturumunuz sona erdi.'],
    [()=>Response.json({success:true,data:{name:'Yarım veri'}}),'beklenmeyen bir yanıt döndürdü (HTTP 200)'],
  ]) {
    responseOverride=makeResponse;resolveImport=null;await click('Ürünü getir');await wait(()=>!!resolveImport);await act(async()=>resolveImport());await wait(()=>document.body.textContent.includes(expected));
    assert.doesNotMatch(document.querySelector('[role=alert]').textContent,/Unexpected token|DOCTYPE/);
    assert.equal(document.querySelector('input[placeholder="Örn: Gütermann 100m Dikiş İpliği No: 120"]').value,'Elle girilen ad');
    assert.equal(requests.filter(x=>x.url==='/api/products'&&x.method==='POST').length,0);
  }
  responseOverride=null;
  // Closing cancels the pending request; reopening preserves the draft and manual category.
  nextImportError=false;resolveImport=null;await click('Ürünü getir');await wait(()=>!!resolveImport);
  const modal=document.querySelector('#product-source-url').closest('.fixed');const close=modal.querySelector('h3').parentElement.querySelector('button');await act(async()=>close.click());assert.equal(importSignal.aborted,true);await act(async()=>resolveImport());
  await click('Yeni Ürün Ekle');assert.equal(document.querySelector('input[placeholder="Örn: Gütermann 100m Dikiş İpliği No: 120"]').value,'Elle girilen ad');
  resolveImport=null;await setInput('#product-source-url','https://fixture.example/product');await click('Ürünü getir');await wait(()=>!!resolveImport);await act(async()=>resolveImport());await wait(()=>document.body.textContent.includes('Bilgiler forma aktarıldı.'));
  const reopened=[...document.querySelectorAll('form select')].find(x=>[...x.options].some(o=>o.text==='Dikiş')&&[...x.options].some(o=>o.text==='Diğer'));assert.equal(reopened.value,'2');
  // The only write below is a mocked fetch, never a database operation.
  await act(async()=>document.querySelector('#product-source-url').closest('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
  await wait(()=>!document.querySelector('#product-source-url'));assert.equal(requests.filter(x=>x.url==='/api/products'&&x.method==='POST').length,1);
  const saved=JSON.parse(requests.find(x=>x.url==='/api/products'&&x.method==='POST').body);assert.equal(saved.technicalDetails.articleNo,'260');assert.equal(saved.technicalDetails.composition,'El ile seçildi');assert.equal(saved.technicalDetails.crochetNeedle,'2-4');
  await click('Yeni Ürün Ekle');assert.equal(document.querySelector('input[placeholder="Örn: Gütermann 100m Dikiş İpliği No: 120"]').value,'');
  resolveImport=null;await setInput('#product-source-url','https://fixture.example/product');await click('Ürünü getir');await wait(()=>!!resolveImport);await act(async()=>resolveImport());await wait(()=>document.body.textContent.includes('Bilgiler forma aktarıldı.'));
  const resetSelect=[...document.querySelectorAll('form select')].find(x=>[...x.options].some(o=>o.text==='Dikiş')&&[...x.options].some(o=>o.text==='Diğer'));assert.equal(resetSelect.value,'1');
  await act(async()=>root.unmount());
 }finally{globalThis.fetch=originalFetch;dom.window.close();}
});
