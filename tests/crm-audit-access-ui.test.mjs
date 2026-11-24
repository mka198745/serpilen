import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';

test('Denetim paneli yetki hatasında eski veriyi temizler ve hatayı gösterir',async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://admin.example.test'});for(const key of ['window','document','navigator','self','localStorage'])Object.defineProperty(globalThis,key,{value:key==='self'?dom.window:dom.window[key],configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;const original=globalThis.fetch;let denied=false;
 globalThis.fetch=async()=>denied?Response.json({success:false,error:{message:'Yetkiniz bulunmuyor'}},{status:403}):Response.json({success:true,data:[{id:1,createdAt:'2026-01-01T00:00:00Z',userName:'Personel',action:'TEST',entity:'Customer',entityId:'1',details:'GİZLİ MÜŞTERİ',ipAddress:null}]});
 try{const {createRoot}=await import('react-dom/client');const {AuditLogPanel}=await import('../src/components/admin/AuditLogPanel.tsx');const root=createRoot(document.getElementById('root'));await act(async()=>root.render(React.createElement(AuditLogPanel)));assert.match(document.body.textContent,/GİZLİ MÜŞTERİ/);assert.match(document.body.textContent,/değiştirilemezliği garanti edilmez/);denied=true;await act(async()=>[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Yenile')).click());assert.doesNotMatch(document.body.textContent,/GİZLİ MÜŞTERİ/);assert.match(document.body.textContent,/Yetkiniz bulunmuyor/);assert.doesNotMatch(document.body.textContent,/Henüz denetim kaydı yok/);await act(async()=>root.unmount());
 }finally{globalThis.fetch=original;dom.window.close();}
});

test('Sekmeden çıkıldığında gecikmiş yanıt eski paneli güncellemez',async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://admin.example.test'});for(const key of ['window','document','navigator','self','localStorage'])Object.defineProperty(globalThis,key,{value:key==='self'?dom.window:dom.window[key],configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;const original=globalThis.fetch;let resolve;
 globalThis.fetch=()=>new Promise(r=>{resolve=r});
 try{const {createRoot}=await import('react-dom/client');const {AuditLogPanel}=await import('../src/components/admin/AuditLogPanel.tsx');const root=createRoot(document.getElementById('root'));await act(async()=>root.render(React.createElement(AuditLogPanel)));assert.ok(resolve);await act(async()=>root.render(React.createElement('div',null,'Başka sekme')));await act(async()=>resolve(Response.json({success:true,data:[{id:1,details:'GİZLİ MÜŞTERİ'}]})));assert.doesNotMatch(document.body.textContent,/GİZLİ MÜŞTERİ/);await act(async()=>root.unmount());
 }finally{globalThis.fetch=original;dom.window.close();}
});
