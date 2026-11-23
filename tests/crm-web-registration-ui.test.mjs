import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';

test('Web kayıt formu hataları ve belirsiz sonuçları gösterirken taslağı korur',async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://shop.example.test'});for(const key of ['window','document','navigator','self','localStorage','history'])Object.defineProperty(globalThis,key,{value:key==='self'?dom.window:dom.window[key],configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;const oldFetch=globalThis.fetch;let mode='duplicate',calls=0,resolvePending;
 globalThis.fetch=async(url)=>{if(url==='/api/auth/me')return Response.json({success:false},{status:401});if(url==='/api/auth/register'){calls++;if(mode==='duplicate')return Response.json({success:false,error:{code:'DUPLICATE',message:'Bu e-posta ile zaten bir üyelik var. Giriş yapmayı deneyin.'}},{status:409});if(mode==='network')throw Error('failed');if(mode==='html')return new Response('<html>gateway</html>',{status:502});if(mode==='broken')return Response.json({success:true});return new Promise(resolve=>{resolvePending=resolve;});}throw Error(`Unexpected ${url}`);};
 try{
  const {createRoot}=await import('react-dom/client');const {AuthProvider,useAuth}=await import('../src/context/AuthContext.tsx');const {AuthModal}=await import('../src/components/layout/AuthModal.tsx');const Open=()=>{const auth=useAuth();return React.createElement('button',{onClick:()=>auth.openAuth('register')},'Kaydı aç')};const root=createRoot(document.getElementById('root'));const wait=async(fn)=>{for(let i=0;i<100;i++){await act(async()=>{await new Promise(r=>setTimeout(r,10));});if(fn())return;}throw Error('UI timeout')};
  await act(async()=>root.render(React.createElement(AuthProvider,null,React.createElement(Open),React.createElement(AuthModal))));await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Kaydı aç').click());
  const set=async(ph,value)=>{const el=document.querySelector(`input[placeholder="${ph}"]`);assert.ok(el);await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});};
  await set('Ad Soyad','Deneme Kullanıcı');await set('E-posta','deneme@example.test');await set('Telefon (05__)','05321112233');await set('Şifre (min. 6)','sifre123');await set('Şifre (tekrar)','sifre123');const form=()=>document.querySelector('input[placeholder="Ad Soyad"]').closest('form');const submit=()=>act(async()=>form().dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
  await submit();await wait(()=>document.querySelector('[role=alert]')?.textContent.includes('zaten bir üyelik'));assert.equal(document.querySelector('input[placeholder="Ad Soyad"]').value,'Deneme Kullanıcı');
  mode='network';await submit();await wait(()=>document.querySelector('[role=alert]')?.textContent.includes('sonucu bilinmiyor'));assert.match(document.querySelector('[role=alert]').textContent,/giriş yapmayı deneyin/);
  mode='html';await submit();await wait(()=>document.querySelector('[role=alert]')?.textContent.includes('sonucu doğrulanamadı'));assert.equal(document.querySelector('input[placeholder="Telefon (05__)"]').value,'05321112233');
  mode='broken';await submit();await wait(()=>document.querySelector('[role=alert]')?.textContent.includes('sonucu doğrulanamadı'));
  mode='pending';await submit();await wait(()=>!!resolvePending);assert.equal(form().querySelector('button[type=submit]').disabled,true);const n=calls;await act(async()=>form().querySelector('button[type=submit]').click());assert.equal(calls,n);await act(async()=>resolvePending(Response.json({success:false,error:{message:'Tekrar deneyin.'}},{status:422})));await wait(()=>document.querySelector('[role=alert]')?.textContent.includes('Tekrar deneyin.'));
  await act(async()=>root.unmount());
 }finally{globalThis.fetch=oldFetch;dom.window.close();}
});
