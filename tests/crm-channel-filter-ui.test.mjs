import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';

test('CRM kanal filtresi sayfayı sıfırlar, diğer filtreleri korur ve özet bağlamını gösterir',async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://admin.example.test'});for(const key of ['window','document','navigator','localStorage'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;const oldFetch=globalThis.fetch;const requests=[];
 const customer=id=>({id,name:`Müşteri ${id}`,email:null,phone:'5551234567',type:'B2C',segment:'YENİ',city:null,loyaltyPoints:0,createdAt:1700000000,orderCount:0,paidOrderTotal:0,lastOrderAt:null});const metrics=n=>({customerCount:n,registeredCount:0,paidCustomers:0,repeatCustomers:0,paidOrderCount:0,paidOrderTotal:0,averagePaidOrder:null});
 globalThis.fetch=async(url,opts={})=>{requests.push({url:String(url),method:opts.method||'GET'});if(String(url)==='/api/crm/tags')return Response.json({success:true,data:[]});if(String(url).startsWith('/api/crm/customers?')){const p=new URL(String(url),'https://admin.example.test').searchParams;const channel=p.get('channel');const data=channel==='both'?[]:[customer(p.get('page')==='2'?2:1)];const total=channel==='both'?0:channel?1:25;return Response.json({success:true,data,metrics:metrics(total),pagination:{total}});}return Response.json({success:true,data:[]});};
 try{
  const {createRoot}=await import('react-dom/client');const {CustomerCRM}=await import('../src/components/admin/CustomerCRM.tsx');const root=createRoot(document.getElementById('root'));const wait=async(fn)=>{for(let i=0;i<100;i++){await act(async()=>{await new Promise(r=>setTimeout(r,10));});if(fn())return;}throw Error('UI timeout')};
  await act(async()=>root.render(React.createElement(CustomerCRM,{canWrite:false})));await wait(()=>!!document.querySelector('#crm-channel-filter'));assert.match(document.body.textContent,/ödeme ve durumuna bakmadan/);assert.match(document.body.textContent,/başka kanaldaki siparişlerle karşılanabilir/);assert.match(document.body.textContent,/tüm kanallardaki siparişlerini/);
  await act(async()=>document.querySelector('[aria-label="Sonraki sayfa"]').click());await wait(()=>document.body.textContent.includes('Sayfa 2 · 25 kayıt'));
  const change=async(selector,value)=>{const el=document.querySelector(selector);assert.ok(el);await act(async()=>{el.value=value;el.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});};
  await change('#crm-channel-filter','online');await wait(()=>document.body.textContent.includes('Sayfa 1 · 1 kayıt'));let p=new URL(requests.filter(x=>x.url.startsWith('/api/crm/customers?')).at(-1).url,'https://admin.example.test').searchParams;assert.equal(p.get('page'),'1');assert.equal(p.get('channel'),'online');assert.equal(document.querySelector('#crm-channel-filter').value,'online');assert.match(document.querySelector('[aria-label="CRM özet göstergeleri"]').textContent,/Seçili arama ve filtreler/);
  await change('#crm-purchase-filter','once');await wait(()=>document.querySelector('#crm-purchase-filter')?.value==='once');p=new URL(requests.filter(x=>x.url.startsWith('/api/crm/customers?')).at(-1).url,'https://admin.example.test').searchParams;assert.equal(p.get('purchase'),'once');assert.equal(p.get('channel'),'online');
  await change('#crm-channel-filter','both');await wait(()=>document.body.textContent.includes('Bu arama veya sayfada müşteri bulunamadı.'));assert.doesNotMatch(document.body.textContent,/Henüz müşteri kartı yok/);assert.equal(document.querySelector('#crm-purchase-filter').value,'once');
  await change('#crm-channel-filter','');await wait(()=>document.querySelector('#crm-channel-filter')?.value==='');p=new URL(requests.filter(x=>x.url.startsWith('/api/crm/customers?')).at(-1).url,'https://admin.example.test').searchParams;assert.equal(p.get('channel'),'');assert.equal(p.get('purchase'),'once');assert.ok(requests.every(x=>x.method==='GET'));
  await act(async()=>root.unmount());
 }finally{globalThis.fetch=oldFetch;dom.window.close();}
});
