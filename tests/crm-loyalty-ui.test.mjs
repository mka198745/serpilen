import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';

test('Sadakat ekranı CRM ve sistem ayarı sınırlarını ve gerçek kayıt sonucunu gösterir',async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://admin.example.test'});for(const key of ['window','document','navigator','localStorage'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;localStorage.setItem('ipek_auth_token','test-session-token');
 const keys=['loyalty.earn_rate_tl','loyalty.earn_points','loyalty.point_value_tl','loyalty.expire_days'];const settings={'loyalty.earn_rate_tl':'100','loyalty.earn_points':'10','loyalty.point_value_tl':'0.5','loyalty.expire_days':'365','reservation.minutes':'15','shipping.free_threshold':'1000'};let responseOk=false,posted=[];const oldFetch=globalThis.fetch;
 globalThis.fetch=async(url,opts={})=>{if(url==='/api/loyalty'&&opts.method==='POST'){posted.push({headers:new Headers(opts.headers),body:JSON.parse(opts.body)});return responseOk?Response.json({success:true}):Response.json({success:false,error:'Ayarlar kaydedilemedi.'},{status:403});}if(url==='/api/loyalty')return Response.json({success:true,settings,settingsWriteKeys:keys,crmAllowed:false,members:null,transactions:null});return Response.json({success:true,data:[]});};
 try {
  const {createRoot}=await import('react-dom/client');const {MarketingCenter}=await import('../src/components/admin/MarketingCenter.tsx');const root=createRoot(document.getElementById('root'));
  const wait=async(fn)=>{for(let i=0;i<100;i++){await act(async()=>{await new Promise(r=>setTimeout(r,10));});if(fn())return;}throw Error('UI timeout');};
  const click=async(label)=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===label);assert.ok(button,label);await act(async()=>button.click());};
  await act(async()=>root.render(React.createElement(MarketingCenter,{categories:[],brands:[]})));await click('Sadakat & Ayarlar');await wait(()=>document.body.textContent.includes('CRM okuma yetkisi gerekir'));
  const inputFor=label=>[...document.querySelectorAll('label')].find(l=>l.textContent===label)?.parentElement.querySelector('input');assert.equal(inputFor('Stok rezervasyon süresi (dk)').disabled,true);assert.equal(inputFor('Ücretsiz kargo eşiği (TL)').disabled,true);const points=inputFor('→ kazanılan puan');assert.equal(points.disabled,false);
  await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(points,'20');points.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
  await click('Ayarları Kaydet');await wait(()=>document.body.textContent.includes('Ayarlar kaydedilemedi.'));assert.doesNotMatch(document.body.textContent,/Ayarlar kaydedildi\./);assert.equal(posted[0].headers.get('authorization'),'Bearer test-session-token');assert.deepEqual(Object.keys(posted[0].body.settings).sort(),[...keys].sort());assert.equal(posted[0].body.settings['loyalty.earn_points'],'20');
  responseOk=true;await click('Ayarları Kaydet');await wait(()=>document.body.textContent.includes('Ayarlar kaydedildi.'));assert.equal(posted.length,2);assert.match(document.body.textContent,/CRM okuma yetkisi gerekir/);
  await act(async()=>root.unmount());
 }finally{globalThis.fetch=oldFetch;dom.window.close();}
});
