import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';

test('Kart karşılaştırması yeni sayımları ve uyarıları gösterir; yalnız GET yapar',async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://admin.example.test'});for(const key of ['window','document','navigator','localStorage'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 let requests=[];const oldFetch=globalThis.fetch;
 const counts={accounts:1,orders:1,orderItems:3,orderStatusEvents:2,returns:1,returnItems:1,mismatchedLoyaltyOrders:1,foreignLoyaltyForOrders:0,legacyNotePresent:1,accountTransactions:0,loyaltyTransactions:0,notes:2,editedNotes:1,tags:2,rfmScores:2,duplicateReviews:3};
 const card=id=>({customer:{id,name:'<Deneme>',email:null,phone:'5555555555',companyName:null,balance:'0',loyaltyPoints:0,isBlocked:0},counts});
 globalThis.fetch=async(url,opts)=>{requests.push({url,method:opts?.method||'GET'});return Response.json({success:true,data:{source:card(1),target:card(2),comparison:{sharedTags:1,sharedRfmPeriods:2,fieldConflicts:['taxNumber','creditLimit']}},versions:{source:'a'.repeat(64),target:'b'.repeat(64)},review:null});};
 try {
  const {createRoot}=await import('react-dom/client');const {CrmMergePreview}=await import('../src/components/admin/CrmMergePreview.tsx');const root=createRoot(document.getElementById('root'));
  await act(async()=>root.render(React.createElement(CrmMergePreview,{customerId:1})));const input=document.querySelector('input[placeholder="Örn. 25"]');
  await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,'2');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
  await act(async()=>document.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
  assert.match(document.body.textContent,/ortak etiketi: 1/);assert.match(document.body.textContent,/Ortak RFM dönemi: 2/);assert.match(document.body.textContent,/Her iki kartta bağlı hesap var/);assert.match(document.body.textContent,/Düzenlenmiş not1/);assert.match(document.body.textContent,/Aday değerlendirmesi3/);assert.match(document.body.textContent,/Sipariş ürün satırı3/);assert.match(document.body.textContent,/Uyuşmayan puan-sipariş1/);assert.match(document.body.textContent,/Eski kart notuVar/);assert.match(document.body.textContent,/Vergi numarası, Kredi limiti/);assert.match(document.body.textContent,/bağlantılarında uyuşmazlık var/);assert.match(document.body.textContent,/Birleştirme işlemi henüz kullanıma açık değil/);assert.equal(document.querySelector('deneme'),null);
  assert.equal(requests.length,1);assert.match(requests[0].url,/merge-preview\?target=2/);assert.equal(requests[0].method,'GET');
  await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,'3');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});assert.doesNotMatch(document.body.textContent,/Bağlantı ve çakışma incelemesi/);
  await act(async()=>root.unmount());
 }finally{globalThis.fetch=oldFetch;dom.window.close();}
});
