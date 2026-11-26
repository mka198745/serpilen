import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';

test('Müşteri raporu yetkisiz durumda açıklanır, CSV kapanır ve eski yanıtlar yeniden gösterilmez', async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://admin.example.test'});
 for(const key of ['window','document','navigator','self','localStorage'])Object.defineProperty(globalThis,key,{value:key==='self'?dom.window:dom.window[key],configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const oldFetch=globalThis.fetch;const pending=[];let csvRequests=0;
 const base={success:true,period:{orderCount:1},sales:{today:10,revenue:10,discounts:0,byChannel:[],dailySeries:[]},products:{},stock:{},finance:{}};
 const visible={total:1,newCount:0,activeCount:1,passiveCount:0,vipCount:0,top:[{name:'Gizli Müşteri',segment:'YENİ',orderCount:1,totalSpend:10,avgBasket:10,lastOrderDaysAgo:0,activity:'AKTİF'}]};
 globalThis.fetch=async(url,opts={})=>{if(url==='/api/role-matrix')return Response.json({success:true,data:{matrix:{CASHIER:{reports:true,crm:false},STORE_MANAGER:{reports:true,crm:true}}}});if(String(url).startsWith('/api/reports?')&&!String(url).includes('format=csv'))return new Promise(resolve=>pending.push(resolve));if(String(url).includes('format=csv'))csvRequests++;return Response.json({success:true,data:[]});};
 try {
  const {createRoot}=await import('react-dom/client');const {AdminDashboardClient}=await import('../src/app/admin/AdminDashboardClient.tsx');const root=createRoot(document.getElementById('root'));
  const props={products:[],categories:[],brands:[],warehouses:[],inventory:[],ledger:[],orders:[],suppliers:[],purchaseOrders:[],coupons:[],shifts:[]};
  const wait=async(fn)=>{for(let i=0;i<100;i++){await act(async()=>{await new Promise(r=>setTimeout(r,10));});if(fn())return;}throw Error('UI timeout');};
  const click=async(label)=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===label);assert.ok(b,label);await act(async()=>b.click());};
  await act(async()=>root.render(React.createElement(AdminDashboardClient,{...props,currentRole:'CASHIER'})));await wait(()=>[...document.querySelectorAll('button')].some(x=>x.textContent.trim()==='Raporlar & Analitik'));
  await click('Raporlar & Analitik');await wait(()=>pending.length===1);await act(async()=>pending.shift()(Response.json({...base,customers:null})));await click('Müşteri');
  assert.match(document.body.textContent,/Raporlar ve CRM erişim yetkileri birlikte gerekir/);let csv=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='CSV İndir');assert.equal(csv.disabled,true);assert.doesNotMatch(document.body.textContent,/Gizli Müşteri/);
  await act(async()=>root.render(React.createElement(AdminDashboardClient,{...props,currentRole:'STORE_MANAGER'})));await wait(()=>pending.length===1);await act(async()=>pending.shift()(Response.json({...base,customers:visible})));assert.match(document.body.textContent,/Gizli Müşteri/);csv=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='CSV İndir');assert.equal(csv.disabled,false);
  // An earlier privileged response arriving after a role change must not restore its data.
  await click('7 Gün');await wait(()=>pending.length===1);const stale=pending.shift();await act(async()=>root.render(React.createElement(AdminDashboardClient,{...props,currentRole:'CASHIER'})));await wait(()=>pending.length===1);const fresh=pending.shift();await act(async()=>fresh(Response.json({...base,customers:null})));await act(async()=>stale(Response.json({...base,customers:visible})));
  assert.doesNotMatch(document.body.textContent,/Gizli Müşteri/);assert.match(document.body.textContent,/Raporlar ve CRM erişim yetkileri birlikte gerekir/);assert.equal([...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='CSV İndir').disabled,true);assert.equal(csvRequests,0);
  await act(async()=>root.unmount());
 }finally{globalThis.fetch=oldFetch;dom.window.close();}
});
