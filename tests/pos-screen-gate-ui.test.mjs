import test from 'node:test';import assert from 'node:assert/strict';import React,{act} from 'react';import {JSDOM,VirtualConsole} from 'jsdom';
test('POS ayrılınca grant iptal edilir ve gecikmiş PIN yanıtı ekranı açmaz',async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://shop.test/pos',virtualConsole:new VirtualConsole()});for(const key of ['window','document','navigator','self','localStorage'])Object.defineProperty(globalThis,key,{value:key==='self'?dom.window:dom.window[key],configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 let resolveUnlock;const calls=[],oldFetch=globalThis.fetch;
 globalThis.fetch=async(url,opts={})=>{calls.push({url,opts});if(url==='/api/auth/me')return Response.json({success:true,data:{user:{id:1,name:'Ayşe',role:'CASHIER',isStaff:true}}});if(url==='/api/pos/access'&&JSON.parse(opts.body).action==='UNLOCK')return new Promise(r=>resolveUnlock=r);return Response.json({success:true});};
 try{const {createRoot}=await import('react-dom/client');const {AuthProvider}=await import('../src/context/AuthContext.tsx');const {PosScreenGate}=await import('../src/app/pos/PosScreenGate.tsx');const root=createRoot(document.getElementById('root'));
 await act(async()=>{root.render(React.createElement(AuthProvider,null,React.createElement(PosScreenGate)));await new Promise(r=>setTimeout(r,10));});
 const input=document.querySelector('input');await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,'123456');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
 await act(async()=>{document.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));});assert.ok(resolveUnlock);
 await act(async()=>root.unmount());await act(async()=>{resolveUnlock(Response.json({success:true,data:{grant:'a'.repeat(64)}}));await new Promise(r=>setTimeout(r,0));});
 const locks=calls.filter(c=>c.url==='/api/pos/access'&&JSON.parse(c.opts.body).action==='LOCK');assert.equal(locks.length,1);assert.equal(locks[0].opts.keepalive,true);assert.equal(calls.filter(c=>c.url==='/api/pos/bootstrap').length,0);
 }finally{globalThis.fetch=oldFetch;dom.window.close();}
});

test('POS etkileşimi süreyi uzatır; 60 saniye hareketsizlikte grant kilitlenir',async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://shop.test/pos',virtualConsole:new VirtualConsole()});for(const key of ['window','document','navigator','self','localStorage'])Object.defineProperty(globalThis,key,{value:key==='self'?dom.window:dom.window[key],configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const oldFetch=globalThis.fetch,oldNow=Date.now,oldSetInterval=globalThis.setInterval,oldClearInterval=globalThis.clearInterval;let now=100000,tick;const calls=[];
 Date.now=()=>now;globalThis.setInterval=fn=>{tick=fn;return 1};globalThis.clearInterval=()=>{};
 globalThis.fetch=async(url,opts={})=>{calls.push({url,opts});if(url==='/api/auth/me')return Response.json({success:true,data:{user:{id:1,name:'Ayşe',role:'CASHIER',isStaff:true}}});if(url==='/api/pos/access')return Response.json({success:true,data:{grant:'a'.repeat(64)}});if(url==='/api/pos/bootstrap')return Response.json({success:true,data:{products:[],categories:[],shift:null,cashierName:'Ayşe'}});return Response.json({success:true});};
 try{const {createRoot}=await import('react-dom/client');const {AuthProvider}=await import('../src/context/AuthContext.tsx');const {PosScreenGate}=await import('../src/app/pos/PosScreenGate.tsx');const root=createRoot(document.getElementById('root'));
 await act(async()=>{root.render(React.createElement(AuthProvider,null,React.createElement(PosScreenGate)));await new Promise(r=>setTimeout(r,10));});const input=document.querySelector('input');await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,'123456');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});await act(async()=>{document.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,10));});assert.match(document.body.textContent,/Kasiyer: Ayşe/);
 const actions=()=>calls.filter(c=>c.url==='/api/pos/access').map(c=>JSON.parse(c.opts.body).action);
 now+=59000;await act(async()=>tick());assert.deepEqual(actions(),['UNLOCK']);await act(async()=>window.dispatchEvent(new dom.window.Event('keydown')));assert.deepEqual(actions(),['UNLOCK','TOUCH']);now+=59000;await act(async()=>tick());assert.deepEqual(actions(),['UNLOCK','TOUCH']);now+=1000;await act(async()=>tick());assert.deepEqual(actions(),['UNLOCK','TOUCH','LOCK']);await act(async()=>root.unmount());
 }finally{Date.now=oldNow;globalThis.setInterval=oldSetInterval;globalThis.clearInterval=oldClearInterval;globalThis.fetch=oldFetch;dom.window.close();}
});
