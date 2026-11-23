import { load } from "cheerio";
import { publicHttpsUrl, ProductImportError } from "./safe-fetch";

type JsonObject = Record<string, unknown>;
export type ImportedProduct = { name: string; description: string; sku: string; barcode: string; brand: string; category: string; images: string[]; warnings: string[] };
const isObject = (v: unknown): v is JsonObject => !!v && typeof v === "object" && !Array.isArray(v);
const strings = (v: unknown): string => typeof v === "string" || typeof v === "number" ? String(v) : "";
function clean(value: unknown, max: number): string {
  const raw = strings(value).slice(0, 30000);
  if (!raw) return "";
  const $ = load(`<body>${raw}</body>`);
  $("script,style,noscript,iframe,svg,object,template").remove();
  $("br").replaceWith("\n"); $("p,li,div,tr").each((_i, el) => { $(el).append("\n"); });
  return $("body").text().replace(/\r/g, "").replace(/[\t\f\v ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
}
function plain(value: unknown, max: number): string { return clean(value, max).replace(/\s+/g, " ").trim(); }
function isProduct(obj: JsonObject): boolean {
  const type = obj["@type"];
  return (Array.isArray(type) ? type : [type]).some(x => typeof x === "string" && /^(?:https?:\/\/schema\.org\/)?Product$/i.test(x));
}
function productCandidates(data: unknown): JsonObject[] {
  const found: JsonObject[] = [], stack: Array<{ value: unknown; depth: number }> = [{ value: data, depth: 0 }]; let visited = 0;
  while (stack.length && visited++ < 5000) {
    const { value, depth } = stack.pop()!;
    if (depth > 20) continue;
    if (Array.isArray(value)) { for (const child of value.slice(0, 500)) stack.push({ value: child, depth: depth + 1 }); continue; }
    if (!isObject(value)) continue;
    if (isProduct(value)) found.push(value);
    for (const child of Object.values(value).slice(0, 500)) if (child && typeof child === "object") stack.push({ value: child, depth: depth + 1 });
  }
  return found;
}
function samePage(value: unknown, page: URL): boolean {
  try { const target = new URL(strings(value), page); return target.origin === page.origin && target.pathname.replace(/\/$/, "") === page.pathname.replace(/\/$/, ""); } catch { return false; }
}
function chooseProduct(candidates: JsonObject[], page: URL): JsonObject | null {
  const unique = new Map<string, JsonObject>();
  for (const p of candidates) {
    const key = `${plain(p.name, 200)}\0${plain(p.sku, 80)}\0${strings(p.url)}`;
    if (!unique.has(key)) unique.set(key,p);
  }
  const items = [...unique.values()];
  if (items.length === 0) return null;
  if (items.length === 1) return items[0];
  const matching = items.filter(p => samePage(p.url || p["@id"], page));
  if (matching.length === 1) return matching[0];
  throw new ProductImportError("AMBIGUOUS", "Sayfada birden fazla ürün bulundu; doğru ürün otomatik seçilemedi.");
}
function valuesFromImage(input: unknown): string[] {
  if (Array.isArray(input)) return input.flatMap(valuesFromImage).slice(0, 30);
  if (isObject(input)) return valuesFromImage(input.url || input.contentUrl || input["@id"]);
  return typeof input === "string" ? [input] : [];
}
function properties(value: unknown): Array<[string, string]> {
  const list = Array.isArray(value) ? value : [value];
  return list.filter(isObject).map(item => [plain(item.name, 100), plain(item.value, 300)] as [string,string]).filter(([a,b]) => !!a && !!b).slice(0, 30);
}

/** Structured Product, or product-specific OpenGraph/microdata. Never interprets prices or stocks. */
export function extractProduct(html: string, pageUrl: string): ImportedProduct {
  const page = publicHttpsUrl(pageUrl);
  const $ = load(html);
  const candidates: JsonObject[] = [];
  $('script[type="application/ld+json"]').slice(0, 25).each((_index, el) => {
    const text = $(el).text(); if (text.length > 512000) return;
    try { candidates.push(...productCandidates(JSON.parse(text))); } catch { /* skip invalid structured data */ }
  });
  const product = chooseProduct(candidates,page);
  const roots = $('[itemscope][itemtype*="schema.org/Product"]');
  if (!product && roots.length > 1) throw new ProductImportError("AMBIGUOUS", "Sayfada birden fazla ürün bulundu; doğru ürün otomatik seçilemedi.");
  const root = roots.first();
  const meta = (property: string) => $("meta").filter((_i, el) => ($(el).attr("property") || $(el).attr("name") || "").toLowerCase() === property).first().attr("content") || "";
  const isOgProduct = meta("og:type").toLowerCase() === "product" || !!meta("product:price:amount");
  if (!product && !root.length && !isOgProduct) throw new ProductImportError("NO_PRODUCT", "Sayfada desteklenen ürün bilgisi bulunamadı. Site ürün bilgisini JavaScript veya giriş arkasında sunuyor olabilir.");
  const item = (key: string) => { const node = root.find(`[itemprop="${key}"]`).first(); return node.attr("content") || node.attr("value") || node.text(); };
  const name = plain(product?.name || item("name") || meta("og:title"), 200);
  if (!name) throw new ProductImportError("NO_PRODUCT", "Sayfada ürün adı bulunamadı.");
  const description = clean(product?.description || item("description") || meta("og:description") || meta("description"), 6000);
  const sku = plain(product?.sku || item("sku"), 100);
  const rawGtin = product?.gtin14 || product?.gtin13 || product?.gtin12 || product?.gtin8 || product?.gtin || item("gtin13") || item("gtin");
  const gtin = plain(rawGtin, 30);
  // Numeric JSON values may already have lost leading zeroes; require a string and a valid GTIN check digit.
  const digitsValid = typeof rawGtin === "string" && /^(?:\d{8}|\d{12,14})$/.test(gtin) && (gtin.slice(0,-1).split("").reverse().reduce((sum, digit, index) => sum + Number(digit) * (index % 2 === 0 ? 3 : 1), 0) + Number(gtin.at(-1))) % 10 === 0;
  const barcode = digitsValid ? gtin : "";
  const brandValue = product?.brand;
  const brand = plain(isObject(brandValue) ? brandValue.name : brandValue || item("brand"), 100);
  const category = plain(product?.category, 100);
  const specs = properties(product?.additionalProperty);
  const specContainers = $(".woocommerce-product-attributes, #tab-additional_information, [data-product-specifications], #product-specifications, .product-specifications, .product-attributes").slice(0, 4);
  specContainers.find("tr").slice(0, 30).each((_i, el) => {
    const key = plain($(el).find("th").first().text() || $(el).find("td").first().text(),100);
    const cells = $(el).find("td"); const value = plain(cells.last().text(),300);
    if (key && value && key !== value && !specs.some(([k,v]) => k === key && v === value)) specs.push([key,value]);
  });
  const technical = specs.slice(0,30).map(([key,value]) => `${key}: ${value}`).join("\n");
  const combined = [description, technical ? `Teknik özellikler:\n${technical}` : ""].filter(Boolean).join("\n\n").slice(0, 10000);
  const rawImages = [...valuesFromImage(product?.image), root.find('[itemprop="image"]').map((_i, el) => $(el).attr("content") || $(el).attr("src") || "").get(), ...$("meta").filter((_i, el) => ["og:image", "og:image:secure_url"].includes(($(el).attr("property") || "").toLowerCase())).slice(0, 10).map((_i, el) => $(el).attr("content") || "").get()].flat();
  const images: string[] = [];
  for (const raw of rawImages) {
    if (!raw || !raw.trim()) continue;
    try { const image = publicHttpsUrl(raw,page.href).href; if (!images.includes(image)) images.push(image); } catch { /* ignore unsafe URLs */ }
    if (images.length >= 6) break;
  }
  const warnings: string[] = [];
  if (!combined) warnings.push("Açıklama veya teknik özellik bulunamadı.");
  if (!images.length) warnings.push("Uygun görsel bağlantısı bulunamadı.");
  if (gtin && !barcode) warnings.push("Barkod doğrulanamadı, forma aktarılmadı.");
  return { name, description: combined, sku, barcode, brand, category, images, warnings };
}
