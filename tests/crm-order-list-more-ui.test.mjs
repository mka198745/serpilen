import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';

test('İlişkili siparişlerde yalnız 200 satırdan fazlası olan siparişte devam seçeneği vardır',async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://admin.example.test'});for(const key of ['window','document','navigator','self','localStorage'])Object.defineProperty(globalThis,key,{value:key==='self'?dom.window:dom.window[key],configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;const original=globalThis.fetch;let urls=[];
 globalThis.fetch=async(url)=>{urls.push(url);return Response.json({success:true,data:[{id:1,orderNumber:'BUYUK',orderType:'POS',status:'PAID',paymentStatus:'PAID',paymentMethod:'CASH',grandTotal:'10',createdAt:1700000000,items:[{productName:'İlk satır',variantName:null,quantity:1,totalPrice:'10'}],hasMoreItems:true},{id:2,orderNumber:'KÜÇÜK',orderType:'POS',status:'PAID',paymentStatus:'PAID',paymentMethod:'CASH',grandTotal:'10',createdAt:1700000000,items:[],hasMoreItems:false}],pagination:{total:2}});};
 try{const {createRoot}=await import('react-dom/client');const {CrmCustomerOrders}=await import('../src/components/admin/CrmCustomerOrders.tsx');const root=createRoot(document.getElementById('root'));await act(async()=>root.render(React.createElement(CrmCustomerOrders,{customerId:4})));
  for(let i=0;i<100&&!document.body.textContent.includes('BUYUK');i++)await act(async()=>new Promise(r=>setTimeout(r,10)));
  const rows=[...document.querySelectorAll('details')];assert.equal(rows.length,2);assert.ok(rows[0].textContent.includes('200. üründen sonraki ürünleri göster'));assert.ok(!rows[1].textContent.includes('200. üründen sonraki'));assert.deepEqual(urls,['/api/crm/customers/4/orders?page=1']);await act(async()=>root.unmount());
 }finally{globalThis.fetch=original;dom.window.close();}
});
