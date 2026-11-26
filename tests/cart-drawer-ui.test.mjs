import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';

const items=[
 {productId:1,variantId:11,name:'BABY BEST çok uzun ve okunabilir ürün adı',variantName:'Mavi 55',sku:'BB-MAVI',barcode:'123',price:75.5,quantity:2,imageUrl:'https://cdn.example.test/mavi.jpg',unit:'Adet'},
 {productId:1,variantId:12,name:'BABY BEST çok uzun ve okunabilir ürün adı',variantName:'Kırmızı 56',sku:'BB-KIRMIZI',barcode:'124',price:100,quantity:1,imageUrl:null,unit:'Adet'},
];
function environment(){const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://shop.example.test/'});for(const k of ['window','document','navigator','self','localStorage','HTMLElement','KeyboardEvent'])Object.defineProperty(globalThis,k,{value:k==='self'?dom.window:dom.window[k],configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;return dom;}

test('Sepet çekmecesi ürünleri ayrı geniş alanda listeler, miktar/kupon/silme ve klavye işlemleri çalışır',async()=>{
 const dom=environment(),original=globalThis.fetch;localStorage.setItem('ipek_cart',JSON.stringify(items));let couponRequests=0;
 globalThis.fetch=async(url,opts={})=>{if(url==='/api/site-settings')return Response.json({success:true,data:{'site.cart.free_shipping_threshold':'1000','site.cart.shipping_fee':'59','site.cart.notice':'Özel sepet duyurusu'}});if(url==='/api/coupons'&&opts.method==='POST'){couponRequests++;const body=JSON.parse(opts.body);assert.equal(body.code,'INDIRIM');assert.equal(body.cartTotal,326.5);return Response.json({success:true,discountAmount:20,message:'Kupon uygulandı'});}return Response.json({success:true,data:[]});};
 try{
  const {createRoot}=await import('react-dom/client');const {CartProvider,useCart}=await import('../src/context/CartContext.tsx');const {CartDrawer}=await import('../src/components/layout/CartDrawer.tsx');const root=createRoot(document.getElementById('root'));
  function Opener(){const {setIsCartOpen}=useCart();return React.createElement('button',{onClick:()=>setIsCartOpen(true)},'Sepetim');}
  await act(async()=>root.render(React.createElement(CartProvider,null,React.createElement(Opener),React.createElement(CartDrawer))));const opener=[...document.querySelectorAll('button')].find(b=>b.textContent==='Sepetim');opener.focus();await act(async()=>opener.click());
  let dialog=document.querySelector('[role="dialog"]');assert.ok(dialog);assert.equal(dialog.getAttribute('aria-modal'),'true');assert.equal(document.activeElement.getAttribute('aria-label'),'Kapat');assert.equal(document.body.style.overflow,'hidden');
  const section=dialog.querySelector('section[aria-labelledby="cart-items-title"]'),aside=dialog.querySelector('aside[aria-label="Sipariş özeti"]');assert.ok(section&&aside);assert.equal(section.nextElementSibling,aside);assert.match(section.parentElement.className,/md:flex/);assert.match(section.parentElement.className,/overflow-y-auto/);assert.match(section.className,/md:overflow-y-auto/);assert.match(aside.className,/md:overflow-y-auto/);
  assert.equal(section.querySelectorAll('li').length,2);assert.match(section.textContent,/BABY BEST çok uzun ve okunabilir ürün adı/);assert.match(section.textContent,/Mavi 55.*BB-MAVI.*75.50 TL.*151.00 TL/s);assert.match(section.textContent,/Kırmızı 56.*BB-KIRMIZI.*100.00 TL/s);assert.equal(section.querySelector('img').getAttribute('src'),'https://cdn.example.test/mavi.jpg');assert.equal(section.querySelector('h4').className.includes('line-clamp'),false);
  assert.match(aside.textContent,/Özel sepet duyurusu/);assert.match(aside.textContent,/251.00 TL/);assert.match(aside.textContent,/59.00 TL/);assert.match(aside.textContent,/310.00 TL/);assert.match(aside.textContent,/Havale\/EFT ödeme süresi: 24 saat/);assert.doesNotMatch(dialog.textContent,/Stok bekleyen siparişlerde henüz ödeme yapmayın/);
  const increase=section.querySelector('button[aria-label*="Mavi 55 miktarını artır"]');await act(async()=>increase.click());assert.match(aside.textContent,/326.50 TL/);assert.match(aside.textContent,/385.50 TL/);assert.match(section.textContent,/226.50 TL/);
  const decrease=section.querySelector('button[aria-label*="Mavi 55 miktarını azalt"]');await act(async()=>decrease.click());assert.match(aside.textContent,/251.00 TL/);await act(async()=>increase.click());
  const input=aside.querySelector('input[aria-label="Kupon kodu"]');await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,'INDIRIM');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});await act(async()=>aside.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));assert.equal(couponRequests,1);assert.match(aside.textContent,/Kupon uygulandı.*INDIRIM/s);assert.match(aside.textContent,/365.50 TL/);await act(async()=>[...aside.querySelectorAll('button')].find(b=>b.textContent==='Kaldır').click());assert.match(aside.textContent,/385.50 TL/);
  assert.equal(aside.querySelector('a[href="/odeme"]').textContent,'Siparişi Tamamla');
  // Focus remains inside the dialog and Escape restores the opener.
  const focusable=[...dialog.querySelectorAll('a[href],button:not([disabled]),input:not([disabled])')];focusable.at(-1).focus();await act(async()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true})));assert.equal(document.activeElement,focusable[0]);
  await act(async()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.equal(document.querySelector('[role="dialog"]'),null);assert.equal(document.activeElement,opener);assert.equal(document.body.style.overflow,'');
  await act(async()=>opener.click());dialog=document.querySelector('[role="dialog"]');const remove=label=>dialog.querySelector(`button[aria-label*="${label} ürününü sepetten çıkar"]`);await act(async()=>remove('Mavi 55').click());assert.equal(dialog.querySelectorAll('li').length,1);assert.match(dialog.querySelector('aside').textContent,/159.00 TL/);await act(async()=>remove('Kırmızı 56').click());assert.match(dialog.textContent,/Sepetiniz Boş/);assert.equal(dialog.querySelector('a[href="/odeme"]'),null);await act(async()=>document.querySelector('button[aria-label="Sepeti kapat"]').click());assert.equal(document.querySelector('[role="dialog"]'),null);await act(async()=>root.unmount());
 }finally{globalThis.fetch=original;dom.window.close();}
});

