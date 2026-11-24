/** Read-only hosting diagnostic: exercises the exact production fetch/parser and image DNS rules. */
import { fetchPublicProductPage, resolvePublicHost, publicHttpsUrl, ProductImportError } from "../src/lib/product-import/safe-fetch";
import { extractProduct } from "../src/lib/product-import/extract";

const urls = [
  "https://alize.gen.tr/yumak/baby-best",
  "https://www.himalaya.com.tr/arisya.html",
  "https://yarnart.info/urunler/yazlik-ipler/jeans-splash",
  "https://milanorafya.com/milano-rafya--46-benetton-yesili--100-gr---250-metre",
  "https://www.nako.com.tr/urun/hercai",
];
async function main() {
  for (const url of urls) {
    try {
      const page = await fetchPublicProductPage(url);
      const product = extractProduct(page.html, page.url);
      const signal = AbortSignal.timeout(4000);
      const checks = await Promise.all(product.images.map(async image => {
        try { await resolvePublicHost(publicHttpsUrl(image).hostname, signal); return true; } catch { return false; }
      }));
      console.log(JSON.stringify({ source: url, result: "OK", finalUrl: page.url, name: product.name, brand: product.brand, technicalDetails: product.technicalDetails, imageCount: checks.filter(Boolean).length, warnings: product.warnings }));
    } catch (error) {
      console.log(JSON.stringify({ source: url, result: "ERROR", code: error instanceof ProductImportError ? error.code : "UNKNOWN", message: error instanceof Error ? error.message : "Bilinmeyen hata" }));
    }
  }
}
void main();
