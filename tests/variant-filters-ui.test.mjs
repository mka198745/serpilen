import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';

test('Varyant filtreleri bağımsız ve birlikte çalışır; depo yalnız ilgili stok satırını gösterir',async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://admin.example.test'});
 for(const key of ['window','document','navigator','self','localStorage'])Object.defineProperty(globalThis,key,{value:key==='self'?dom.window:dom.window[key],configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;const original=globalThis.fetch;
 globalThis.fetch=async(url)=>url==='/api/role-matrix'?Response.json({success:true,data:{matrix:{}}}):Response.json({success:true,data:[]});
 const variant=(id,color)=>({id,colorName:color,sku:`v${id}`,retailPrice:'10',isActive:true});
 const products=[
  {id:1,name:'İplik',sku:'P1',categoryId:1,brandId:1,isActive:true,variants:[variant(11,'Mavi'),variant(12,'Kırmızı')]},
  {id:2,name:'Düğme',sku:'P2',categoryId:2,brandId:2,isActive:false,variants:[variant(21,'mavi')]},
  {id:3,name:'Kurdele',sku:'P3',categoryId:1,brandId:null,isActive:true,variants:[variant(31,null)]},
 ];
 const inventory=[{id:1,productId:1,variantId:11,warehouseId:1,physicalQty:3,reservedQty:1},{id:2,productId:1,variantId:11,warehouseId:2,physicalQty:5,reservedQty:0},{id:3,productId:2,variantId:21,warehouseId:2,physicalQty:7,reservedQty:0}];
 const props={products,categories:[{id:1,name:'İplikler'},{id:2,name:'Düğmeler'}],brands:[{id:1,name:'Marka A'},{id:2,name:'Marka B'}],warehouses:[{id:1,name:'Ana'},{id:2,name:'Diğer',isActive:false}],inventory,ledger:[],orders:[],suppliers:[],purchaseOrders:[],coupons:[],shifts:[],currentRole:'SUPER_ADMIN'};
 try{
  const {createRoot}=await import('react-dom/client');const {AdminDashboardClient}=await import('../src/app/admin/AdminDashboardClient.tsx');const root=createRoot(document.getElementById('root'));
  await act(async()=>root.render(React.createElement(AdminDashboardClient,props)));await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Ürün & Katalog').click());await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Varyantlar').click());
  const section=document.querySelector('section[aria-label="Varyant tablosu filtreleri"]');assert.ok(section);const labels=[...section.querySelectorAll('label')];assert.deepEqual(labels.map(x=>x.firstChild.textContent),['Kategori','Marka','Ürün','Renk','Stok Yeri']);
  const controls=section.querySelectorAll('select'),rows=()=>[...document.querySelectorAll('table tbody tr')],texts=()=>rows().map(r=>r.textContent);
  const change=async(index,value)=>act(async()=>{controls[index].value=value;controls[index].dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
  const reset=async()=>act(async()=>[...section.querySelectorAll('button')].find(b=>b.textContent.includes('temizle')).click());
  assert.equal(rows().length,5);
  await change(0,'1');assert.equal(rows().length,4);assert.ok(texts().every(t=>!t.includes('Düğme')));await reset();
  await change(1,'2');assert.equal(rows().length,1);assert.match(texts()[0],/Düğme/);await reset();
  await change(2,'1');assert.equal(rows().length,3);assert.ok(texts().every(t=>t.includes('İplik')));await reset();
  assert.equal([...controls[3].options].filter(o=>o.value==='color:mavi').length,1);await change(3,'color:mavi');assert.equal(rows().length,3);assert.ok(texts().every(t=>/Mavi|mavi/.test(t)));await reset();
  await change(4,'2');assert.equal(rows().length,2);assert.ok(texts().every(t=>t.includes('Diğer')));assert.ok(texts().every(t=>!t.includes('Ana')));await reset();
  await change(4,'unassigned');assert.equal(rows().length,2);assert.ok(texts().every(t=>t.includes('Stok kaydı yok')));await reset();
  await change(1,'unassigned');assert.equal(rows().length,1);assert.match(texts()[0],/Kurdele/);await reset();
  await change(3,'unlabelled');assert.equal(rows().length,1);assert.match(texts()[0],/Kurdele/);await reset();
  await change(0,'1');await change(3,'color:mavi');await change(4,'2');assert.equal(rows().length,1);assert.match(texts()[0],/İplik.*Diğer/);assert.equal(rows()[0].querySelector('button').textContent,'Düzenle');
  await change(2,'2');assert.equal(rows().length,0);assert.match(document.querySelector('[role=status]').textContent,/uygun varyant bulunamadı/);assert.equal(controls[0].value,'1');assert.equal(controls[3].value,'color:mavi');
  await reset();assert.equal(rows().length,5);assert.ok([...controls].every(c=>c.value===''));await act(async()=>root.unmount());
 }finally{globalThis.fetch=original;dom.window.close();}
});