test('Kapalı sepet ve sepet sayfası; ödeme uyarısı yalnız sepetlerden kaldırılır',async()=>{
 const dom=environment(),original=globalThis.fetch;localStorage.setItem('ipek_cart',JSON.stringify(items));globalThis.fetch=async url=>url==='/api/site-settings'?Response.json({success:true,data:{'site.cart.enabled':'false'}}):Response.json({success:true,data:[]});
 try{
  const {createRoot}=await import('react-dom/client');const {CartProvider,useCart}=await import('../src/context/CartContext.tsx');const {CartDrawer}=await import('../src/components/layout/CartDrawer.tsx');const {default:CartPage}=await import('../src/app/sepet/page.tsx');const {PaymentTimeNotice}=await import('../src/components/layout/PaymentTimeNotice.tsx');const root=createRoot(document.getElementById('root'));
  function Opener(){const {setIsCartOpen}=useCart();return React.createElement('button',{onClick:()=>setIsCartOpen(true)},'Sepeti aç');}
  await act(async()=>root.render(React.createElement(CartProvider,null,React.createElement(Opener),React.createElement(CartDrawer),React.createElement(CartPage))));assert.match(document.body.textContent,/Sipariş oluşturulup stok ayrıldığında süre başlar/);assert.doesNotMatch(document.body.textContent,/Stok bekleyen siparişlerde henüz ödeme yapmayın/);
  await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Sepeti aç').click());const dialog=document.querySelector('[role="dialog"]');assert.match(dialog.textContent,/Sepet Şu Anda Kapalı/);assert.equal(document.activeElement.textContent,'Kapat');assert.equal(dialog.querySelector('a[href="/odeme"]'),null);await act(async()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.equal(document.querySelector('[role="dialog"]'),null);
  await act(async()=>root.render(React.createElement(PaymentTimeNotice)));assert.match(document.body.textContent,/Stok bekleyen siparişlerde henüz ödeme yapmayın; stok ayrıldığında süre başlar/);await act(async()=>root.unmount());
 }finally{globalThis.fetch=original;dom.window.close();}
});

test('Gerçek üst header Sepetim düğmesi detay panelini açar ve ödeme bağlantısı kapatır',async()=>{
 const dom=environment(),original=globalThis.fetch;localStorage.setItem('ipek_cart',JSON.stringify(items));globalThis.fetch=async(url)=>url==='/api/site-settings'?Response.json({success:true,data:{}}):Response.json({success:false},{status:401});
 try{
  const {createRoot}=await import('react-dom/client');const {CartProvider}=await import('../src/context/CartContext.tsx');const {AuthProvider}=await import('../src/context/AuthContext.tsx');const {Header}=await import('../src/components/layout/Header.tsx');const {CartDrawer}=await import('../src/components/layout/CartDrawer.tsx');const root=createRoot(document.getElementById('root'));
  await act(async()=>root.render(React.createElement(AuthProvider,null,React.createElement(CartProvider,null,React.createElement(Header),React.createElement(CartDrawer)))));const button=document.querySelector('header button[aria-label="Sepeti Aç"]');assert.ok(button);assert.equal(button.getAttribute('aria-expanded'),'false');await act(async()=>button.click());assert.equal(button.getAttribute('aria-expanded'),'true');const dialog=document.querySelector('[role="dialog"]');assert.ok(dialog);assert.match(dialog.textContent,/Alışveriş Sepetim/);assert.equal(dialog.querySelectorAll('section li').length,2);
  const checkout=dialog.querySelector('a[href="/odeme"]');checkout.addEventListener('click',event=>event.preventDefault(),{once:true});await act(async()=>checkout.click());assert.equal(document.querySelector('[role="dialog"]'),null);await act(async()=>root.unmount());
 }finally{globalThis.fetch=original;dom.window.close();}
});
