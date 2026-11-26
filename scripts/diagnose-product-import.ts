/** Read-only hosting diagnostic: exercises the exact production fetch/parser and image DNS rules. */
import { resolvePublicHost, publicHttpsUrl, ProductImportError } from "../src/lib/product-import/safe-fetch";
import { importProduct } from "../src/lib/product-import/import-product";

const urls = [
  "https://alize.gen.tr/yumak/baby-best",
  "https://www.himalaya.com.tr/arisya.html",
  "https://www.himalaya.com.tr/air-wool-drops.html",
  "https://yarnart.info/urunler/yazlik-ipler/jeans-splash",
  "https://yarnart.info/urunler/yazlik-ipler/jeans-splash/940",
  "https://milanorafya.com/milano-rafya--46-benetton-yesili--100-gr---250-metre",
  "https://www.nako.com.tr/urun/hercai",
];
async function main() {
  for (const url of urls) {
    try {
      const product = await importProduct(url);
      const signal = AbortSignal.timeout(4000);
      const hosts = new Map<string, Promise<boolean>>();
      const safe = (image: string) => {
        if (!image) return Promise.resolve(false);
        try {
          const host = publicHttpsUrl(image).hostname;
          if (!hosts.has(host)) hosts.set(host, resolvePublicHost(host, signal).then(() => true, () => false));
          return hosts.get(host)!;
        } catch { return Promise.resolve(false); }
      };
      const checks = await Promise.all(product.images.map(safe));
      const variants = product.variants || [];
      const variantImages = await Promise.all(variants.map(v => safe(v.imageUrl)));
      console.log(JSON.stringify({ source: url, result: "OK", name: product.name, brand: product.brand, technicalDetails: product.technicalDetails, imageCount: checks.filter(Boolean).length, variantCount: variants.length, variantImageCount: variantImages.filter(Boolean).length, firstVariants: variants.slice(0, 3).map((v,i) => ({ colorName: v.colorName, size: v.size, imageValidated: variantImages[i] })), warnings: product.warnings }));
    } catch (error) {
      console.log(JSON.stringify({ source: url, result: "ERROR", code: error instanceof ProductImportError ? error.code : "UNKNOWN", message: error instanceof Error ? error.message : "Bilinmeyen hata" }));
    }
  }
}
void main();
