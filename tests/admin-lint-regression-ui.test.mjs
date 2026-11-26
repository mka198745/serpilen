import test from 'node:test';
import assert from 'node:assert/strict';
import React, {act} from 'react';
import {JSDOM} from 'jsdom';

const props={products:[],categories:[],brands:[],warehouses:[],inventory:[],ledger:[],orders:[],suppliers:[],purchaseOrders:[],coupons:[],shifts:[]};
function globals(dom){for(const k of ['window','document','navigator','self','localStorage'])Object.defineProperty(globalThis,k,{value:k==='self'?dom.window:dom.window[k],configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;}
const click=async text=>{const button=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===text);assert.ok(button,text);await act(async()=>button.click());};

test('SSR sonrası kayıtlı menü ve bekleyen işlem korunur; tekrar aynı komutu gönderir',async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://admin.example.test'});globals(dom);const previous=globalThis.fetch;const command={action:'RETURN_TO_SUPPLIER',receiptId:4,lines:[{receiptItemId:9,qty:2}],reason:'Hasar',requestKey:'orijinal-anahtar'};localStorage.setItem('admin-sidebar-collapsed','1');localStorage.setItem('serpilen.purchasing.pending.v1',JSON.stringify(command));let sent;
 globalThis.fetch=async(url,options={})=>{if(url==='/api/role-matrix')return Response.json({success:true,data:{matrix:{}}});if(url==='/api/suppliers'&&options.method==='POST'){sent=JSON.parse(options.body);return Response.json({success:true,data:{id:11}});}if(url==='/api/suppliers')return Response.json({success:true,suppliers:[],purchaseOrders:[],receipts:[],suggestions:[],suggestionCount:0});return Response.json({success:true,data:[]});};
 try{const {renderToString}=await import('react-dom/server');const {hydrateRoot}=await import('react-dom/client');const {AdminDashboardClient}=await import('../src/app/admin/AdminDashboardClient.tsx');const element=React.createElement(AdminDashboardClient,{...props,currentRole:'SUPER_ADMIN'});document.getElementById('root').innerHTML=renderToString(element);const errors=[];let root;
 await act(async()=>{root=hydrateRoot(document.getElementById('root'),element,{onRecoverableError:e=>errors.push(e)});});assert.equal(errors.length,0);assert.equal(document.querySelector('aside').getAttribute('aria-hidden'),'true');assert.equal(localStorage.getItem('admin-sidebar-collapsed'),'1');await act(async()=>document.querySelector('[aria-label="Menüyü aç"]').click());assert.equal(localStorage.getItem('admin-sidebar-collapsed'),'0');
 await click('Satın Alma & Mal Kabul');assert.match(document.body.textContent,/Önceki mal kabul veya iadenin sonucu doğrulanmalı/);await click('Aynı işlemi tekrar sorgula');assert.deepEqual(sent,command);assert.equal(localStorage.getItem('serpilen.purchasing.pending.v1'),null);assert.doesNotMatch(document.body.textContent,/Önceki mal kabul veya iadenin sonucu doğrulanmalı/);await act(async()=>root.unmount());
 }finally{globalThis.fetch=previous;dom.window.close();}
});

test('Rol yetkisi kaldırılınca aktif sekme kapanır ve yetki geri verilince kendiliğinden açılmaz',async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://admin.example.test'});globals(dom);const previous=globalThis.fetch;
 globalThis.fetch=async(url)=>url==='/api/role-matrix'?Response.json({success:true,data:{matrix:{STORE_MANAGER:{catalog:true},CASHIER:{catalog:false}}}}):Response.json({success:true,data:[]});
 try{const {createRoot}=await import('react-dom/client');const {AdminDashboardClient}=await import('../src/app/admin/AdminDashboardClient.tsx');const root=createRoot(document.getElementById('root'));await act(async()=>root.render(React.createElement(AdminDashboardClient,{...props,currentRole:'STORE_MANAGER'})));await click('Ürün & Katalog');assert.ok([...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Yeni Ürün Ekle'));
 await act(async()=>root.render(React.createElement(AdminDashboardClient,{...props,currentRole:'CASHIER'})));assert.ok(![...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Yeni Ürün Ekle'));
 await act(async()=>root.render(React.createElement(AdminDashboardClient,{...props,currentRole:'STORE_MANAGER'})));assert.ok(![...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Yeni Ürün Ekle'));await act(async()=>root.unmount());
 }finally{globalThis.fetch=previous;dom.window.close();}
});
