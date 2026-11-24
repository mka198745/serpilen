import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';

test('Ödeme ekranı kart bilgisi toplamaz; havale siparişi ödemeyi bekliyor gösterir',async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://shop.example.test/odeme'});
 for(const key of ['window','document','navigator','self','localStorage'])Object.defineProperty(globalThis,key,{value:key==='self'?dom.window:dom.window[key],configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;const original=globalThis.fetch;let sent;
 dom.window.localStorage.setItem('ipek_cart',JSON.stringify([{productId:1,variantId:null,name:'Ürün',sku:'SKU',price:10,quantity:1,unit:'Adet'}]));
 globalThis.fetch=async(url,opts={})=>{
  if(url==='/api/site-settings')return Response.json({success:true,data:{'site.checkout.payment_card_enabled':'true','site.checkout.payment_eft_enabled':'true','site.checkout.eft_iban':'TR330006100519786457841326','site.checkout.eft_account_name':'Test Hesabı','site.cart.shipping_fee':'0'}});
  if(url==='/api/orders/next-number')return Response.json({success:true,orderNumber:'SİP20260001',token:'test-token'});
  if(url==='/api/products')return Response.json({success:true,data:[{id:1,categoryId:1}]});
  if(url==='/api/promotions')return Response.json({success:true,data:{totalDiscount:0}});
  if(url==='/api/orders'){sent=JSON.parse(opts.body);return Response.json({success:true,data:{order:{orderNumber:'SİP20260001',grandTotal:10,status:'PENDING',paymentStatus:'PENDING'}}});}
  return Response.json({success:true,data:[]});
 };
 try{
  const {createRoot}=await import('react-dom/client');const {CartProvider}=await import('../src/context/CartContext.tsx');const {CheckoutClient}=await import('../src/app/odeme/CheckoutClient.tsx');const root=createRoot(document.getElementById('root'));
  await act(async()=>root.render(React.createElement(CartProvider,null,React.createElement(CheckoutClient))));
  for(let i=0;i<100&&!document.body.textContent.includes('Havale / EFT ile transfer');i++)await act(async()=>{await new Promise(r=>setTimeout(r,10));});
  assert.match(document.body.textContent,/Online kart ödemesi şu anda kullanılamıyor/);assert.doesNotMatch(document.body.textContent,/Kart Numarası|CVV Güvenlik Kodu/);assert.doesNotMatch(document.body.textContent,/Test Hesabı/);
  await act(async()=>document.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(sent.paymentMethod,'EFT_HAVALE');assert.equal(sent.grandTotal,10);assert.ok(!('cardNumber' in sent));assert.match(document.body.textContent,/Ödeme bekleniyor/i);assert.match(document.body.textContent,/Test Hesabı/);assert.match(document.body.textContent,/SİP20260001/);
  await act(async()=>root.unmount());
 }finally{globalThis.fetch=original;dom.window.close();}
});
