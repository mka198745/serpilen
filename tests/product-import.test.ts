import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractProduct } from "../src/lib/product-import/extract";
import { fetchPublicProductPage, publicHttpsUrl, isPublicAddress, resolvePublicHost } from "../src/lib/product-import/safe-fetch";

const fixture = `<!doctype html><html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Product","name":"Pamuk İplik","description":"<p>Yumuşak &amp; kaliteli</p>\\u003cscript\\u003eevil()\\u003c/script\\u003e","sku":"IP-123","gtin13":"8691234567890","brand":{"@type":"Brand","name":"Örnek"},"category":"Örgü","image":["/images/one.jpg","https://cdn.example.com/two.png","http://bad.example/p.jpg","https://127.0.0.1/private.png"],"additionalProperty":[{"name":"Malzeme","value":"Pamuk"},{"name":"Metraj","value":"100 m"}]}]}</script>
<meta property="og:image" content="https://cdn.example.com/three.jpg" /></head><body>
<table class="woocommerce-product-attributes"><tr><th>Renk</th><td>Mavi</td></tr></table><table><tr><th>Başka ürün</th><td>Ait değil</td></tr></table>
</body></html>`;

test("Yapılandırılmış ürün adı, açıklama, güvenli resim, SKU, marka ve teknik özellikleri çıkarır", () => {
  const product=extractProduct(fixture,"https://shop.example.com/product/iplik");
  assert.equal(product.name,"Pamuk İplik");assert.equal(product.sku,"IP-123");assert.equal(product.barcode,"8691234567890");assert.equal(product.brand,"Örnek");assert.equal(product.category,"Örgü");
  assert.match(product.description,/Yumuşak & kaliteli/);assert.match(product.description,/Malzeme: Pamuk/);assert.match(product.description,/Metraj: 100 m/);assert.match(product.description,/Renk: Mavi/);
  assert.doesNotMatch(product.description,/evil\(\)|Başka ürün/);
  assert.deepEqual(product.images,["https://shop.example.com/images/one.jpg","https://cdn.example.com/two.png","https://cdn.example.com/three.jpg"]);
});

test("Eksik alan, çoklu ürün, mikro veri ve OpenGraph durumları kontrollüdür", () => {
  const og=extractProduct('<meta property="og:type" content="product"><meta property="og:title" content="Düğme"><meta property="og:description" content="Açıklama">',"https://vendor.example/product");
  assert.equal(og.name,"Düğme");assert.deepEqual(og.images,[]);assert.ok(og.warnings.some(x=>x.includes('görsel')));
  const micro=extractProduct('<div itemscope itemtype="https://schema.org/Product"><span itemprop="name">Kurdele</span><meta itemprop="sku" content="KD-1"><img itemprop="image" src="/a.jpg"></div>',"https://vendor.example/p");
  assert.equal(micro.name,"Kurdele");assert.equal(micro.sku,"KD-1");assert.deepEqual(micro.images,["https://vendor.example/a.jpg"]);
  assert.throws(()=>extractProduct('<h1>Ürün değil</h1>',"https://vendor.example/p"),/ürün bilgisi bulunamadı/);
  const multi=`<script type="application/ld+json">[{"@type":"Product","name":"Bir"},{"@type":"Product","name":"İki"}]</script>`;
  assert.throws(()=>extractProduct(multi,"https://vendor.example/p"),/birden fazla ürün/);
  const chosen=`<script type="application/ld+json">[{"@type":"Product","name":"Bir","url":"/p"},{"@type":"Product","name":"İki","url":"/other"}]</script>`;
  assert.equal(extractProduct(chosen,"https://vendor.example/p").name,"Bir");
  const wrong=extractProduct('<script type="application/ld+json">{"@type":"Product","name":"X","gtin":"xyz"}</script>',"https://vendor.example/p");assert.equal(wrong.barcode,"");assert.ok(wrong.warnings.some(x=>x.includes("Barkod")));
  const invalid=extractProduct('<script type="application/ld+json">{"@type":"Product","name":"X","gtin":"12345678"}</script>',"https://vendor.example/p");assert.equal(invalid.barcode,"");
  const numeric=extractProduct('<script type="application/ld+json">{"@type":"Product","name":"X","gtin13":4006381333931}</script>',"https://vendor.example/p");assert.equal(numeric.barcode,"");
});

test("Özel ağ, yerel, IP, kimlik bilgili, standart dışı port ve güvensiz şemalar reddedilir", () => {
  for(const value of ["http://example.com/p","file:///etc/passwd","https://127.0.0.1/","https://2130706433/","https://[::ffff:127.0.0.1]/","https://localhost/","https://foo.local/","https://foo.internal/","https://u:p@example.com/","https://example.com:8443/"]) assert.throws(()=>publicHttpsUrl(value),value);
  for(const ip of ["127.0.0.1","10.0.0.1","172.16.0.1","192.168.1.1","169.254.169.254","100.64.0.1","192.0.2.1","224.0.0.1","::1","fc00::1","fe80::1","2001:db8::1","2002:c0a8:101::","2001:0:4136:e378:8000:63bf:3fff:fdd2","64:ff9b:1::a00:1","::ffff:127.0.0.1"]) assert.equal(isPublicAddress(ip),false,ip);
  assert.equal(isPublicAddress("8.8.8.8"),true);assert.equal(isPublicAddress("2001:4860:4860::8888"),true);
});

