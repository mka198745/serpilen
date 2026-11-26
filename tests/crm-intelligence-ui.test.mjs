import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';

test('Müşteri analizindeki erişim hatası panelde görünür ve yenilemeyle güncellenir',async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://admin.example.test'});for(const key of ['window','document','navigator','localStorage'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;localStorage.setItem('ipek_auth_token','test-token');let allowed=false,requests=[];const oldFetch=globalThis.fetch;
 globalThis.fetch=async(url,opts={})=>{requests.push({url,authorization:new Headers(opts.headers).get('authorization')});if(url==='/api/intelligence/customers/rfm'&&allowed)return Response.json({success:true,data:{periodDays:365,churnDays:90,kpis:{},segments:[],rows:[{customerId:1,customerName:'Yetkili müşteri',recencyDays:2,frequency:1,rScore:1,fScore:1,mScore:1,segment:'Yeni',monetary:10}],churnRisk:[],notes:[]}});return Response.json({success:false,error:{message:'Bu müşteri analizi için Intelligence Center ve CRM okuma yetkileri birlikte gerekir.'}},{status:403});};
 try{
  const {createRoot}=await import('react-dom/client');const {IntelligenceCenter}=await import('../src/components/admin/intelligence/IntelligenceCenter.tsx');const root=createRoot(document.getElementById('root'));
  const wait=async(fn)=>{for(let i=0;i<100;i++){await act(async()=>{await new Promise(r=>setTimeout(r,10));});if(fn())return;}throw Error('UI timeout');};const click=async(label)=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===label);assert.ok(b,label);await act(async()=>b.click());};
  await act(async()=>root.render(React.createElement(IntelligenceCenter)));await click('RFM');await wait(()=>!!document.querySelector('[role=alert]'));assert.match(document.querySelector('[role=alert]').textContent,/CRM okuma yetkileri birlikte gerekir/);assert.doesNotMatch(document.body.textContent,/Yetkili müşteri/);
  await click('Cohort');await wait(()=>requests.some(r=>r.url==='/api/intelligence/customers/cohorts'));assert.match(document.querySelector('[role=alert]').textContent,/CRM okuma yetkileri birlikte gerekir/);
  allowed=true;await click('RFM');await wait(()=>document.body.textContent.includes('Yetkili müşteri'));assert.ok(requests.filter(r=>r.url==='/api/intelligence/customers/rfm').every(r=>r.authorization==='Bearer test-token'));
  await act(async()=>root.unmount());
 }finally{globalThis.fetch=oldFetch;dom.window.close();}
});
