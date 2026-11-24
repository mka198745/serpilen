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
