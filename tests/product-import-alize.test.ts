import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { extractProduct } from "../src/lib/product-import/extract";

// Minimized structural fixture from the public manufacturer page. It contains no cookies or scripts.
const fixture = fs.readFileSync(new URL("./fixtures/alize-baby-best.html", import.meta.url), "utf8");

test("Alize ürün sayfasının başlığını, özelliklerini ve yumak fotoğraflarını okur", () => {
  const product = extractProduct(fixture, "https://alize.gen.tr/yumak/baby-best#t_teknik");
  assert.equal(product.name, "BABY BEST");
  assert.equal(product.brand, "Alize");
  assert.equal(product.sku, "");assert.equal(product.barcode, "");
  assert.equal(product.description, "%10 Bambu - %90 Akrilik (Anti-pilling Akrilik) / 100 gr - 240 m\n\nAnti-Pilling acrylic is used in this product.");
  assert.deepEqual(product.technicalDetails, {articleNo:"260",composition:"%10 Bambu - %90 Akrilik (Anti-pilling Akrilik)",length:"100 gr - 240 m",yarnType:"Klasik",packaging:"5 x 100 gr",knittingNeedle:"4-5",crochetNeedle:"2-4",season:"Sonbahar / Kış Koleksiyon"});
  assert.deepEqual(product.images, ["https://alize.gen.tr/uploads/151746890726000055.jpg", "https://alize.gen.tr/uploads/26000506.jpg"]);
  assert.ok(product.warnings.some(x=>x.includes('farklı renklere')));
  assert.ok(!product.images.some(x=>x.includes('model.jpg') || x.includes('147573975655.jpg') || x.includes('15414155145x100_gr.jpg')));
});

test("Destek üretici ve ürün sayfası ile sınırlıdır; eksik, belirsiz ve güvensiz veriler reddedilir", () => {
  assert.throws(() => extractProduct(fixture, "https://other.example/yumak/baby-best"), /desteklenen ürün bilgisi/);
  assert.throws(() => extractProduct(fixture, "https://alize.gen.tr/yumak"), /desteklenen ürün bilgisi/);
  assert.throws(() => extractProduct(fixture.replace('id="t_teknik"','id="other"'), "https://alize.gen.tr/yumak/baby-best"), /desteklenen ürün bilgisi/);
  assert.throws(() => extractProduct(fixture.replace('BABY BEST</h2>','BABY BEST</h2><h2 class="font-36">YANLIŞ</h2><ol class="breadcrumb"></ol>'), "https://alize.gen.tr/yumak/baby-best"), /desteklenen ürün bilgisi/);
  const alt = fixture.replace('Article No','Artikel No').replace('Content','Karışım').replace('Knitting Needle','Şiş No').replace('Crochet Needle','Tığ No');
  assert.equal(extractProduct(alt, "https://www.alize.gen.tr/yumak/baby-best").technicalDetails?.knittingNeedle, '4-5');
});
