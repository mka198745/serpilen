import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractProduct } from "../src/lib/product-import/extract";
import { ProductImportError } from "../src/lib/product-import/safe-fetch";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

test("Himalaya açık ürün metni ve ana görseli alır, özellik uydurmaz", () => {
  const p = extractProduct(fixture("himalaya-arisya.html"), "https://www.himalaya.com.tr/arisya.html");
  assert.equal(p.name, "HİMALAYA ARİSYA"); assert.equal(p.brand, "Himalaya");
  assert.match(p.description, /Tığ ve şişe uygun/); assert.deepEqual(p.technicalDetails, {});
  assert.deepEqual(p.images, ["https://www.himalaya.com.tr/uploads/pictures/product_EN_yumak-imaj_08.07.2026_01_05_53.jpg"]);
  assert.equal(p.barcode, ""); assert.equal(p.sku, ""); assert.match(p.warnings.join(" "), /kontrol/);
});

test("YarnArt ailesinde teknik alanlar ve yalnız aileye ait renk görselleri alınır", () => {
  const p = extractProduct(fixture("yarnart-jeans-splash.html"), "https://yarnart.info/urunler/yazlik-ipler/jeans-splash");
  assert.equal(p.name, "Jeans Splash"); assert.equal(p.brand, "YarnArt");
  assert.deepEqual(p.technicalDetails, { composition: "55% Pamuk - 45% Pac (Akrilik)", length: "50 g / 1,76 oz - 160 m / 174 yds", yarnType: "Fine", knittingNeedle: "3.5 mm / US 4", crochetNeedle: "3.5 mm / E-4", packaging: "10 x 50 g" });
  assert.equal(p.images.length, 2); assert.match(p.images[0], /940.jpg$/); assert.match(p.images[1], /941.jpg$/);
  assert.match(p.warnings.join(" "), /renk/); assert.equal(p.barcode, ""); assert.equal(p.sku, "");
});

test("Nako tablo bilgisi ve ana görsel dışında önerileri almaz, olmayan birimleri eklemez", () => {
  const html = fixture("nako-hercai.html");
  for (const url of ["https://www.nako.com.tr/urun/hercai", "https://www.nako.com.tr/en/product/hercai-1695769"]) {
    const p = extractProduct(html, url);
    assert.equal(p.name, "HERCAI"); assert.equal(p.brand, "Nako");
    assert.equal(p.technicalDetails?.composition, "%100 Premium Akrilik");
    assert.equal(p.technicalDetails?.length, "Yumak gramajı: 100 / Etiket metrajı: 156");
    assert.equal(p.technicalDetails?.knittingNeedle, "6-7"); assert.equal(p.technicalDetails?.crochetNeedle, "5");
    assert.equal(p.technicalDetails?.season, "Sonbahar Kış");
    assert.deepEqual(p.images, ["https://www.nako.com.tr/idea/iu/13/myassets/products/769/28030.jpg?revision=1697143329"]);
  }
  const english = html.replace("Karışımı (Hammaddesi)", "Mixture (Raw Material)").replace("%100 Premium Akrilik", "100% Premium Acrylic").replace("Yumak gramajı", "Ball weight").replace("100</td>", "one hundred</td>").replace("Etiket metrajı", "Label quantity").replace("Mevsim", "Season").replace("İlgili şiş numaraları", "Related skewer numbers").replace("İlgili tığ numaraları", "Related crochet numbers");
  const p = extractProduct(english, "https://www.nako.com.tr/en/product/hercai-1695769");
  assert.equal(p.technicalDetails?.composition, "100% Premium Acrylic");
  assert.equal(p.technicalDetails?.length, "Ball weight: one hundred / Label quantity: 156");
  assert.equal(p.technicalDetails?.knittingNeedle, "6-7"); assert.equal(p.technicalDetails?.crochetNeedle, "5");
});

test("Milano ürünün kendisine eşleşen JSON-LD görsellerini ve açıklamayı alır", () => {
  const html = fixture("milano-rafya.html");
  const p = extractProduct(html, "https://milanorafya.com/milano-rafya--46-benetton-yesili--100-gr---250-metre");
  assert.equal(p.name, "Milano Rafya -46 Benetton Yeşili- 100 gr / 250 metre"); assert.equal(p.brand, "MİLANO RAFYA");
  assert.match(p.description, /örgü projeleriniz/); assert.doesNotMatch(p.description, /Devamını Göster/);
  assert.equal(p.technicalDetails?.length, "100 gr / 250 metre"); assert.equal(p.images.length, 2);
  assert.ok(p.images.every(x => !x.includes("another"))); assert.equal(p.barcode, ""); assert.equal(p.sku, "");
  assert.ok(!("price" in p)); assert.ok(!("stock" in p));
  const ambiguous = html.replace('</head>', '<script type="application/ld+json">{"@type":"Product","name":"Milano Rafya -46 Benetton Yeşili- 100 gr / 250 metre"}</script></head>');
  assert.throws(() => extractProduct(ambiguous, "https://milanorafya.com/a"), (e: unknown) => e instanceof ProductImportError && e.code === "AMBIGUOUS");
});

test("Desteklenen marka seçicileri başka hostlarda veya ilgisiz sayfalarda devreye girmez", () => {
  for (const name of ["himalaya-arisya.html", "yarnart-jeans-splash.html", "nako-hercai.html"]) {
    assert.throws(() => extractProduct(fixture(name), "https://other.example/product"), ProductImportError);
  }
  assert.throws(() => extractProduct(fixture("yarnart-jeans-splash.html"), "https://yarnart.info/urunler/yazlik-ipler/jeans-splash/940"), ProductImportError);
});
