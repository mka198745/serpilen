import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';

test('Varyant tablosu filtrelenmiş depo satırlarını 20’şer sayfalar, son sayfa silinince geri döner',async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://admin.example.test'});
 for(const key of ['window','document','navigator','self','localStorage'])Object.defineProperty(globalThis,key,{value:key==='self'?dom.window:dom.window[key],configurable:true});
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;const original=globalThis.fetch;dom.window.confirm=()=>true;
 const variant=(id)=>({id,productId:id,colorName:`Renk ${id}`,sku:`V-${id}`,barcode:'',buyPrice:'1',retailPrice:'2',isActive:true});
 let products=Array.from({length:40},(_,index)=>{const id=index+1;return {id,name:`Ürün ${id}`,sku:`P-${id}`,slug:`p-${id}`,categoryId:id<=25?1:2,brandId:id<=25?1:2,hasVariants:true,isActive:true,variants:[variant(id)]};});
 const inventory=[{id:1,productId:1,variantId:1,warehouseId:1,physicalQty:4,reservedQty:4},{id:2,productId:1,variantId:1,warehouseId:2,physicalQty:2,reservedQty:0}];
 let editedId,deletedId;
 globalThis.fetch=async(url,opts={})=>{
  if(url==='/api/role-matrix')return Response.json({success:true,data:{matrix:{}}});
  if(String(url).startsWith('/api/product-variant-edit?id=')){const id=Number(String(url).split('=')[1]);editedId=id;return Response.json({success:true,data:{productId:id,productName:`Ürün ${id}`,warehouseId:1,warehouses:[{id:1,name:'Ana'}],fingerprint:'a'.repeat(64),variants:[{...variant(id),physicalQty:0,reservedQty:0,availableQty:0}]}});}
  if(String(url).startsWith('/api/variant-deletion?id=')){const id=Number(String(url).split('=')[1]);return Response.json({success:true,data:{id,productId:id,productName:`Ürün ${id}`,variantName:`Renk ${id}`,sku:`V-${id}`,totalStock:0,lastVariant:true,baseRetailPrice:'2',baseCampaignPrice:null,stocks:[],baseStocks:[],fingerprint:'b'.repeat(64)}});}
  if(url==='/api/variant-deletion'&&opts.method==='DELETE'){deletedId=JSON.parse(opts.body).id;products=products.map(p=>p.id===deletedId?{...p,variants:[],hasVariants:false}:p);return Response.json({success:true,data:{promoted:0}});}
  if(url==='/api/products?scope=all-warehouses')return Response.json({success:true,data:products});
  if(url==='/api/inventory')return Response.json({success:true,inventory,recentLedger:[],salesWarehouseId:1});
  return Response.json({success:true,data:[]});
 };
 try{
  const {createRoot}=await import('react-dom/client');const {AdminDashboardClient}=await import('../src/app/admin/AdminDashboardClient.tsx');const root=createRoot(document.getElementById('root'));
  const props={products,categories:[{id:1,name:'Kategori 1'},{id:2,name:'Kategori 2'}],brands:[{id:1,name:'Marka 1'},{id:2,name:'Marka 2'}],warehouses:[{id:1,name:'Ana'},{id:2,name:'Diğer'}],inventory,initialSalesWarehouseId:1,ledger:[],orders:[],suppliers:[],purchaseOrders:[],coupons:[],shifts:[],currentRole:'SUPER_ADMIN'};
  const click=async label=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===label);assert.ok(button,label);await act(async()=>button.click());};
  const nav=()=>document.querySelector('nav[aria-label="Varyant tablosu sayfalama"]'),rows=()=>[...document.querySelectorAll('table tbody tr')];
  const setFilter=async(label,value)=>{const select=[...document.querySelectorAll('section[aria-label="Varyant tablosu filtreleri"] label')].find(l=>l.textContent.startsWith(label)).querySelector('select');await act(async()=>{select.value=value;select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});};
  await act(async()=>root.render(React.createElement(AdminDashboardClient,props)));await click('Ürün & Katalog');await click('Varyantlar');
  assert.equal(rows().length,20);assert.match(nav().textContent,/1–20 \/ 41 satır · Sayfa 1 \/ 3/);assert.equal(nav().querySelectorAll('button')[0].disabled,true);assert.match(rows()[0].textContent,/Ürün 1.*Ana/);assert.match(rows()[1].textContent,/Ürün 1.*Diğer/);assert.match(rows()[19].textContent,/Ürün 19/);
  await click('Sonraki →');assert.equal(rows().length,20);assert.match(rows()[0].textContent,/Ürün 20/);assert.match(rows()[19].textContent,/Ürün 39/);assert.match(nav().textContent,/21–40 \/ 41 satır · Sayfa 2 \/ 3/);
  await act(async()=>rows()[0].querySelector('button').click());assert.equal(editedId,20);assert.equal(document.querySelector('[role=dialog] fieldset input').value,'Renk 20');await act(async()=>document.querySelector('[aria-label="Varyant düzenlemeyi kapat"]').click());
  // Filtering is applied to the full dataset, and starts again from page one.
  await setFilter('Kategori','1');assert.equal(rows().length,20);assert.match(nav().textContent,/1–20 \/ 26 satır · Sayfa 1 \/ 2/);await click('Sonraki →');assert.equal(rows().length,6);assert.match(rows()[5].textContent,/Ürün 25/);
  await setFilter('Marka','2');assert.equal(rows().length,0);assert.match(document.body.textContent,/Filtrelere uygun varyant bulunamadı/);assert.match(nav().textContent,/0 \/ 0 satır · Sayfa 1 \/ 1/);assert.ok([...nav().querySelectorAll('button')].every(b=>b.disabled));
  await click('Filtreleri temizle');assert.equal(rows().length,20);assert.match(nav().textContent,/1–20 \/ 41 satır/);
  await setFilter('Stok Yeri','2');assert.equal(rows().length,1);assert.match(rows()[0].textContent,/Ürün 1.*Diğer/);await click('Filtreleri temizle');
  await click('Sonraki →');await click('Sonraki →');assert.equal(rows().length,1);assert.match(rows()[0].textContent,/Ürün 40/);assert.match(nav().textContent,/41–41 \/ 41 satır · Sayfa 3 \/ 3/);assert.equal(nav().querySelectorAll('button')[1].disabled,true);
  await act(async()=>rows()[0].querySelectorAll('button')[1].click());assert.equal(deletedId,40);assert.equal(rows().length,20);assert.match(rows()[0].textContent,/Ürün 20/);assert.match(rows()[19].textContent,/Ürün 39/);assert.match(nav().textContent,/21–40 \/ 40 satır · Sayfa 2 \/ 2/);assert.equal(nav().querySelectorAll('button')[1].disabled,true);
  await click('← Önceki');assert.match(nav().textContent,/1–20 \/ 40 satır/);await act(async()=>root.unmount());
 }finally{globalThis.fetch=original;dom.window.close();}
});
