import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';

test('Ürün satırından yalnız ilgili varyant düzenlenir, gizlenen fiyatlar korunur',async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://admin.example.test'});for(const k of ['window','document','navigator','self','localStorage'])Object.defineProperty(globalThis,k,{value:k==='self'?dom.window:dom.window[k],configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;const previous=globalThis.fetch;
 const v=(id,color,buyPrice,retailPrice)=>({id,productId:1,colorName:color,colorHex:'',size:'',length:'',sku:`SKU-${id}`,barcode:'',imageUrl:'',buyPrice,retailPrice,isActive:true,physicalQty:5,reservedQty:0,availableQty:5});
 let variants=[v(11,'Mavi','3.25','11.50'),v(22,'Yeşil','','19.75')];
 const product=()=>({id:1,name:'İplik',sku:'P-1',slug:'iplik',categoryId:1,brandId:5,hasVariants:true,isActive:true,buyPrice:'6.00',retailPrice:'15.00',unit:'Adet',variants});
 const inventory=variants.map((v,i)=>({id:i+1,productId:1,variantId:v.id,warehouseId:5,physicalQty:5,reservedQty:0}));let attempts=[],rejectOnce=true;
 const preview=()=>({productId:1,productName:'İplik',warehouseId:5,warehouses:[{id:5,name:'Ortak'}],fingerprint:'a'.repeat(64),variants});
 globalThis.fetch=async(url,opts={})=>{
  if(url==='/api/role-matrix')return Response.json({success:true,data:{matrix:{}}});
  if(String(url).startsWith('/api/product-variant-edit?id=1'))return Response.json({success:true,data:preview()});
  if(url==='/api/product-variant-edit'&&opts.method==='PATCH'){const body=JSON.parse(opts.body);attempts.push(body);if(rejectOnce){rejectOnce=false;return Response.json({success:false,error:'Varyant değişti; yenileyin.'},{status:409});}variants=variants.map(row=>row.id===body.variantId?{...row,...body.variants[0]}:row);return Response.json({success:true,data:{promoted:0}});}
  if(url==='/api/products?scope=all-warehouses')return Response.json({success:true,data:[product()]});
  if(url==='/api/inventory')return Response.json({success:true,inventory,recentLedger:[],salesWarehouseId:5});
  return Response.json({success:true,data:[]});
 };
 try{
  const {createRoot}=await import('react-dom/client');const {AdminDashboardClient}=await import('../src/app/admin/AdminDashboardClient.tsx');const root=createRoot(document.getElementById('root'));
  const props={products:[product()],categories:[{id:1,name:'İplik'}],brands:[{id:5,name:'Alize'}],warehouses:[{id:5,name:'Ortak'}],inventory,initialSalesWarehouseId:5,ledger:[],orders:[],suppliers:[],purchaseOrders:[],coupons:[],shifts:[],currentRole:'SUPER_ADMIN'};
  const click=async label=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===label);assert.ok(button,label);await act(async()=>button.click());};
  const openRow=async index=>{const rows=[...document.querySelectorAll('table tbody tr')];await act(async()=>[...rows[index].querySelectorAll('button')].find(b=>b.textContent.includes('Ürünü düzenle')).click());};
  const closeProduct=async()=>{const h=[...document.querySelectorAll('h3')].find(x=>x.textContent==='Ürün Düzenle');await act(async()=>h.parentElement.querySelector('button').click());};
  await act(async()=>root.render(React.createElement(AdminDashboardClient,props)));await click('Ürün & Katalog');await openRow(1);
  let section=document.querySelector('section[aria-label="Varyant düzenleme"]');assert.equal(section.querySelectorAll('fieldset').length,1);assert.equal(section.querySelector('fieldset input').value,'Yeşil');assert.ok(![...section.querySelectorAll('input')].some(input=>input.value==='Mavi'));assert.doesNotMatch(section.textContent,/Alış fiyatı \(boş olabilir\)|Perakende fiyatı/);assert.match(document.body.textContent,/Değiştirdiğiniz ana ürün alış ve perakende fiyatları/);
  const field=section.querySelector('fieldset input');await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(field,'Bordo');field.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
  await click('Varyantı ve seçili depo stoğunu kaydet');assert.match(section.textContent,/Varyant değişti/);assert.equal(attempts.length,1);assert.equal(attempts[0].variantId,22);assert.deepEqual(attempts[0].variants.map(v=>v.id),[22]);assert.equal(attempts[0].variants[0].buyPrice,'');assert.equal(attempts[0].variants[0].retailPrice,'19.75');assert.equal(variants[0].colorName,'Mavi');assert.equal(variants[1].colorName,'Yeşil');
  await click('Varyantı ve seçili depo stoğunu kaydet');assert.equal(attempts.length,2);assert.equal(variants[0].colorName,'Mavi');assert.equal(variants[0].retailPrice,'11.50');assert.equal(variants[1].colorName,'Bordo');assert.equal(variants[1].retailPrice,'19.75');await closeProduct();
  await openRow(0);section=document.querySelector('section[aria-label="Varyant düzenleme"]');assert.equal(section.querySelectorAll('fieldset').length,1);assert.equal(section.querySelector('fieldset input').value,'Mavi');await closeProduct();
  await click('Varyantlar');const row=document.querySelector('table tbody tr');await act(async()=>row.querySelector('button').click());const dialog=document.querySelector('[role=dialog]');assert.match(dialog.textContent,/Alış fiyatı \(boş olabilir\)/);assert.match(dialog.textContent,/Perakende fiyatı/);assert.equal(dialog.querySelectorAll('fieldset').length,1);await act(async()=>dialog.querySelector('[aria-label="Varyant düzenlemeyi kapat"]').click());await act(async()=>root.unmount());
 }finally{globalThis.fetch=previous;dom.window.close();}
});
