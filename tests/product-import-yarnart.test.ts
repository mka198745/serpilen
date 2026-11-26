import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importProduct } from "../src/lib/product-import/import-product";
import { extractYarnArtDetailVariants, type ImportedVariant } from "../src/lib/product-import/extract";

const base = "https://yarnart.info/urunler/yazlik-ipler/jeans-splash";
const family = readFileSync(new URL("./fixtures/yarnart-jeans-splash.html", import.meta.url), "utf8");
const colors = Array.from({length:22}, (_,i) => ({code:String(940+i), url:`${base}/${940+i}`, img:`https://yarnart.info/img/400x0/storage/uploads/2026/08/Yarnart_JEANS_SPLASH_${940+i}.jpg`}));
const detail = (entries: unknown[] = colors, activeColor = "940", title = "940") => `<h1 class="ya-pd-info__title">${title}</h1><script type="application/json" id="ya-product-detail-config">${JSON.stringify({colors:entries,activeColor})}</script>`;
const baseline: ImportedVariant[] = [{colorName:"940",size:"",imageUrl:""},{colorName:"941",size:"",imageUrl:""}];

test("Aile ve detay bağlantısı aynı ürün ailesindeki 22 varyantın tümünü getirir", async () => {
  for (const url of [base,`${base}/940`]) {
    const calls:string[] = [];
    const product = await importProduct(url,async input => { calls.push(input);return {url:input,html:input===base?family:detail()}; });
    assert.equal(product.name,"Jeans Splash"); assert.equal(product.variants?.length,22);
    assert.deepEqual(product.variants?.map(v=>v.colorName),colors.map(v=>v.code));
    assert.match(product.variants![21].imageUrl,/961.jpg$/);assert.equal(product.technicalDetails?.composition,"55% Pamuk - 45% Pac (Akrilik)");
    assert.ok(product.variants?.every(v=> !('price' in v) && !('stock' in v)));
    assert.deepEqual(calls,url===base ? [base,`${base}/940`] : [`${base}/940`,base]);
    if(url!==base) assert.match(product.warnings.join(" "),/940 varyantına ait/);
  }
});

test("Detay listesi farklı aileleri veya hostları içermemeli, seçim kimliği eşleşmeli", () => {
  assert.equal(extractYarnArtDetailVariants(detail(),`${base}/940`,base,baseline)?.variants.length,22);
  for (const html of [detail(colors,"941"),detail(colors,"940","941"),detail(colors.slice(2)),"<script id='ya-product-detail-config'>{</script>"]) assert.equal(extractYarnArtDetailVariants(html,`${base}/940`,base,baseline),null);
  assert.equal(extractYarnArtDetailVariants(detail(),`https://evil.example/urunler/yazlik-ipler/jeans-splash/940`,base,baseline),null);
  const mixed = [...colors,{code:"999",url:"https://evil.example/urunler/yazlik-ipler/jeans-splash/999",img:"https://evil.example/a.jpg"},{code:"888",url:"https://yarnart.info/urunler/other/family/888",img:""},{...colors[1]}];
  const p = extractYarnArtDetailVariants(detail(mixed),`${base}/940`,base,baseline)!;
  assert.equal(p.variants.length,22);assert.match(p.warnings.join(" "),/doğrulanamadığı/);
  const badImage = colors.map((v,i)=>i===2 ? {...v,img:'https://127.0.0.1/private'} : v);
  const noPhoto = extractYarnArtDetailVariants(detail(badImage),`${base}/940`,base,baseline)!;
  assert.equal(noPhoto.variants[2].imageUrl,"");assert.match(noPhoto.warnings.join(" "),/görselleri/);
});

test("Eksik veya başarısız detay açık uyarıyla ilk sayfaya düşer; 50 sınırı korunur", async () => {
  for (const run of [async () => { throw Error('network'); },async () => ({url:'https://other.example/redirect',html:detail()}), async () => ({url:`${base}/940`,html:detail(colors.slice(2))})]) {
    const p = await importProduct(base, async input=>input===base?{url:base,html:family}:run());
    assert.deepEqual(p.variants?.map(v=>v.colorName),['940','941']);assert.match(p.warnings.join(' '),/yalnız ilk sayfadaki/);
  }
  const many = Array.from({length:55}, (_,i) => ({code:String(940+i),url:`${base}/${940+i}`,img:""}));
  const result = extractYarnArtDetailVariants(detail(many),`${base}/940`,base,baseline)!;
  assert.equal(result.variants.length,50);assert.match(result.warnings.join(' '),/yalnız ilk 50/);
  await assert.rejects(importProduct(`${base}/940`,async input=>input===base?{url:'https://other.example/',html:family}:{url:input,html:detail()}),/ailesi doğrulanamadı/);
});
