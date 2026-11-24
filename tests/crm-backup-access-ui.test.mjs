import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';

test('Veritabanı ekranı yetki hatasında eski yedek bilgisini gizler ve yedeklemeyi kapatır',async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://admin.example.test'});for(const key of ['window','document','navigator','self','localStorage'])Object.defineProperty(globalThis,key,{value:key==='self'?dom.window:dom.window[key],configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;const original=globalThis.fetch;let denied=false;
 globalThis.fetch=async()=>denied?Response.json({success:false,error:{message:'Veritabanı ve yedek işlemleri yalnız Süper Admin içindir.'}},{status:403}):Response.json({success:true,data:{engine:'SQLite',driver:'sqlite',orm:'Drizzle',journalMode:'wal',integrity:'ok',path:'/private/test.db',sizeBytes:42,tableCount:1,totalRows:1,tables:[],backups:[{name:'tuhafiye-test.db',createdAt:'2026-01-01',sizeBytes:42,tables:0,integrity:'ok'}]}});
 try{const {createRoot}=await import('react-dom/client');const {SiteManagement}=await import('../src/components/admin/SiteManagement.tsx');const root=createRoot(document.getElementById('root'));await act(async()=>root.render(React.createElement(SiteManagement,{tab:'database'})));for(let i=0;i<100&&!document.body.textContent.includes('tuhafiye-test.db');i++)await act(async()=>new Promise(r=>setTimeout(r,10)));assert.match(document.body.textContent,/tuhafiye-test.db/);
  denied=true;const refresh=[...document.querySelectorAll('button')].find(x=>x.textContent?.trim()==='Yenile');assert.ok(refresh);await act(async()=>refresh.click());for(let i=0;i<100&&!document.body.textContent.includes('yalnız Süper Admin içindir');i++)await act(async()=>new Promise(r=>setTimeout(r,10)));assert.doesNotMatch(document.body.textContent,/tuhafiye-test.db|\/private\/test.db/);const backup=[...document.querySelectorAll('button')].find(x=>x.textContent?.trim()==='Yedek Oluştur');assert.ok(backup?.disabled);await act(async()=>root.unmount());
 }finally{globalThis.fetch=original;dom.window.close();}
});
