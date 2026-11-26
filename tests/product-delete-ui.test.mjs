import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';

test('Ürün silme onayı, hata bildirimi ve başarılı tablo güncellemesi',async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://admin.example.test'});
 for(const key of ['window','document','navigator','self','localStorage'])Object.defineProperty(globalThis,key,{value:key==='self'?dom.window:dom.window[key],configurable:true});
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;const original=globalThis.fetch;let ok=false,calls=0,confirm=false;
 dom.window.confirm=()=>confirm;
 globalThis.fetch=async(url,opts={})=>{
  if(url==='/api/role-matrix')return Response.json({success:true,data:{matrix:{}}});
  if(url==='/api/products'&&opts.method==='DELETE'){calls++;assert.deepEqual(JSON.parse(opts.body),{id:1});return Response.json(ok?{success:true,data:{id:1}}:{success:false,error:'Ürünün stok veya rezervasyonu var; silinemez.'},{status:ok?200:409});}
  return Response.json({success:true,data:[]});
 };
 try{
  const {createRoot}=await import('react-dom/client');const {AdminDashboardClient}=await import('../src/app/admin/AdminDashboardClient.tsx');const root=createRoot(document.getElementById('root'));
  const prod={id:1,name:'Deneme',sku:'D1',slug:'deneme',categoryId:1,brandId:1,retailPrice:'10',buyPrice:'5',unit:'Adet',totalAvailable:0,variants:[],isActive:true};
  const props={products:[prod],categories:[{id:1,name:'Diğer'}],brands:[{id:1,name:'Marka'}],warehouses:[],inventory:[],ledger:[],orders:[],suppliers:[],purchaseOrders:[],coupons:[],shifts:[],currentRole:'SUPER_ADMIN'};
  const wait=async fn=>{for(let i=0;i<100;i++){await act(async()=>{await new Promise(r=>setTimeout(r,10));});if(fn())return;}throw Error('timeout');};
  await act(async()=>root.render(React.createElement(AdminDashboardClient,props)));await wait(()=>document.body.textContent.includes('Ürün & Katalog'));
  await act(async()=>[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Ürün & Katalog').click());
  const button=()=>document.querySelector('button[aria-label="Deneme ürününü sil"]');assert.ok(button());
  await act(async()=>button().click());assert.equal(calls,0);assert.ok(button());
  confirm=true;await act(async()=>button().click());assert.equal(calls,1);assert.ok(button());assert.match(document.body.textContent,/stok veya rezervasyonu/);
  ok=true;await act(async()=>button().click());assert.equal(calls,2);assert.equal(button(),null);assert.match(document.body.textContent,/ürünü silindi/);
  await act(async()=>root.unmount());
 }finally{globalThis.fetch=original;dom.window.close();}
});

test('Ürün silme düğmesi yalnız kaydedilmiş katalog ve silme yetkilerine sahip rolde görünür',async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://admin.example.test'});
 for(const key of ['window','document','navigator','self','localStorage'])Object.defineProperty(globalThis,key,{value:key==='self'?dom.window:dom.window[key],configurable:true});
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;const original=globalThis.fetch;let matrix={STORE_MANAGER:{catalog:true}};
 globalThis.fetch=async(url)=>url==='/api/role-matrix'?Response.json({success:true,data:{matrix}}):Response.json({success:true,data:[]});
 try{
  const {createRoot}=await import('react-dom/client');const {AdminDashboardClient}=await import('../src/app/admin/AdminDashboardClient.tsx');
  const prod={id:1,name:'Deneme',sku:'D1',slug:'deneme',categoryId:1,retailPrice:'10',buyPrice:'5',unit:'Adet',totalAvailable:0,variants:[],isActive:true};
  const props={products:[prod],categories:[],brands:[],warehouses:[],inventory:[],ledger:[],orders:[],suppliers:[],purchaseOrders:[],coupons:[],shifts:[],currentRole:'STORE_MANAGER'};
  for(const [grant,visible] of [[undefined,false],[false,false],[true,true]]){
   matrix={STORE_MANAGER:{catalog:true,...(grant===undefined?{}:{productDelete:grant})}};
   const root=createRoot(document.getElementById('root'));
   await act(async()=>root.render(React.createElement(AdminDashboardClient,props)));await act(async()=>new Promise(r=>setTimeout(r,30)));
   await act(async()=>[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Ürün & Katalog').click());
   assert.equal(!!document.querySelector('button[aria-label="Deneme ürününü sil"]'),visible);
   await act(async()=>root.unmount());
  }
 }finally{globalThis.fetch=original;dom.window.close();}
});