test("DNS yanıtları tamamen doğrulanır, adres sabitlenir, yönlendirme yeniden kontrol edilir", async () => {
  const signal=AbortSignal.timeout(3000);
  await assert.rejects(resolvePublicHost("vendor.example",signal,async()=>[{address:"8.8.8.8",family:4},{address:"127.0.0.1",family:4}]),/güvenli bağlantı/);
  let calls=0;
  const resolve=async (host:string)=>{calls++;return [{address:host==='vendor.example'?'8.8.8.8':'1.1.1.1',family:4}];};
  const get=async (url:URL,addr:{address:string,family:number})=>{
    if(url.hostname==='vendor.example'){assert.equal(addr.address,'8.8.8.8');return {status:302,location:'https://cdn.example/product',contentType:'',contentEncoding:'',body:Buffer.alloc(0)};}
    assert.equal(addr.address,'1.1.1.1');return {status:200,contentType:'text/html; charset=utf-8',contentEncoding:'',body:Buffer.from(fixture)};
  };
  const page=await fetchPublicProductPage('https://vendor.example/p',{resolve,get});assert.equal(calls,2);assert.equal(page.url,'https://cdn.example/product');assert.equal(extractProduct(page.html,page.url).name,'Pamuk İplik');
  await assert.rejects(fetchPublicProductPage('https://vendor.example/p',{resolve,get:async()=>({status:302,location:'https://127.0.0.1/private',contentType:'',contentEncoding:'',body:Buffer.alloc(0)})}),/herkese açık HTTPS/);
  await assert.rejects(fetchPublicProductPage('https://vendor.example/p',{resolve,get:async()=>({status:200,contentType:'text/html',contentEncoding:'',body:Buffer.alloc(2*1024*1024+1)})}),/çok büyük/);
  await assert.rejects(fetchPublicProductPage('https://vendor.example/p',{resolve,get:async()=>({status:302,location:'/loop',contentType:'',contentEncoding:'',body:Buffer.alloc(0)})}),/çok fazla yönlendirme/);
  await assert.rejects(fetchPublicProductPage('https://vendor.example/p',{resolve,get:async()=>({status:200,contentType:'application/json',contentEncoding:'',body:Buffer.from('{}')})}),/HTML ürün sayfası/);
  await assert.rejects(fetchPublicProductPage('https://vendor.example/p',{resolve,get:async()=>({status:200,contentType:'text/html',contentEncoding:'gzip',body:Buffer.alloc(0)})}),/HTML ürün sayfası/);
  await assert.rejects(fetchPublicProductPage('https://vendor.example/p',{resolve:()=>new Promise(()=>{}),timeoutMs:20}),/zamanında/);
});

test("Himalaya dil oturumu yalnız sabit uç noktaya ve aynı hosta uygulanır, başarısızlık uyarılır", async () => {
  const initial = readFileSync(new URL("./fixtures/himalaya-arisya.html", import.meta.url));
  const turkish = readFileSync(new URL("./fixtures/himalaya-arisya-tr.html", import.meta.url));
  const response = (body: Buffer, setCookie?: string[]) => ({status:200,contentType:"text/html; charset=utf-8",contentEncoding:"",body,setCookie});
  const calls: Array<{url:string,method:string,cookie?:string,body?:string}> = [];
  const resolve = async () => [{address:"8.8.8.8",family:4}];
  const get = async (url:URL, addr:{address:string,family:number}, _signal:AbortSignal, request?:{method:"GET"|"POST",cookie?:string,body?:string}) => {
    assert.equal(addr.address,"8.8.8.8"); calls.push({url:url.href,method:request?.method || "GET",cookie:request?.cookie,body:request?.body});
    if (calls.length===1) return response(initial,["PHPSESSID=abc123; path=/; HttpOnly", "other=secret"]);
    if (calls.length===2) return response(Buffer.alloc(0),["PHPSESSID=new-session; path=/", "other=secret"]);
    return response(turkish);
  };
  const page = await fetchPublicProductPage("https://www.himalaya.com.tr/arisya.html",{resolve,get});
  assert.deepEqual(calls,[
    {url:"https://www.himalaya.com.tr/arisya.html",method:"GET",cookie:undefined,body:undefined},
    {url:"https://www.himalaya.com.tr/process.php?manage=site.site",method:"POST",cookie:"PHPSESSID=abc123",body:"LANG=TR"},
    {url:"https://www.himalaya.com.tr/arisya.html",method:"GET",cookie:"PHPSESSID=new-session",body:undefined},
  ]);
  assert.equal(extractProduct(page.html,page.url).technicalDetails?.composition,"%96 Cotton %4 Glitter");
  assert.equal(page.warnings, undefined);
  const wrongLanguage = await fetchPublicProductPage("https://www.himalaya.com.tr/arisya.html",{resolve,get:async (_url,_addr,_sig,request)=>response(request?.method === "POST" ? Buffer.alloc(0) : initial,["PHPSESSID=abc123; path=/"])});
  assert.match(wrongLanguage.warnings!.join(" "),/dil seçimi doğrulanamadı/);
  const fallback = await fetchPublicProductPage("https://www.himalaya.com.tr/arisya.html",{resolve,get:async (_url,_addr,_sig,request)=> request?.method === "POST" ? {status:302,location:"https://evil.example/",contentType:"",contentEncoding:"",body:Buffer.alloc(0)} : response(initial,["PHPSESSID=abc123; path=/"])});
  assert.match(fallback.warnings!.join(" "),/Türkçe sayfasına ulaşılamadı/);
  assert.deepEqual(extractProduct(fallback.html,fallback.url).technicalDetails,{});
  const normalCalls:string[]=[];
  await fetchPublicProductPage("https://other.example/arisya.html",{resolve,get:async (url,_a,_s,request)=>{normalCalls.push(`${request?.method || "GET"} ${url.href}`); return response(initial,["PHPSESSID=secret"]);}});
  assert.deepEqual(normalCalls,["GET https://other.example/arisya.html"]);
});
