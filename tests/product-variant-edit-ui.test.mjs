import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
test('Varyant ekranı seçili depo, stok onayı ve ayrı kaydetme akışını gösterir',async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://admin.example.test'});for(const key of ['window','document','navigator','self','localStorage'])Object.defineProperty(globalThis,key,{value:key==='self'?dom.window:dom.window[key],configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;const original=globalThis.fetch;let body,dirty=false,saved=0;
 const preview={productId:1,productName:'Ürün',warehouseId:1,warehouses:[{id:1,name:'Ana'},{id:2,name:'Diğer'}],fingerprint:'a'.repeat(64),variants:[{id:1,colorName:'Mavi',colorHex:'',size:'',length:'',buyPrice:'',retailPrice:'10',sku:'v1',barcode:'',imageUrl:'',isActive:true,physicalQty:0,reservedQty:0,availableQty:0}]};
 globalThis.fetch=async(url,opts={})=>{if(url.startsWith('/api/product-variant-edit?id='))return Response.json({success:true,data:preview});if(url==='/api/product-variant-edit'&&opts.method==='PATCH'){body=JSON.parse(opts.body);return Response.json({success:true,data:{promoted:0}});}throw Error('unexpected request '+url);};
 try{const {createRoot}=await import('react-dom/client');const {EditProductVariants}=await import('../src/components/admin/EditProductVariants.tsx');const root=createRoot(document.getElementById('root'));
 await act(async()=>root.render(React.createElement(EditProductVariants,{productId:1,onSaved:async()=>{saved++;},onDirtyChange:v=>{dirty=v;},onBusyChange:()=>{}})));
 assert.match(document.body.textContent,/Ana/);assert.match(document.body.textContent,/Mevcut fiili: 0/);assert.match(document.body.textContent,/ayrıca kaydedilir/);
 const field=document.querySelector('input[type=number]'),setter=Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set;
 await act(async()=>{setter.call(field,'5');field.dispatchEvent(new dom.window.Event('input',{bubbles:true}));field.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
 assert.equal(dirty,true);const submit=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Varyantları ve seçili'));assert.equal(submit.disabled,false);
 await act(async()=>submit.click());assert.equal(body,undefined);assert.match(document.body.textContent,/kontrolünü onaylayın/);
 await act(async()=>document.querySelector('input[type=checkbox]').click());await act(async()=>submit.click());assert.equal(body.variants[0].physicalQty,5);assert.equal(body.warehouseId,1);assert.equal(body.physicalConfirmed,true);assert.equal(saved,1);assert.equal(dirty,false);await act(async()=>root.unmount());
 }finally{globalThis.fetch=original;dom.window.close();}
});
