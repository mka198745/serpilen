import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';

const stock=(id,productId,variantId,warehouseId,physicalQty,reservedQty=0)=>({id,productId,variantId,warehouseId,physicalQty,reservedQty});
const variant=(id,color,extra={})=>({id,colorName:color,colorHex:'',size:'',length:'',sku:`V-${id}`,barcode:`B-${id}`,buyPrice:'4.50',retailPrice:'9.75',imageUrl:'',isActive:true,...extra});
const mkProps=()=>({products:[
 {id:1,name:'İplik',sku:'P-1',slug:'iplik',categoryId:1,brandId:7,hasVariants:true,isActive:true,unit:'Adet',retailPrice:'10',buyPrice:'5',variants:[variant(11,'Mavi'),variant(12,'Kırmızı'),variant(13,'Siyah'),variant(14,'Yeşil',{isActive:false})]},
 {id:2,name:'Düğme',sku:'P-2',slug:'dugme',categoryId:2,brandId:null,hasVariants:false,isActive:true,unit:'Paket',retailPrice:'20',buyPrice:'11',variants:[]},
 {id:3,name:'Tükenen',sku:'P-3',slug:'tukenen',categoryId:1,brandId:7,hasVariants:true,isActive:true,unit:'Adet',retailPrice:'4',buyPrice:'1',variants:[variant(31,'Beyaz')]},
 ],categories:[{id:1,name:'İplikler'},{id:2,name:'Düğmeler'}],brands:[{id:7,name:'Seçilen Marka'}],warehouses:[{id:5,name:'Mağaza'},{id:6,name:'Diğer Depo'}],initialSalesWarehouseId:5,
 inventory:[stock(1,1,11,5,4,4),stock(2,1,12,5,0),stock(3,1,12,6,7),stock(4,1,13,6,3),stock(5,1,14,5,2),stock(6,2,null,5,3,1),stock(7,2,null,6,5,0),stock(8,3,31,5,0)],ledger:[],orders:[],suppliers:[],purchaseOrders:[],coupons:[],shifts:[],currentRole:'SUPER_ADMIN'});
function setup(){const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://admin.example.test'});for(const k of ['window','document','navigator','self','localStorage'])Object.defineProperty(globalThis,k,{value:k==='self'?dom.window:dom.window[k],configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;return dom;}
const click=async label=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===label);assert.ok(b,label);await act(async()=>b.click());};
const rows=()=>[...document.querySelectorAll('table tbody tr')];

