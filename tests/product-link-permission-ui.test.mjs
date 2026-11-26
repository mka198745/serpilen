import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';

test('Ürün linki sunucu yetkisi olmadan görünmez, yetki değişince kapanır ve taslağı korur', async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://admin.example.test'});
 for(const key of ['window','document','navigator','self','localStorage'])Object.defineProperty(globalThis,key,{value:key==='self'?dom.window:dom.window[key],configurable:true});
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.alert=()=>{};const originalFetch=globalThis.fetch;let pendingCheck=[],pendingImport=[],signal;
 globalThis.fetch=async(url,opts={})=>{
   if(url==='/api/role-matrix')return Response.json({success:true,data:{matrix:{STORE_MANAGER:{catalog:true,productLinkImport:true}}}});
   if(url==='/api/products/import'&&opts.method==='POST')return new Promise(resolve=>{signal=opts.signal;pendingImport.push(resolve)});
   if(url==='/api/products/import')return new Promise(resolve=>pendingCheck.push(resolve));
   return Response.json({success:true,data:[]});
 };
 try{
  const {createRoot}=await import('react-dom/client');const {AdminDashboardClient}=await import('../src/app/admin/AdminDashboardClient.tsx');const root=createRoot(document.getElementById('root'));
  const props={products:[],categories:[{id:1,name:'Dikiş'}],brands:[{id:1,name:'Diğer'}],warehouses:[{id:1,name:'Merkez',code:'M'}],inventory:[],ledger:[],orders:[],suppliers:[],purchaseOrders:[],coupons:[],shifts:[],currentRole:'STORE_MANAGER'};
  const wait=async(fn)=>{for(let i=0;i<100;i++){await act(async()=>new Promise(r=>setTimeout(r,10)));if(fn())return;}throw Error('UI timeout')};
  const click=async(text)=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent?.trim()===text);assert.ok(b,text);await act(async()=>b.click());};
  const setInput=async(input,value)=>act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
  await act(async()=>root.render(React.createElement(AdminDashboardClient,props)));await wait(()=>document.body.textContent.includes('Ürün & Katalog'));await click('Ürün & Katalog');await click('Yeni Ürün Ekle');
  await wait(()=>pendingCheck.length===1);assert.equal(document.querySelector('#product-source-url'),null);const name=document.querySelector('input[placeholder^="Örn: Gütermann"]');assert.ok(name);
  await act(async()=>pendingCheck.shift()(Response.json({success:true,allowed:false})));assert.equal(document.querySelector('#product-source-url'),null);
  await act(async()=>window.dispatchEvent(new dom.window.Event('focus')));await wait(()=>pendingCheck.length===1);await act(async()=>pendingCheck.shift()(Response.json({success:true,allowed:true})));
  await wait(()=>!!document.querySelector('#product-source-url'));await setInput(name,'Kaybolmayacak taslak');await setInput(document.querySelector('#product-source-url'),'https://example.com/product');await click('Ürünü getir');await wait(()=>pendingImport.length===1);
  await act(async()=>window.dispatchEvent(new dom.window.Event('focus')));await wait(()=>pendingCheck.length===1);await act(async()=>pendingCheck.shift()(Response.json({success:true,allowed:false})));
  assert.equal(document.querySelector('#product-source-url'),null);assert.equal(signal.aborted,true);assert.equal(name.value,'Kaybolmayacak taslak');
  await act(async()=>pendingImport.shift()(Response.json({success:true,data:{name:'Kaynak',description:'',sku:'',barcode:'',brand:'',category:'',images:[],warnings:[]}})));assert.equal(name.value,'Kaybolmayacak taslak');
  await act(async()=>window.dispatchEvent(new dom.window.Event('focus')));await wait(()=>pendingCheck.length===1);await act(async()=>pendingCheck.shift()(Response.json({success:false},{status:500})));assert.equal(document.querySelector('#product-source-url'),null);
  await act(async()=>root.unmount());
 }finally{globalThis.fetch=originalFetch;dom.window.close();}
});
