import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractProduct } from "../src/lib/product-import/extract";
import { ProductImportError } from "../src/lib/product-import/safe-fetch";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

test("Üretici sayfalarındaki renk kodları ve eşleşen görseller aktarılır", () => {
  const alize = extractProduct(fixture("alize-baby-best.html"), "https://alize.gen.tr/yumak/baby-best");
  assert.deepEqual(alize.variants, [
    { colorName: "55", size: "", imageUrl: "https://alize.gen.tr/uploads/151746890726000055.jpg" },
    { colorName: "506", size: "", imageUrl: "https://alize.gen.tr/uploads/26000506.jpg" },
  ]);
  const himalaya = extractProduct(fixture("himalaya-arisya.html"), "https://www.himalaya.com.tr/arisya.html");
  assert.deepEqual(himalaya.variants?.map(x => x.colorName), ["27-01", "27-02"]);
  assert.match(himalaya.variants![0].imageUrl, /thumb_product_01_/);
  const yarn = extractProduct(fixture("yarnart-jeans-splash.html"), "https://yarnart.info/urunler/yazlik-ipler/jeans-splash");
  assert.deepEqual(yarn.variants?.map(x => x.colorName), ["940", "941"]); assert.match(yarn.variants![0].imageUrl, /940.jpg$/);
  const nako = extractProduct(fixture("nako-hercai.html"), "https://www.nako.com.tr/urun/hercai");
  assert.deepEqual(nako.variants?.map(x => x.colorName), ["07252_449022_7799", "76035_449026_7799"]);
  assert.match(nako.variants![0].imageUrl, /37642_logo.jpg/);
  const noImage = fixture("alize-baby-best.html").replace('<div id="liste">', '<div id="liste"><a id="kesit_resim" data-bilgi="158" data-id=""></a><a id="kesit_resim" data-bilgi="159" data-id="https://bad.example/p.jpg"></a>');
  const incomplete = extractProduct(noImage, "https://alize.gen.tr/yumak/baby-best");
  assert.deepEqual(incomplete.variants?.slice(0,2), [{colorName:"158",size:"",imageUrl:""},{colorName:"159",size:"",imageUrl:""}]);
  assert.match(incomplete.warnings.join(" "), /Bazı varyantların görselleri/);
  assert.equal(extractProduct(fixture("milano-rafya.html"), "https://milanorafya.com/a").variants, undefined);
  for (const product of [alize, himalaya, yarn, nako]) {
    assert.ok(product.variants?.every(v => !('price' in v) && !('stock' in v) && !('sku' in v) && !('barcode' in v)));
    assert.match(product.warnings.join(" "), /Stoklar sıfır/);
  }
});

test("Varyant sayısı sınırlanır, tekrarlar ve ürün dışı kodlar alınmaz", () => {
  const html = fixture("alize-baby-best.html");
  const cards = Array.from({length: 55}, (_,i) => `<a id="kesit_resim" data-bilgi="${i}" data-id="${i}.jpg"></a>`).join("");
  const p = extractProduct(html.replace('<div id="home">', `<div id="home">${cards}`), "https://alize.gen.tr/yumak/baby-best");
  assert.equal(p.variants?.length, 50); assert.match(p.warnings.join(" "), /yalnız ilk 50/);
  const multi = fixture("nako-hercai.html").replace('</div></div></div><div class="suggestions">', '</div></div><div class="variant-list-group"><div class="variant-group-title">Size</div></div></div><div class="suggestions">');
  const nako = extractProduct(multi,"https://www.nako.com.tr/urun/hercai");assert.deepEqual(nako.variants,[]);assert.match(nako.warnings.join(' '),/kombinasyonlar doğrulanamadığı/);
});

test("Yapılandırılmış ürün grubu yalnız aynı sayfayı işaret ederse renk ve ölçü kombinasyonlarını getirir", () => {
  const group = {"@type":"ProductGroup",url:"https://shop.example.com/sweater",name:"Kazak",brand:{name:"Örnek"},hasVariant:[
    {"@type":"Product",color:"Kırmızı",size:"M",image:"https://cdn.example.com/red.jpg",sku:"REMOTE",offers:{price:1},gtin:"123"},
    {"@type":"Product",color:"Kırmızı",size:"L",image:"https://127.0.0.1/private.jpg"},
    {"@type":"Product",size:"XL"}, {"@type":"Product",name:"Kimliği belirsiz"},
  ]};
  const html = (g: unknown) => `<script type="application/ld+json">${JSON.stringify(g)}</script>`;
  const p = extractProduct(html(group),"https://shop.example.com/sweater");
  assert.equal(p.name, "Kazak");assert.equal(p.brand, "Örnek");
  assert.deepEqual(p.variants, [{colorName:"Kırmızı",size:"M",imageUrl:"https://cdn.example.com/red.jpg"},{colorName:"Kırmızı",size:"L",imageUrl:""},{colorName:"",size:"XL",imageUrl:""}]);
  assert.equal(p.sku, "");assert.equal(p.barcode, "");
  assert.throws(() => extractProduct(html({...group,url:undefined}),"https://shop.example.com/sweater"), (e: unknown) => e instanceof ProductImportError && e.code === "AMBIGUOUS");
  assert.throws(() => extractProduct(html({...group,url:"https://shop.example.com/other"}),"https://shop.example.com/sweater"), (e: unknown) => e instanceof ProductImportError && e.code === "AMBIGUOUS");
  assert.throws(() => extractProduct(html([group,group]),"https://shop.example.com/sweater"), (e: unknown) => e instanceof ProductImportError && e.code === "AMBIGUOUS");
});


