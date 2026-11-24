import test from 'node:test';
import assert from 'node:assert/strict';
import React, {act} from 'react';
import {JSDOM} from 'jsdom';

test('Ürün sayfası kaydedilen teknik bilgileri gösterir, boş ürünler uyumludur',async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://shop.example.test'});
 for(const key of ['window','document','navigator','self','localStorage'])Object.defineProperty(globalThis,key,{value:key==='self'?dom.window:dom.window[key],configurable:true});
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;const originalFetch=globalThis.fetch;globalThis.fetch=async()=>Response.json({success:true,data:[]});
 try{
  const {createRoot}=await import('react-dom/client');const {CartProvider}=await import('../src/context/CartContext.tsx');const {ProductDetailClient}=await import('../src/app/urun/[slug]/ProductDetailClient.tsx');const root=createRoot(document.getElementById('root'));
  const product={id:1,name:'BABY BEST',sku:'TEST-1',unit:'Adet',retailPrice:'99',packageQty:1,vatRate:20,technicalDetails:JSON.stringify({articleNo:'260',composition:'%10 Bambu - %90 Akrilik',length:'100 gr - 240 m',knittingNeedle:'4-5',crochetNeedle:'2-4'})};
  const render=async(p)=>act(async()=>root.render(React.createElement(CartProvider,null,React.createElement(ProductDetailClient,{product:p,variants:[],images:[],category:null,brand:null,warehouseStocks:[]}))));
  await render(product);const button=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Teknik Özellikler');assert.ok(button);await act(async()=>button.click());
  assert.match(document.body.textContent,/Artikel No\s*260/);assert.match(document.body.textContent,/Karışım\s*%10 Bambu/);assert.match(document.body.textContent,/Şiş No\s*4-5/);assert.match(document.body.textContent,/Tığ No\s*2-4/);
  await render({...product,technicalDetails:null});assert.doesNotMatch(document.body.textContent,/Artikel No\s*260/);assert.match(document.body.textContent,/Birim/);
  await act(async()=>root.unmount());
 }finally{globalThis.fetch=originalFetch;dom.window.close();}
});
