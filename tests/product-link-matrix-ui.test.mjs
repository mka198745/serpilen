import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';

test('Süper Admin rol matrisinde ürün linki yetkisini görür ve rol için kaydeder',async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://admin.example.test'});
 for(const key of ['window','document','navigator','self','localStorage'])Object.defineProperty(globalThis,key,{value:key==='self'?dom.window:dom.window[key],configurable:true});
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;const originalFetch=globalThis.fetch;let saved;
 globalThis.fetch=async(url,opts={})=>{
  if(url==='/api/role-matrix'&&opts.method==='POST'){saved=JSON.parse(opts.body).matrix;return Response.json({success:true,data:{matrix:saved}});}
  if(url==='/api/role-matrix')return Response.json({success:true,data:{matrix:{STORE_MANAGER:{catalog:true}}}});
  return Response.json({success:true,data:[]});
 };
 try{
  const {createRoot}=await import('react-dom/client');const {AdminDashboardClient}=await import('../src/app/admin/AdminDashboardClient.tsx');const root=createRoot(document.getElementById('root'));
  const props={products:[],categories:[],brands:[],warehouses:[],inventory:[],ledger:[],orders:[],suppliers:[],purchaseOrders:[],coupons:[],shifts:[],currentRole:'SUPER_ADMIN'};
  const wait=async(fn)=>{for(let i=0;i<100;i++){await act(async()=>new Promise(r=>setTimeout(r,10)));if(fn())return;}throw Error('UI timeout')};
  const click=async(text)=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent?.trim()===text);assert.ok(b,text);await act(async()=>b.click());};
  await act(async()=>root.render(React.createElement(AdminDashboardClient,props)));await wait(()=>document.body.textContent.includes('Rol Yetki Matrisi'));await click('Rol Yetki Matrisi');
  const row=[...document.querySelectorAll('tr')].find(x=>x.textContent.includes('productLinkImport'));assert.ok(row);assert.match(row.textContent,/Ürün Linki ile Bilgi Getirme/);
  const buttons=[...row.querySelectorAll('button')];assert.equal(buttons.length,4);assert.equal(buttons[0].disabled,true);assert.equal(buttons[1].disabled,false);assert.match(buttons[1].title,/Gizli/);
  await act(async()=>buttons[1].click());assert.match(buttons[1].title,/Görünür/);
  const deleteRow=[...document.querySelectorAll('tr')].find(x=>x.textContent.includes('productDelete'));assert.ok(deleteRow);assert.match(deleteRow.textContent,/Ürün Silme/);const deleteButtons=[...deleteRow.querySelectorAll('button')];assert.equal(deleteButtons[0].disabled,true);assert.match(deleteButtons[1].title,/Gizli/);await act(async()=>deleteButtons[1].click());
  await click('Tümünü Kaydet');await wait(()=>!!saved);
  assert.equal(saved.SUPER_ADMIN.productLinkImport,true);assert.equal(saved.STORE_MANAGER.productLinkImport,true);assert.equal(saved.STORE_MANAGER.catalog,true);assert.equal(saved.WAREHOUSE_KEEPER.productLinkImport,false);assert.equal(saved.STORE_MANAGER.productDelete,true);assert.equal(saved.WAREHOUSE_KEEPER.productDelete,false);assert.equal(saved.CASHIER.productDelete,false);
  await act(async()=>root.unmount());
 }finally{globalThis.fetch=originalFetch;dom.window.close();}
});
