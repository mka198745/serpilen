import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';

test('ortak depo paneli seçimi ve açık işlem hatasını gösterir',async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://admin.example.test'});
 for(const key of ['window','document','navigator','self','localStorage'])Object.defineProperty(globalThis,key,{value:key==='self'?dom.window:dom.window[key],configurable:true});
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;dom.window.confirm=()=>true;const previous=globalThis.fetch;let selected=null,block=true,posted=[];
 globalThis.fetch=async(url,opts={})=>{
  if(url==='/api/role-matrix')return Response.json({success:true,data:{matrix:{}}});
  if(url==='/api/warehouses/sales-warehouse'){
   if(opts.method==='POST'){const body=JSON.parse(opts.body);posted.push(body);if(block)return Response.json({success:false,error:'Açık POS vardiyası var.'},{status:409});selected=body.warehouseId;return Response.json({success:true,data:{id:selected,changed:true}});}
   return Response.json({success:true,data:{warehouseId:selected}});
  }
  if(url==='/api/inventory')return Response.json({success:true,inventory:[],recentLedger:[]});
  return Response.json({success:true,data:[]});
 };
 try{
  const {createRoot}=await import('react-dom/client');const {AdminDashboardClient}=await import('../src/app/admin/AdminDashboardClient.tsx');const root=createRoot(document.getElementById('root'));
  const props={products:[],categories:[],brands:[],warehouses:[{id:2,name:'Mağaza',code:'M',isActive:true},{id:3,name:'Online',code:'O',isActive:true}],inventory:[],ledger:[],orders:[],suppliers:[],purchaseOrders:[],coupons:[],shifts:[],currentRole:'SUPER_ADMIN'};
  const wait=async(fn)=>{for(let i=0;i<100;i++){await act(async()=>new Promise(r=>setTimeout(r,10)));if(fn())return;}throw Error('UI timeout');};
  const click=async(text)=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===text);assert.ok(b,text);await act(async()=>b.click());};
  await act(async()=>root.render(React.createElement(AdminDashboardClient,props)));await wait(()=>document.body.textContent.includes('Çoklu Depo & WMS'));await click('Çoklu Depo & WMS');await click('Depolar (2)');
  assert.match(document.body.textContent,/Henüz seçilmedi/);assert.match(document.body.textContent,/stokları taşımaz/);
  const select=document.querySelector('select[aria-label="Ortak satış deposu"]');await act(async()=>{select.value='2';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
  await click('Ortak depoyu kaydet');await wait(()=>document.body.textContent.includes('Açık POS vardiyası var.'));assert.deepEqual(posted,[{warehouseId:2}]);
  block=false;await click('Ortak depoyu kaydet');await wait(()=>document.body.textContent.includes('POS + online ortak depo'));assert.match(document.body.textContent,/Diğer depolardaki stoklar taşınmadı/);
  const row=[...document.querySelectorAll('tr')].find(x=>x.textContent.includes('Mağaza'));assert.equal([...row.querySelectorAll('button')].find(x=>x.textContent.trim()==='Sil').disabled,true);
  await act(async()=>root.unmount());
 } finally{globalThis.fetch=previous;dom.window.close();}
});
