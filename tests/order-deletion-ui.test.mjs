import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';

test('Sipariş silmede stok ve bağlı iadeler ayrı ayrı onaylanmadan işlem gönderilmez',async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://admin.example.test'});
 for(const key of ['window','document','navigator','self','localStorage'])Object.defineProperty(globalThis,key,{value:key==='self'?dom.window:dom.window[key],configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const original=globalThis.fetch;let deleted=false,body;
 const order={id:1,orderNumber:'O-1',orderType:'ONLINE_B2C',customerName:'M',grandTotal:20,status:'DELIVERED',paymentStatus:'PAID',items:[]};
 globalThis.fetch=async(url,opts={})=>{
  if(url==='/api/role-matrix')return Response.json({success:true,data:{matrix:{}}});
  if(url==='/api/orders')return Response.json({success:true,data:deleted?[]:[order]});
  if(url==='/api/order-deletion?kind=order&id=1')return Response.json({success:true,data:{kind:'order',id:1,number:'O-1',orderNumber:'O-1',returnCount:1,rights:{legacyReviewRequired:true,loyalty:{customerId:9,current:20,delta:-4,after:16},discounts:[{kind:'COUPON',id:8,name:'KUPON',current:2,after:1}]},fingerprint:'a'.repeat(64),stocks:[{warehouseId:1,warehouseName:'Ana',productId:1,productName:'Ürün',variantId:2,variantName:'Mavi',physical:5,reserved:1,delta:1,after:6}]}});
  if(url==='/api/order-deletion'&&opts.method==='DELETE'){body=JSON.parse(opts.body);deleted=true;return Response.json({success:true,data:{promoted:0}});}
  return Response.json({success:true,data:[]});
 };
 try{
  const {createRoot}=await import('react-dom/client');const {AdminDashboardClient}=await import('../src/app/admin/AdminDashboardClient.tsx');const root=createRoot(document.getElementById('root'));
  const props={products:[],categories:[],brands:[],warehouses:[],inventory:[],ledger:[],orders:[order],suppliers:[],purchaseOrders:[],coupons:[],shifts:[],currentRole:'SUPER_ADMIN'};
  const wait=async fn=>{for(let i=0;i<100;i++){await act(async()=>new Promise(r=>setTimeout(r,10)));if(fn())return;}throw Error('UI timeout');};
  await act(async()=>root.render(React.createElement(AdminDashboardClient,props)));await wait(()=>document.body.textContent.includes('Siparişler'));
  await act(async()=>[...document.querySelectorAll('button')].find(x=>/^Siparişler \(/.test(x.textContent.trim())).click());await wait(()=>document.body.textContent.includes('O-1'));
  await act(async()=>[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Sil').click());const dialog=document.querySelector('[role=dialog]');assert.ok(dialog);assert.match(dialog.textContent,/Ana/);assert.match(dialog.textContent,/Mavi/);assert.match(dialog.textContent,/1 sonuçlanmış iade/);
  const submit=[...dialog.querySelectorAll('button')].find(x=>x.textContent==='Kalıcı sil'),checks=dialog.querySelectorAll('input[type=checkbox]');assert.equal(submit.disabled,true);assert.equal(checks.length,4);assert.match(dialog.textContent,/otomatik kanıtlanamıyor/);assert.match(dialog.textContent,/20 puan → 16 puan/);assert.match(dialog.textContent,/KUPON/);
  await act(async()=>checks[0].click());assert.equal(submit.disabled,true);assert.equal(body,undefined);await act(async()=>checks[1].click());assert.equal(submit.disabled,true);await act(async()=>checks[2].click());assert.equal(submit.disabled,true);await act(async()=>checks[3].click());assert.equal(submit.disabled,false);await act(async()=>submit.click());
  assert.deepEqual(body,{kind:'order',id:1,fingerprint:'a'.repeat(64),physicalConfirmed:true,cascadeConfirmed:true,rightsConfirmed:true,legacyConfirmed:true});assert.equal(document.querySelector('[role=dialog]'),null);assert.match(document.body.textContent,/kalıcı olarak silindi/);await act(async()=>root.unmount());
 }finally{globalThis.fetch=original;dom.window.close();}
});

test('İadeler sekmesinde silme stok doğrulamasına bağlıdır',async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://admin.example.test'});
 for(const key of ['window','document','navigator','self','localStorage'])Object.defineProperty(globalThis,key,{value:key==='self'?dom.window:dom.window[key],configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;const original=globalThis.fetch;let deleted=false,body;
 const ret={id:5,returnNumber:'R-5',orderNumber:'O-1',items:[],restock:false,refundAmount:10,status:'REFUNDED'};
 globalThis.fetch=async(url,opts={})=>{
  if(url==='/api/role-matrix')return Response.json({success:true,data:{matrix:{}}});
  if(url==='/api/returns')return Response.json({success:true,data:deleted?[]:[ret]});
  if(url==='/api/order-deletion?kind=return&id=5')return Response.json({success:true,data:{kind:'return',id:5,number:'R-5',orderNumber:'O-1',returnCount:0,rights:{legacyReviewRequired:false,loyalty:null,discounts:[]},fingerprint:'b'.repeat(64),stocks:[]}});
  if(url==='/api/order-deletion'&&opts.method==='DELETE'){body=JSON.parse(opts.body);deleted=true;return Response.json({success:true,data:{promoted:0}});}
  return Response.json({success:true,data:[]});
 };
 try{
  const {createRoot}=await import('react-dom/client');const {AdminDashboardClient}=await import('../src/app/admin/AdminDashboardClient.tsx');const root=createRoot(document.getElementById('root'));
  const props={products:[],categories:[],brands:[],warehouses:[],inventory:[],ledger:[],orders:[],suppliers:[],purchaseOrders:[],coupons:[],shifts:[],currentRole:'SUPER_ADMIN'};
  const wait=async fn=>{for(let i=0;i<100;i++){await act(async()=>new Promise(r=>setTimeout(r,10)));if(fn())return;}throw Error('UI timeout');};
  await act(async()=>root.render(React.createElement(AdminDashboardClient,props)));await wait(()=>document.body.textContent.includes('Siparişler'));await act(async()=>[...document.querySelectorAll('button')].find(x=>/^Siparişler \(/.test(x.textContent.trim())).click());
  await act(async()=>[...document.querySelectorAll('button')].find(x=>/^İadeler \(/.test(x.textContent.trim())).click());await wait(()=>document.body.textContent.includes('R-5'));
  await act(async()=>[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Sil').click());const dialog=document.querySelector('[role=dialog]');assert.match(dialog.textContent,/R-5/);assert.match(dialog.textContent,/Terslenecek stok hareketi yok/);const submit=[...dialog.querySelectorAll('button')].find(x=>x.textContent==='Kalıcı sil');assert.equal(submit.disabled,true);
  await act(async()=>dialog.querySelector('input[type=checkbox]').click());await act(async()=>submit.click());assert.deepEqual(body,{kind:'return',id:5,fingerprint:'b'.repeat(64),physicalConfirmed:true,cascadeConfirmed:false,rightsConfirmed:false,legacyConfirmed:false});await act(async()=>root.unmount());
 }finally{globalThis.fetch=original;dom.window.close();}
});

test('Silme düğmesi Siparişler erişimi ve ayrı silme izni birlikte verilince görünür',async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://admin.example.test'});for(const key of ['window','document','navigator','self','localStorage'])Object.defineProperty(globalThis,key,{value:key==='self'?dom.window:dom.window[key],configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;const original=globalThis.fetch;let enabled=false;
 const order={id:1,orderNumber:'O-1',orderType:'ONLINE_B2C',customerName:'M',grandTotal:20,status:'DELIVERED',paymentStatus:'PAID',items:[]};
 globalThis.fetch=async(url)=>url==='/api/role-matrix'?Response.json({success:true,data:{matrix:{STORE_MANAGER:{orders:true,orderReturnDelete:enabled}}}}):url==='/api/orders'?Response.json({success:true,data:[order]}):Response.json({success:true,data:[]});
 try{const {createRoot}=await import('react-dom/client');const {AdminDashboardClient}=await import('../src/app/admin/AdminDashboardClient.tsx');const props={products:[],categories:[],brands:[],warehouses:[],inventory:[],ledger:[],orders:[order],suppliers:[],purchaseOrders:[],coupons:[],shifts:[],currentRole:'STORE_MANAGER'};
 for(const grant of [false,true]){enabled=grant;const root=createRoot(document.getElementById('root'));await act(async()=>root.render(React.createElement(AdminDashboardClient,props)));await act(async()=>new Promise(r=>setTimeout(r,50)));await act(async()=>[...document.querySelectorAll('button')].find(x=>/^Siparişler \(/.test(x.textContent.trim())).click());assert.equal([...document.querySelectorAll('button')].some(x=>x.textContent.trim()==='Sil'),grant);await act(async()=>root.unmount());}
 }finally{globalThis.fetch=original;dom.window.close();}
});
