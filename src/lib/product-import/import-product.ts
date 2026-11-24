import { extractProduct, extractYarnArtDetailVariants, type ImportedProduct } from "./extract";
import { fetchPublicProductPage, ProductImportError, publicHttpsUrl } from "./safe-fetch";

type Page = Awaited<ReturnType<typeof fetchPublicProductPage>>;
type PageFetcher = (url: string) => Promise<Page>;
const incomplete = "YarnArt'ın tüm renkleri doğrulanamadı; yalnız ilk sayfadaki seçenekler getirildi. Eksikleri elle kontrol edin.";

/** Imports family data and, for YarnArt, a verified detail page's full color list. */
export async function importProduct(input: string, fetchPage: PageFetcher = fetchPublicProductPage): Promise<ImportedProduct> {
  const initial = await fetchPage(input);
  const initialUrl = publicHttpsUrl(initial.url);
  const match = ["yarnart.info", "www.yarnart.info"].includes(initialUrl.hostname)
    ? /^(\/urunler\/[^/]+\/[^/]+)(?:\/([a-z0-9-]{1,40}))?\/?$/i.exec(initialUrl.pathname) : null;
  if (!match) {
    const product = extractProduct(initial.html, initial.url);
    if (initial.warnings) product.warnings.push(...initial.warnings);
    return product;
  }
  const familyUrl = new URL(match[1], initialUrl.origin);
  let family = initial;
  if (match[2]) {
    family = await fetchPage(familyUrl.href);
    const returned = publicHttpsUrl(family.url);
    if (returned.origin !== familyUrl.origin || returned.pathname.replace(/\/$/, "") !== familyUrl.pathname) throw new ProductImportError("AMBIGUOUS", "YarnArt ürün ailesi doğrulanamadı.");
  }
  const product = extractProduct(family.html, family.url);
  if (product.brand !== "YarnArt") throw new ProductImportError("NO_PRODUCT", "YarnArt ürün ailesi doğrulanamadı.");
  if (family.warnings) product.warnings.push(...family.warnings);
  if (initial.warnings && family !== initial) product.warnings.push(...initial.warnings);
  const baseline = product.variants || [];
  if (!baseline.length) { product.warnings.push(incomplete); return product; }
  const code = match[2] || baseline[0].colorName;
  if (!/^[a-z0-9-]{1,40}$/i.test(code)) { product.warnings.push(incomplete); return product; }
  const expected = new URL(`${familyUrl.pathname}/${code}`, familyUrl.origin);
  try {
    const detail = match[2] ? initial : await fetchPage(expected.href);
    const actual = publicHttpsUrl(detail.url);
    if (actual.origin !== expected.origin || actual.pathname.replace(/\/$/, "") !== expected.pathname) throw new Error("Unexpected detail URL");
    const verified = extractYarnArtDetailVariants(detail.html, actual.href, familyUrl.href, baseline);
    if (!verified) throw new Error("Invalid detail data");
    product.variants = verified.variants;
    product.warnings = product.warnings.filter(w => !w.startsWith("Varyant kodları kaynaktan alındı;") && !w.startsWith("Bazı varyantların görselleri kaynakta bulunamadı"));
    product.warnings.push(...verified.warnings);
    if (match[2]) product.warnings.push(`Bu bağlantı ${code} varyantına ait; aynı ürün ailesindeki seçenekler birlikte getirildi.`);
  } catch {
    product.warnings.push(incomplete);
  }
  return product;
}