test("Himalaya teknik satırları açık alanlara aktarılır, belirsiz bilgiler tahmin edilmez", () => {
  const html = fixture("himalaya-arisya.html");
  const empty = extractProduct(html, "https://www.himalaya.com.tr/arisya.html");
  assert.deepEqual(empty.technicalDetails, {});
  assert.match(empty.warnings.join(" "), /aktarılabilir teknik özellik bulunamadı/);
  const features = `<div class="product-features"><h1>PRODUCT FEATURES</h1>
    <div class="item"><strong>Mixture ( Materials )</strong><span>: 76% Acrylic 13% Polyamide 11% Wool</span><div class="clearfix"></div></div>
    <div class="item"><strong>Weight of Ball</strong><span>: 100g - 3.5oz</span></div>
    <div class="item"><strong>Length of Ball</strong><span>: 153mt - 167yards</span></div>
    <div class="item"><strong>Needle Size</strong><span>: 6mm - US10</span></div>
    <div class="item"><strong>Crochet Size</strong><span>: 5.5mm</span></div>
    <div class="item"><strong>Tickness</strong><span>: 4 Medium</span></div>
    <div class="item"><strong>Season</strong><span>: Autumn-Winter</span></div>
    <div class="item"><strong>Product Content</strong><span>: 10x10 cm measure 16 rows 14 stitches.</span></div>
  </div>`;
  const populated = html.replace('<div class="product-features"><h1>PRODUCT FEATURES</h1></div>', features);
  const p = extractProduct(populated, "https://www.himalaya.com.tr/air-wool-drops.html");
  assert.deepEqual(p.technicalDetails, {composition:"76% Acrylic 13% Polyamide 11% Wool",length:"100g - 3.5oz / 153mt - 167yards",knittingNeedle:"6mm - US10",crochetNeedle:"5.5mm",yarnType:"4 Medium",season:"Autumn-Winter"});
  assert.match(p.description, /Product Content: 10x10 cm measure/);
  const ambiguous = populated.replace('<div class="item"><strong>Mixture ( Materials )</strong>', '<div class="item"><strong>Mixture ( Materials )</strong><span>: başka değer</span></div><div class="item"><strong>Mixture ( Materials )</strong>');
  const conflict = extractProduct(ambiguous, "https://www.himalaya.com.tr/air-wool-drops.html");
  assert.equal(conflict.technicalDetails?.composition, undefined);
  assert.match(conflict.warnings.join(" "), /çelişen teknik özellikler/);
  const onlyContent = html.replace('<div class="product-features"><h1>PRODUCT FEATURES</h1></div>', '<div class="product-features"><div class="item"><strong>Product Content</strong><span>: 10x10 cm</span></div></div>');
  assert.deepEqual(extractProduct(onlyContent,"https://www.himalaya.com.tr/arisya.html").technicalDetails, {});
});

test("Arisya Türkçe kaynakta özellikleri ve renk kodlarına ait fotoğrafları getirir", () => {
  const product = extractProduct(fixture("himalaya-arisya-tr.html"), "https://www.himalaya.com.tr/arisya.html");
  assert.deepEqual(product.technicalDetails, {composition:"%96 Cotton %4 Glitter",length:"100gr-3,5 oz",knittingNeedle:"5,5 mm",crochetNeedle:"4 mm",yarnType:"2,5",season:"ilkbahar-yaz"});
  for (const label of ["Nerede Kullanılabilir", "İlmek Bilgisi", "Ürün İçeriği"]) assert.ok(product.description.includes(label));
  assert.match(product.description, /18 sıra 22 ilmek/);
  assert.deepEqual(product.variants?.map(v => v.colorName), ["27-01", "27-02"]);
  assert.match(product.variants![0].imageUrl, /thumb_product_01_/);
  assert.match(product.variants![1].imageUrl, /thumb_product_02_/);
});
