import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';

test('AI yetki hatasında sohbet ve önceki müşteri sonucu temizlenir; gecikmiş yanıt geri getirilmez',async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://admin.example.test'});for(const key of ['window','document','navigator','self','localStorage'])Object.defineProperty(globalThis,key,{value:key==='self'?dom.window:dom.window[key],configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;dom.window.HTMLElement.prototype.scrollIntoView=()=>{};const original=globalThis.fetch;let deferred,waiting=false,denials=0;
 const payload={success:true,guardrail:'Test uyarısı',data:{headline:'GİZLİ MÜŞTERİ',insights:[],segments:[],churnRisk:[]}};
 globalThis.fetch=async(_url,init)=>{const {module}=JSON.parse(init.body);if(module==='crm_assistant'&&waiting)return new Promise(r=>{deferred=r});if(module==='crm_assistant')return Response.json(payload);denials++;return Response.json({success:false,error:{message:'Yetki kaldırıldı'}},{status:403});};
 try{const {createRoot}=await import('react-dom/client');const {AiAssistantCenter}=await import('../src/components/admin/AiAssistantCenter.tsx');const root=createRoot(document.getElementById('root'));await act(async()=>root.render(React.createElement(AiAssistantCenter,{products:[]})));
 const button=(text)=>[...document.querySelectorAll('button')].find(x=>x.textContent.includes(text));
 await act(async()=>button('CRM & Churn').click());assert.match(document.body.textContent,/GİZLİ MÜŞTERİ/);
 await act(async()=>button('AI Sohbet').click());await act(async()=>button('VIP müşterilerim').click());assert.match(document.body.textContent,/Yetki kaldırıldı/);await act(async()=>button('Analiz Modülleri').click());assert.doesNotMatch(document.body.textContent,/GİZLİ MÜŞTERİ/);
 waiting=true;await act(async()=>button('CRM & Churn').click());assert.ok(deferred);await act(async()=>button('AI Sohbet').click());await act(async()=>button('VIP müşterilerim')?.click()); // chat was cleared; send using form instead
 if(!document.body.textContent.includes('Yetki kaldırıldı')){const input=document.querySelector('input');const setter=Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set;await act(async()=>{setter.call(input,'RFM');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});await act(async()=>document.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));}
 assert.equal(denials,2);await act(async()=>deferred(Response.json(payload)));await act(async()=>button('Analiz Modülleri').click());assert.doesNotMatch(document.body.textContent,/GİZLİ MÜŞTERİ/);await act(async()=>root.unmount());
 }finally{globalThis.fetch=original;dom.window.close();}
});