test('Ürün tablosu yalnız ortak depoda fiili stoğu olan varyantları kendi fiyat ve miktarıyla gösterir',async()=>{
 const dom=setup(),previous=globalThis.fetch,props=mkProps();let latest=props.inventory;
 const preview={productId:1,productName:'İplik',warehouseId:5,warehouses:[{id:5,name:'Mağaza'}],fingerprint:'a'.repeat(64),variants:props.products[0].variants.map(v=>({...v,physicalQty:v.id===11?4:0,reservedQty:v.id===11?4:0,availableQty:0}))};
 globalThis.fetch=async(url)=>{if(url==='/api/role-matrix')return Response.json({success:true,data:{matrix:{}}});if(url==='/api/inventory')return Response.json({success:true,inventory:latest,recentLedger:[],salesWarehouseId:5});if(String(url).startsWith('/api/product-variant-edit?id='))return Response.json({success:true,data:preview});return Response.json({success:true,data:[]});};
 try{const {createRoot}=await import('react-dom/client');const {AdminDashboardClient}=await import('../src/app/admin/AdminDashboardClient.tsx');const root=createRoot(document.getElementById('root'));await act(async()=>root.render(React.createElement(AdminDashboardClient,props)));await click('Ürün & Katalog');
 assert.deepEqual([...document.querySelectorAll('table th')].map(h=>h.textContent),['Marka','Ürün','Renk','Kategori','Fiyatlar','Stok','Durum','İşlem']);assert.equal(rows().length,3);const [mavi,yesil,single]=rows();assert.match(mavi.textContent,/Seçilen Marka.*İplik.*V-11.*Mavi.*İplikler.*9.75 TL.*4.50 TL.*4 Adet.*Fiili.*Ayrılmış: 4/s);assert.match(yesil.textContent,/Yeşil.*Varyant: Pasif/s);assert.match(single.textContent,/Düğme.*Düğmeler.*7 Paket.*Tüm depolar · Kullanılabilir/s);assert.doesNotMatch(document.querySelector('table').textContent,/Kırmızı|Siyah|Beyaz|Tükenen/);
 assert.ok(mavi.querySelector('button[aria-label="İplik ürününü sil"]'));assert.match(mavi.textContent,/Varyantı düzenle.*Ürünü düzenle.*Ürünü sil/s);await act(async()=>mavi.querySelector('button[aria-label="İplik Mavi varyantını düzenle"]').click());const dialog=document.querySelector('[role=dialog]');assert.equal(dialog.querySelectorAll('fieldset').length,1);assert.equal(dialog.querySelector('fieldset input').value,'Mavi');await act(async()=>dialog.querySelector('[aria-label="Varyant düzenlemeyi kapat"]').click());
 const search=document.querySelector('input[placeholder^="Ad, SKU"]'),setter=Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set;const setSearch=async value=>act(async()=>{setter.call(search,value);search.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});await setSearch('yeşil');assert.equal(rows().length,1);assert.match(rows()[0].textContent,/Yeşil/);await setSearch('B-11');assert.equal(rows().length,1);assert.match(rows()[0].textContent,/Mavi/);await setSearch('Kırmızı');assert.equal(rows().length,0);await setSearch('');
 const selects=document.querySelectorAll('select');await act(async()=>{selects[0].value='2';selects[0].dispatchEvent(new dom.window.Event('change',{bubbles:true}));});assert.equal(rows().length,1);assert.match(rows()[0].textContent,/Düğme/);await act(async()=>{selects[0].value='ALL';selects[0].dispatchEvent(new dom.window.Event('change',{bubbles:true}));});await act(async()=>{selects[1].value='7';selects[1].dispatchEvent(new dom.window.Event('change',{bubbles:true}));});assert.equal(rows().length,2);
 latest=latest.map(s=>s.id===1?{...s,physicalQty:0,reservedQty:0}:s.id===2?{...s,physicalQty:8}:s);await click('Stokları yenile');assert.equal(rows().length,2);assert.match(rows()[0].textContent,/Kırmızı/);assert.doesNotMatch(document.querySelector('table').textContent,/Mavi/);await act(async()=>root.unmount());
 }finally{globalThis.fetch=previous;dom.window.close();}
});

test('Depo seçilmemişse tahmin edilmez; yeni depo ve eski yanıt yarışı güvenle yönetilir',async()=>{
 const dom=setup(),previous=globalThis.fetch,props=mkProps();props.initialSalesWarehouseId=null;let pending=[];globalThis.fetch=async url=>url==='/api/role-matrix'?Response.json({success:true,data:{matrix:{}}}):url==='/api/inventory'?new Promise(resolve=>pending.push(resolve)):Response.json({success:true,data:[]});
 try{const {createRoot}=await import('react-dom/client');const {AdminDashboardClient}=await import('../src/app/admin/AdminDashboardClient.tsx');const root=createRoot(document.getElementById('root'));await act(async()=>root.render(React.createElement(AdminDashboardClient,props)));await click('Ürün & Katalog');assert.equal(rows().length,1);assert.match(document.body.textContent,/Ortak satış deposu seçilmediğinden varyantlar gösterilemiyor/);assert.equal(pending.length,1);
 await click('Stokları yenile');assert.equal(pending.length,2);await act(async()=>pending[1](Response.json({success:true,inventory:props.inventory,recentLedger:[],salesWarehouseId:6})));assert.equal(rows().length,3);assert.match(rows()[0].textContent,/Kırmızı/);assert.match(rows()[1].textContent,/Siyah/);
 await act(async()=>pending[0](Response.json({success:true,inventory:props.inventory,recentLedger:[],salesWarehouseId:5})));assert.match(rows()[0].textContent,/Kırmızı/);assert.match(document.body.textContent,/Diğer Depo — fiili stoğu olanlar/);
 await click('Stokları yenile');await act(async()=>pending[2](Response.json({success:false},{status:500})));assert.match(document.body.textContent,/Stok yenilenemedi/);assert.match(rows()[0].textContent,/Kırmızı/);await act(async()=>root.unmount());
 }finally{globalThis.fetch=previous;dom.window.close();}
});
