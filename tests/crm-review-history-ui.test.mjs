import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';

test('Değerlendirmeler elle açılır, süzülür, sayfalanır ve eski yanıtlardan korunur',async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://admin.example.test'});for(const key of ['window','document','navigator','self','localStorage'])Object.defineProperty(globalThis,key,{value:key==='self'?dom.window:dom.window[key],configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;const original=globalThis.fetch;let requests=[],selected=[];
 globalThis.fetch=(url,opts)=>new Promise(resolve=>requests.push({url,signal:opts.signal,resolve}));
 try{
  const {createRoot}=await import('react-dom/client');const {CrmDuplicateReviewHistory}=await import('../src/components/admin/CrmDuplicateReviewHistory.tsx');const root=createRoot(document.getElementById('root'));
  const props={customerId:1,disabled:false,refresh:0,onChoose:id=>selected.push(id)};
  const wait=async(fn)=>{for(let i=0;i<100;i++){await act(async()=>new Promise(r=>setTimeout(r,10)));if(fn())return;}throw Error('UI timeout')};
  const click=async(label)=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent?.trim()===label);assert.ok(b,label);await act(async()=>b.click());};
  const row=(id,name,status='UNSURE',stale=false)=>({customer:{id,name},status,revision:1,reviewedByName:'Personel',reviewedAt:1700000000,stale});
  const result=(data,page=1,hasMore=false)=>Response.json({success:true,data,pagination:{page,hasMore}});
  await act(async()=>root.render(React.createElement(CrmDuplicateReviewHistory,props)));assert.equal(requests.length,0);await click('Değerlendirmeleri göster');await wait(()=>requests.length===1);assert.match(requests[0].url,/duplicate-reviews\?page=1&status=/);
  await act(async()=>requests[0].resolve(result([row(2,'<Aday>', 'UNSURE',true)],1,true)));assert.match(document.body.textContent,/Karar verilemedi/);assert.match(document.body.textContent,/Kart alanları değişmiş/);assert.equal(document.querySelector('aday'),null);await click('Karşılaştırmaya seç');assert.deepEqual(selected,[2]);
  await click('Sonraki değerlendirmeler');await wait(()=>requests.length===2);assert.doesNotMatch(document.body.textContent,/<Aday>/);await act(async()=>requests[1].resolve(result([row(3,'Diğer','DISTINCT')],2,false)));assert.match(document.body.textContent,/Farklı kişiler olarak değerlendirildi/);
  const select=document.querySelector('#crm-review-history-filter');await act(async()=>{select.value='UNSURE';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});await wait(()=>requests.length===3);assert.match(requests[2].url,/page=1&status=UNSURE/);
  await act(async()=>root.render(React.createElement(CrmDuplicateReviewHistory,{...props,refresh:1})));await wait(()=>requests.length===4);assert.equal(requests[2].signal.aborted,true);
  await act(async()=>requests[2].resolve(result([row(4,'ESKİ YANIT')])));assert.doesNotMatch(document.body.textContent,/ESKİ YANIT/);await act(async()=>requests[3].resolve(result([row(5,'Güncel')])));assert.match(document.body.textContent,/Güncel/);
  await click('Değerlendirmeleri yenile');await wait(()=>requests.length===5);await act(async()=>requests[4].resolve(Response.json({success:false,error:'CRM yetkisi yok'},{status:403})));assert.match(document.body.textContent,/CRM yetkisi yok/);assert.doesNotMatch(document.body.textContent,/Güncel/);await act(async()=>root.unmount());
 }finally{globalThis.fetch=original;dom.window.close();}
});
