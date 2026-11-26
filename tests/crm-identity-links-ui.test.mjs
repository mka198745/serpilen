import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';

test('Müşteri profilindeki bağlantılar mevcut ilişkilere göre gösterilir',async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://admin.example.test'});for(const key of ['window','document','navigator','localStorage'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;const oldFetch=globalThis.fetch;const calls=[];
 const customer=id=>({id,name:`Müşteri ${id}`,email:null,phone:'5551234567',type:'B2C',segment:'YENİ',city:null,loyaltyPoints:0,createdAt:1700000000,orderCount:0,paidOrderTotal:0,lastOrderAt:null});
 const links={activeWebAccounts:1,inactiveWebAccounts:1,unknownWebAccounts:0,otherRoleAccounts:1,onlineOrders:4,posOrders:3,otherOrders:0};
 globalThis.fetch=async(url,opts={})=>{calls.push({url,method:opts.method||'GET'});if(String(url).startsWith('/api/crm/customers?'))return Response.json({success:true,data:[customer(1),customer(2)],pagination:{total:2},metrics:null});if(url==='/api/crm/tags')return Response.json({success:true,data:[]});if(url==='/api/crm/customers/1'||url==='/api/crm/customers/2'){const id=url.endsWith('1')?1:2;return Response.json({success:true,data:{customer:customer(id),...(id===1?{identityLinks:links}:{}),editVersion:'v1',orders:[],notes:[],tags:[],timeline:[],summary:{orderCount:0,paidOrderTotal:0,firstOrderAt:null,lastOrderAt:null}}});}return Response.json({success:true,data:[],pagination:{total:0,page:1}});};
 try {
  const {createRoot}=await import('react-dom/client');const {CustomerCRM}=await import('../src/components/admin/CustomerCRM.tsx');const root=createRoot(document.getElementById('root'));
  const wait=async(fn)=>{for(let i=0;i<100;i++){await act(async()=>{await new Promise(r=>setTimeout(r,10));});if(fn())return;}throw Error('UI timeout');};
  await act(async()=>root.render(React.createElement(CustomerCRM,{canWrite:false})));await wait(()=>document.body.textContent.includes('Müşteri 1'));const open=[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()==='Profili aç');assert.equal(open.length,2);await act(async()=>open[0].click());await wait(()=>!!document.querySelector('[aria-label="Müşteri kimliği ve bağlantılar"]'));
  const section=document.querySelector('[aria-label="Müşteri kimliği ve bağlantılar"]');assert.match(section.textContent,/Aktif web üyeliği1/);assert.match(section.textContent,/Pasif web üyeliği1/);assert.match(section.textContent,/Online sipariş4/);assert.match(section.textContent,/POS siparişi3/);assert.match(section.textContent,/yetkili personel ayrıca incelemelidir/);assert.match(section.textContent,/sıfır sonuç bunların bulunmadığını kanıtlamaz/);assert.equal(section.querySelectorAll('button').length,0);
  const back=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Müşterilere dön');await act(async()=>back.click());await wait(()=>[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()==='Profili aç').length===2);await act(async()=>[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()==='Profili aç')[1].click());await wait(()=>document.body.textContent.includes('Bağlantı sayıları alınamadı'));
  assert.doesNotMatch(document.querySelector('[aria-label="Müşteri kimliği ve bağlantılar"]').textContent,/Online sipariş4/);assert.ok(calls.every(c=>c.method==='GET'));
  await act(async()=>root.unmount());
 }finally{globalThis.fetch=oldFetch;dom.window.close();}
});
