import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';

test('Marka kategorileri eklenir, düzenlenir ve ürün seçiminde ilgili markalar önce görünür',async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://admin.example.test'});
 for(const key of ['window','document','navigator','self','localStorage'])Object.defineProperty(globalThis,key,{value:key==='self'?dom.window:dom.window[key],configurable:true});
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;const original=globalThis.fetch, requests=[];
 globalThis.fetch=async(url,opts={})=>{
  if(url==='/api/brands'){const body=JSON.parse(opts.body);requests.push(body);return Response.json({success:true,existed:opts.method==='POST',data:{id:1,name:body.name,slug:'marka',isActive:true,categoryIds:body.categoryIds}});}
  if(url==='/api/role-matrix')return Response.json({success:true,data:{matrix:{}}});
  if(url==='/api/products/import')return Response.json({success:true,allowed:true});
  return Response.json({success:true,data:[]});
 };
 try {
  const {createRoot}=await import('react-dom/client');const {AdminDashboardClient}=await import('../src/app/admin/AdminDashboardClient.tsx');const root=createRoot(document.getElementById('root'));
  const props={products:[],categories:[{id:1,name:'İplik'},{id:2,name:'Dikiş'}],brands:[{id:1,name:'Marka',slug:'marka',categoryIds:[1],isActive:true},{id:2,name:'Eski',slug:'eski',categoryIds:[],isActive:true}],warehouses:[{id:1,name:'Merkez',code:'M'}],inventory:[],ledger:[],orders:[],suppliers:[],purchaseOrders:[],coupons:[],shifts:[],currentRole:'SUPER_ADMIN'};
  const wait=async(fn)=>{for(let i=0;i<100;i++){await act(async()=>new Promise(r=>setTimeout(r,10)));if(fn())return;}throw Error('UI timeout');};
  const click=async(label)=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===label);assert.ok(b,label);await act(async()=>b.click());};
  await act(async()=>root.render(React.createElement(AdminDashboardClient,props)));await wait(()=>document.body.textContent.includes('Ürün & Katalog'));await click('Ürün & Katalog');await click('Markalar');
  const form=[...document.querySelectorAll('form')].find(x=>x.textContent.includes('Yeni Marka'));const input=form.querySelector('input[placeholder]');await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,'Marka');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
  await act(async()=>form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));assert.equal(requests.length,0);assert.match(document.body.textContent,/En az bir kategori seçin/);
  await act(async()=>form.querySelectorAll('input[type=checkbox]')[1].click());await act(async()=>form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));await wait(()=>requests.length===1);assert.deepEqual(requests[0].categoryIds,[2]);
  await click('Düzenle');const edit=[...document.querySelectorAll('fieldset')].find(x=>x.textContent.includes('Marka kategorilerini düzenle'));assert.ok(edit.querySelectorAll('input')[1].checked);await act(async()=>edit.querySelectorAll('input')[0].click());await click('Kaydet');await wait(()=>requests.length===2);assert.deepEqual(requests[1].categoryIds,[2,1]);
  await click('Ürünler');await click('Yeni Ürün Ekle');const label=[...document.querySelectorAll('label')].find(x=>x.textContent.trim()==='Marka:');const select=label.parentElement.querySelector('select');assert.deepEqual([...select.querySelectorAll('optgroup')].map(x=>[x.label,[...x.querySelectorAll('option')].map(o=>o.textContent)]),[['Seçilen kategoriye bağlı markalar',['Marka']],['Diğer ve kategorisi atanmamış markalar',['Eski']]]);
  const category=[...document.querySelectorAll('label')].find(x=>x.textContent.trim()==='Kategori:').parentElement.querySelector('select');await act(async()=>{category.value='2';category.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});assert.equal(select.value,'1');assert.equal(select.querySelector('optgroup').textContent,'Marka');
  await act(async()=>root.unmount());
 } finally {globalThis.fetch=original;dom.window.close();}
});
