import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';

test('tedarikçiye iade ekranı belirsiz yanıtı aynı anahtarla tekrarlar',async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://admin.example.test'});
 for(const k of ['window','document','navigator','self','localStorage'])Object.defineProperty(globalThis,k,{value:k==='self'?dom.window:dom.window[k],configurable:true});
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.confirm=()=>true;const prev=globalThis.fetch;let calls=[];
 const receipt={id:7,receiptNumber:'MK-7',purchaseOrderId:3,supplierName:'Firma',receivedBy:'Admin',createdAt:'2026-01-01T12:00:00Z',items:[{id:9,productName:'Ürün',qty:5,returnedQty:0}],returns:[]};
 globalThis.fetch=async(url,opts={})=>{
  if(url==='/api/role-matrix')return Response.json({success:true,data:{matrix:{}}});
  if(url==='/api/suppliers' && opts.method==='POST') {const body=JSON.parse(opts.body);calls.push(body);if(calls.length===1)throw Error('Bağlantı koptu');if(body.action==='FENCE_PURCHASING')return Response.json({success:true,data:{status:'fenced'}});if(calls.length===3)return Response.json({success:false,error:'Yetersiz stok.'},{status:409});return Response.json({success:true,data:{id:42,replayed:true}});}
  if(url==='/api/suppliers')return Response.json({success:true,suppliers:[{id:1,name:'Firma',rating:null,ratingDetails:{score:null,missing:['En az 3 tamamlanmış sipariş gerekli']}}],purchaseOrders:[],receipts:[receipt],suggestions:[],suggestionCount:0});
  return Response.json({success:true,data:[]});
 };
 try{
  const {createRoot}=await import('react-dom/client');const {AdminDashboardClient}=await import('../src/app/admin/AdminDashboardClient.tsx');const root=createRoot(document.getElementById('root'));
  const props={products:[],categories:[],brands:[],warehouses:[],inventory:[],ledger:[],orders:[],suppliers:[],purchaseOrders:[],coupons:[],shifts:[],currentRole:'SUPER_ADMIN'};
  const wait=async(fn)=>{for(let i=0;i<100;i++){await act(async()=>new Promise(r=>setTimeout(r,10)));if(fn())return;}throw Error('UI timeout: '+document.body.textContent.slice(-600));};
  const click=async(text)=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===text);assert.ok(b,text);assert.equal(b.disabled,false);await act(async()=>b.click());};
  const setValue=async(el,value)=>{const proto=el.tagName==='TEXTAREA'?dom.window.HTMLTextAreaElement.prototype:dom.window.HTMLInputElement.prototype;const setter=Object.getOwnPropertyDescriptor(proto,'value').set;await act(async()=>{setter.call(el,value);el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));el.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});};
  await act(async()=>root.render(React.createElement(AdminDashboardClient,props)));await wait(()=>document.body.textContent.includes('Satın Alma & Mal Kabul'));await click('Satın Alma & Mal Kabul');await wait(()=>document.body.textContent.includes('Mal Kabul (1)'));await click('Mal Kabul (1)');await click('Tedarikçiye iade');
  await setValue(document.querySelector('input[aria-label="Ürün iade miktarı"]'),'2');await setValue(document.querySelector('textarea'),'Hasarlı');await click('İadeyi Onayla ve Stoktan Düş');
  await wait(()=>calls.length===1 && document.body.textContent.includes('Bağlantı koptu'));assert.ok(localStorage.getItem('serpilen.purchasing.pending.v1'));
  await click('Önceki işlemi tekrar sorgula');await wait(()=>calls.length===2 && document.body.textContent.includes('Tedarikçiye iade kaydedildi'));assert.deepEqual(calls[0],calls[1]);assert.equal(localStorage.getItem('serpilen.purchasing.pending.v1'),null);
  await click('Tedarikçiye iade');await setValue(document.querySelector('input[aria-label="Ürün iade miktarı"]'),'1');await setValue(document.querySelector('textarea'),'Hasar');await click('İadeyi Onayla ve Stoktan Düş');
  await wait(()=>calls.length===3 && document.body.textContent.includes('Yetersiz stok.'));assert.ok(localStorage.getItem('serpilen.purchasing.pending.v1'));
  await click('Sonucu kontrol et ve kapat');await wait(()=>calls.length===4 && document.body.textContent.includes('gecikmiş istek güvenli biçimde durduruldu'));assert.equal(calls[3].action,'FENCE_PURCHASING');assert.equal(calls[3].requestKey,calls[2].requestKey);assert.equal(localStorage.getItem('serpilen.purchasing.pending.v1'),null);
  await click('Tedarikçiler (1)');assert.match(document.body.textContent,/Henüz puanlanmadı/);await click('+ Tedarikçi');assert.ok(![...document.querySelectorAll('label')].some(x=>x.textContent.trim()==='Puan'));
  await act(async()=>root.unmount());
 }finally{globalThis.fetch=prev;dom.window.close();}
});
