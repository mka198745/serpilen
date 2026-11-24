import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';

test('Ek sipariş ürünleri istekle sayfalanır ve yetki hatasında gizlenir',async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://admin.example.test'});
 for(const key of ['window','document','navigator','self','localStorage'])Object.defineProperty(globalThis,key,{value:key==='self'?dom.window:dom.window[key],configurable:true});
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;const original=globalThis.fetch;let calls=[],deny=false;
 globalThis.fetch=async(url,opts)=>{calls.push({url,signal:opts.signal});const page=Number(new URL(url,'https://admin.example.test').searchParams.get('page'));if(deny)return Response.json({success:false,error:'CRM yetkisi yok'},{status:403});return Response.json({success:true,data:[{productName:`Ürün ${page}`,variantName:null,quantity:1,totalPrice:'5'}],pagination:{hasMore:page===5}});};
 try{
  const {createRoot}=await import('react-dom/client');const {CrmOrderExtraItems}=await import('../src/components/admin/CrmOrderExtraItems.tsx');const root=createRoot(document.getElementById('root'));
  const wait=async(fn)=>{for(let i=0;i<100;i++){await act(async()=>new Promise(r=>setTimeout(r,10)));if(fn())return;}throw Error('UI timeout')};
  const click=async(label)=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent?.trim()===label);assert.ok(b,label);await act(async()=>b.click());};
  await act(async()=>root.render(React.createElement(CrmOrderExtraItems,{customerId:7,orderId:11})));assert.equal(calls.length,0);
  await click('200. üründen sonraki ürünleri göster');await wait(()=>document.body.textContent.includes('Ürün 5'));assert.equal(calls[0].url,'/api/crm/customers/7/orders/11/items?page=5');
  await click('Sonraki ek ürünler');await wait(()=>document.body.textContent.includes('Ürün 6'));assert.ok(!document.body.textContent.includes('Ürün 5'));assert.equal(calls[1].url,'/api/crm/customers/7/orders/11/items?page=6');
  deny=true;await click('Önceki ek ürünler');await wait(()=>document.body.textContent.includes('CRM yetkisi yok'));assert.ok(!document.body.textContent.includes('Ürün 6'));
  deny=false;await click('Tekrar dene');await wait(()=>document.body.textContent.includes('Ürün 5'));await act(async()=>root.unmount());assert.equal(calls.at(-1).signal.aborted,true);
 }finally{globalThis.fetch=original;dom.window.close();}
});
