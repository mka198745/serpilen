import { load, type CheerioAPI } from "cheerio";
import { publicHttpsUrl, ProductImportError } from "./safe-fetch";
import { productSpecificationsFromPairs, type ProductSpecifications } from "../product-specifications";

type JsonObject = Record<string, unknown>;
export type ImportedVariant = { colorName: string; size: string; imageUrl: string };
export type ImportedProduct = { variants?: ImportedVariant[]; name: string; description: string; sku: string; barcode: string; brand: string; category: string; images: string[]; warnings: string[]; technicalDetails?: ProductSpecifications };
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

const MAX_IMPORTED_VARIANTS = 50;
function variantCollector(warnings: string[]) {
  const variants: ImportedVariant[] = [], seen = new Set<string>();
  let overflow = false;
  return {
    add(colorName: string, imageUrl: string | null, size = "") {
      const name = plain(colorName, 100), dimension = plain(size, 100);
      if (!name && !dimension) return;
      const key = `${name.toLocaleLowerCase("tr-TR")}\0${dimension.toLocaleLowerCase("tr-TR")}`;
      if (seen.has(key)) return;
      seen.add(key);
      if (variants.length >= MAX_IMPORTED_VARIANTS) { overflow = true; return; }
      variants.push({ colorName: name, size: dimension, imageUrl: imageUrl || "" });
    },
    result() {
      if (overflow) warnings.push("Kaynakta 50'den fazla varyant bulundu; yalnız ilk 50 seçenek getirildi.");
      if (variants.length) warnings.push("Varyant kodları kaynaktan alındı; isim, fotoğraf, fiyat ve stokları kaydetmeden önce kontrol edin. Stoklar sıfır başlar; boş fiyatlar ürün fiyatını kullanır.");
      if (variants.some(v => !v.imageUrl)) warnings.push("Bazı varyantların görselleri kaynakta bulunamadı; gerekirse elle ekleyin.");
      return variants;
    },
  };
}

/** Alize product pages use an h2/breadcrumb, a #t_teknik list and color-photo filenames. */
function extractAlize($: CheerioAPI, page: URL): ImportedProduct | null {
  if (!["alize.gen.tr", "www.alize.gen.tr"].includes(page.hostname.toLowerCase()) || !/^\/yumak\/[^/]+\/?$/i.test(page.pathname)) return null;
  const section = $("#t_teknik");
  const headings = $("h2.font-36").filter((_i, el) => $(el).parent().find("ol.breadcrumb").length > 0);
  if (section.length !== 1 || headings.length !== 1) return null;
  const heading = headings.first();
  const name = plain(heading.text(), 200);
  if (!name) return null;
  const pairs: Array<[string, string]> = [];
  section.find("h5").slice(0, 40).each((_i, el) => {
    const label = plain($(el).text(), 100);
    const value = plain($(el).next("p").text(), 300);
    if (label && value) pairs.push([label, value]);
  });
  const technicalDetails = productSpecificationsFromPairs(pairs);
  // The title and at least two independently named technical values are needed to avoid importing a generic page.
  if (Object.keys(technicalDetails).length < 2) return null;
  const summary = clean(heading.parent().find("ol.breadcrumb li a").first().html(), 6000);
  const sourceDescription = [technicalDetails.composition, technicalDetails.length].filter(Boolean).join(" / ");
  const note = clean(heading.parent().find(".urun_yazi").first().html(), 2000);
  const description = [sourceDescription || summary, sourceDescription && note ? note : ""].filter(Boolean).join("\n\n");
  const images: string[] = [];
  const warnings = ["Artikel No, SKU veya barkod değildir; SKU ve ticari bilgileri kendiniz kontrol edin."];
  const collected = variantCollector(warnings);
  const addImage = (raw: string) => {
    if (!raw || images.length >= 6) return;
    try {
      const image = publicHttpsUrl(raw, page.href);
      if (!["alize.gen.tr", "www.alize.gen.tr"].includes(image.hostname.toLowerCase()) || !/^\/uploads\/[^/]+\.(jpe?g|png|webp)$/i.test(image.pathname)) return;
      if (!images.includes(image.href)) images.push(image.href);
    } catch { /* skip unsafe or malformed image URLs */ }
  };
  addImage($("#my_image").first().attr("src") || "");
  // The site's color selector switches its main image to /uploads/<data-id>.
  $("#home").find('a[id="kesit_resim"][data-bilgi]').slice(0, 500).each((_i, el) => {
    const filename = $(el).attr("data-id") || "", code = $(el).attr("data-bilgi") || "";
    const validFile = /^[a-z0-9][a-z0-9._-]{0,195}\.(?:jpe?g|png|webp)$/i.test(filename);
    const image = validFile ? manufacturerImage(`/uploads/${filename}`, page, ["alize.gen.tr", "www.alize.gen.tr"], /^\/uploads\/[^/]+\.(?:jpe?g|png|webp)$/i) : null;
    if (/^[a-z0-9-]{1,40}$/i.test(code)) collected.add(code, image);
    if (image) addImage(image);
  });
  const variants = collected.result();
  if (images.length) warnings.push("Görseller farklı renklere ait olabilir; kaydetmeden önce uygun fotoğrafları seçin.");
  else warnings.push("Uygun ürün fotoğrafı bulunamadı.");
  if (!description) warnings.push("Ürün açıklaması bulunamadı.");
  return { name, description, sku: "", barcode: "", brand: "Alize", category: "", images, warnings, technicalDetails, variants };
}

/** Manufacturer-specific selectors only accept explicitly identified product sections. */
function manufacturerImage(raw: string, page: URL, hosts: string[], path: RegExp): string | null {
  try {
    const image = publicHttpsUrl(raw, page.href);
    return hosts.includes(image.hostname.toLowerCase()) && path.test(image.pathname) ? image.href : null;
  } catch { return null; }
}
/** Himalaya publishes labelled feature rows, with weight and length as separate values. */
function himalayaSpecifications(pairs: Array<[string, string]>, warnings: string[]): ProductSpecifications {
  const normalized = (text: string) => text.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").replace(/[^a-z0-9]+/g, " ").trim();
  const read = (...labels: string[]): string => {
    const matches = [...new Set(pairs.filter(([key]) => labels.includes(normalized(key))).map(([, value]) => value))];
    if (matches.length > 1) { warnings.push("Kaynakta çelişen teknik özellikler var; ilgili alanı elle kontrol edin."); return ""; }
    return matches[0] || "";
  };
  const specs: ProductSpecifications = {};
  const composition = read("mixture materials", "karisim", "karisimi", "karisim hammaddesi", "karisimi hammaddesi");
  const weight = read("weight of ball", "yumak agirligi", "yumak gramaji");
  const length = read("length of ball", "yumak uzunlugu", "yumak metraji", "etiket metraji");
  const yarnType = read("tickness", "thickness", "iplik kalinligi");
  const knittingNeedle = read("needle size", "knitting needle size", "sis no", "sis numarasi");
  const crochetNeedle = read("crochet size", "crochet hook size", "tig no", "tig numarasi");
  const season = read("season", "mevsim", "sezon", "kullanim mevsimi");
  if (composition) specs.composition = composition;
  if (weight || length) specs.length = [weight, length].filter(Boolean).join(" / ").slice(0, 300);
  if (yarnType) specs.yarnType = yarnType;
  if (knittingNeedle) specs.knittingNeedle = knittingNeedle;
  if (crochetNeedle) specs.crochetNeedle = crochetNeedle;
  if (season) specs.season = season;
  return specs;
}

function extractHimalaya($: CheerioAPI, page: URL): ImportedProduct | null {
  if (!["himalaya.com.tr", "www.himalaya.com.tr"].includes(page.hostname.toLowerCase()) || !/^\/[^/]+\.html$/i.test(page.pathname)) return null;
  const title = $(".page_title h1.red_title"), main = $(".product-image a.fancybox"), details = $(".product-description .detail_description");
  if (title.length !== 1 || main.length !== 1 || details.length !== 1 || !$(".product-features").length) return null;
  const name = plain(title.text(), 200);
  if (!name) return null;
  const warnings: string[] = [], pairs: Array<[string, string]> = [];
  $(".product-features").first().children(".item").slice(0, 40).each((_i, row) => {
    const label = plain($(row).children("strong").first().text(),100);
    const value = plain($(row).children("span").first().text(),300).replace(/^\s*:\s*/, "").trim();
    if (label && value) pairs.push([label,value]);
  });
  const technicalDetails = himalayaSpecifications(pairs, warnings);
  if (!Object.keys(technicalDetails).length) warnings.push("Bu sayfa yanıtında aktarılabilir teknik özellik bulunamadı; kaynağı kontrol edin.");
  const sourceDescription = clean(details.html(),6000);
  const extra = pairs.map(([key,value]) => `${key}: ${value}`).join("\n");
  const description = [sourceDescription, extra ? `Teknik özellikler:\n${extra}` : ""].filter(Boolean).join("\n\n").slice(0,6000);
  const image = manufacturerImage(main.attr("href") || main.find("img").attr("data-zoom-image") || "", page, ["himalaya.com.tr", "www.himalaya.com.tr"], /^\/uploads\/pictures\/[^/]+\.(?:jpe?g|png|webp)$/i);
  const collected = variantCollector(warnings);
  main.closest(".container").find('a[href^="javascript:urun_resim("]').slice(0, 500).each((_i, el) => {
    const link = $(el), href = link.attr("href") || "", card = link.parent();
    if (!/^javascript:urun_resim\(\d+\)$/i.test(href) || !card.is(".col-xs-6.col-md-3")) return;
    const code = plain(card.children("p.text-center").first().text(), 100);
    if (!/^[a-z0-9-]{1,40}$/i.test(code)) return;
    const photo = manufacturerImage(link.find("img").first().attr("src") || "", page, ["himalaya.com.tr", "www.himalaya.com.tr"], /^\/uploads\/pictures\/thumb_product_[^/]+\.(?:jpe?g|png|webp)$/i);
    collected.add(code, photo);
  });
  const variants = collected.result();
  if (!image) warnings.push("Uygun ürün fotoğrafı bulunamadı.");
  if (!description) warnings.push("Ürün açıklaması bulunamadı.");
  return { name, description, sku: "", barcode: "", brand: "Himalaya", category: "", images: image ? [image] : [], warnings, technicalDetails, variants };
}

function extractYarnArt($: CheerioAPI, page: URL): ImportedProduct | null {
  if (!["yarnart.info", "www.yarnart.info"].includes(page.hostname.toLowerCase()) || !/^\/urunler\/[^/]+\/[^/]+\/?$/i.test(page.pathname)) return null;
  const title = $("#left-sidebar h1.ya-catalog__title"), specs = $("#left-sidebar dl.ya-catalog__specs"), cards = $("a.ya-color-card");
  if (title.length !== 1 || specs.length !== 1 || cards.length === 0) return null;
  const name = plain(title.text(), 200);
  if (!name) return null;
  const pairs: Array<[string,string]> = [];
  specs.find(".ya-catalog__spec-row").slice(0, 30).each((_i, row) => {
    const key = plain($(row).find("dt").first().text(),100), value = plain($(row).find("dd").first().text(),300);
    if (key && value) pairs.push([key,value]);
  });
  if (!pairs.length) return null;
  const description = clean($("#left-sidebar .ya-catalog__desc-text").first().html(), 6000);
  const images: string[] = [];
  const warnings = ["Bu bağlantı ürün ailesini ve farklı renkleri içerir; kaydetmeden önce doğru fotoğraf ve rengi seçin."];
  const collected = variantCollector(warnings);
  cards.slice(0,500).each((_i, card) => {
    const link = $(card).attr("href") || "";
    try {
      const target = publicHttpsUrl(link, page.href);
      const parent = page.pathname.replace(/\/$/, "") + "/";
      if (target.hostname !== page.hostname || !target.pathname.startsWith(parent) || !/^[a-z0-9-]+\/?$/i.test(target.pathname.slice(parent.length))) return;
      const image = manufacturerImage($(card).find("img.ya-color-card__img").first().attr("src") || "", page, ["yarnart.info", "www.yarnart.info"], /^\/img\/\d+x\d+\/storage\/uploads\/[^?#]+\.(?:jpe?g|png|webp)$/i);
      const code = plain($(card).find(".ya-color-card__code").first().text(),100);
      if (/^[a-z0-9-]{1,40}$/i.test(code) && target.pathname.slice(parent.length).replace(/\/$/, "").toLowerCase() === code.toLowerCase()) collected.add(code, image);
      if (image && images.length < 6 && !images.includes(image)) images.push(image);
    } catch { /* Ignore invalid cards. */ }
  });
  const variants = collected.result();
  if (!images.length) warnings.push("Uygun ürün fotoğrafı bulunamadı.");
  if (!description) warnings.push("Ürün açıklaması bulunamadı.");
  return { name, description, sku: "", barcode: "", brand: "YarnArt", category: "", images, warnings, technicalDetails: productSpecificationsFromPairs(pairs), variants };
}

/** The detail page contains the complete client-side color list. Never trust its links
 * until the active detail and every returned color are bound to the family path. */
export function extractYarnArtDetailVariants(html: string, detailUrl: string, familyUrl: string, baseline: ImportedVariant[]): { variants: ImportedVariant[]; warnings: string[] } | null {
  let detail: URL, family: URL;
  try { detail = publicHttpsUrl(detailUrl); family = publicHttpsUrl(familyUrl); } catch { return null; }
  if (!["yarnart.info", "www.yarnart.info"].includes(family.hostname) || detail.origin !== family.origin || !/^\/urunler\/[^/]+\/[^/]+\/?$/i.test(family.pathname)) return null;
  const parent = family.pathname.replace(/\/$/, "") + "/";
  if (!detail.pathname.startsWith(parent)) return null;
  const active = detail.pathname.slice(parent.length).replace(/\/$/, "");
  if (!/^[a-z0-9-]{1,40}$/i.test(active)) return null;
  const $ = load(html), scripts = $("#ya-product-detail-config"), title = $("h1.ya-pd-info__title");
  if (scripts.length !== 1 || title.length !== 1 || plain(title.text(),100).toLowerCase() !== active.toLowerCase()) return null;
  const raw = scripts.first().text();
  if (!raw || raw.length > 512000) return null;
  let config: unknown;
  try { config = JSON.parse(raw); } catch { return null; }
  if (!isObject(config) || typeof config.activeColor !== "string" || config.activeColor.toLowerCase() !== active.toLowerCase() || !Array.isArray(config.colors) || !config.colors.length || config.colors.length > 500) return null;
  const valid: Array<{ code: string; image: string | null }> = [], seen = new Set<string>();
  let rejected = false;
  for (const item of config.colors) {
    if (!isObject(item) || typeof item.code !== "string" || typeof item.url !== "string" || !/^[a-z0-9-]{1,40}$/i.test(item.code)) { rejected = true; continue; }
    try {
      const target = publicHttpsUrl(item.url, detail.href), code = item.code, key = code.toLowerCase();
      if (target.origin !== family.origin || target.pathname.replace(/\/$/, "") !== parent + code || target.search || seen.has(key)) { rejected = true; continue; }
      seen.add(key);
      const image = manufacturerImage(typeof item.img === "string" ? item.img : "", detail, ["yarnart.info", "www.yarnart.info"], /^\/img\/\d+x\d+\/storage\/uploads\/[^?#]+\.(?:jpe?g|png|webp)$/i);
      valid.push({ code, image });
    } catch { rejected = true; }
  }
  if (!seen.has(active.toLowerCase()) || baseline.some(v => !seen.has(v.colorName.toLowerCase()))) return null;
  const warnings: string[] = [];
  if (rejected) warnings.push("YarnArt renk listesindeki bazı seçenekler doğrulanamadığı için alınmadı; eksikleri kontrol edin.");
  const collected = variantCollector(warnings);
  valid.forEach(v => collected.add(v.code, v.image));
  return { variants: collected.result(), warnings };
}

function extractNako($: CheerioAPI, page: URL): ImportedProduct | null {
  if (!["nako.com.tr", "www.nako.com.tr"].includes(page.hostname.toLowerCase()) || !/^(?:\/urun\/[^/]+|\/(?:en|de|ru)\/product\/[^/]+)\/?$/i.test(page.pathname)) return null;
  const title = $(".product-title h1"), details = $(".product-detail table");
  if (title.length !== 1 || details.length !== 1) return null;
  const name = plain(title.text(), 200), pairs: Array<[string,string]> = [];
  details.find("tr").slice(0,30).each((_i,row) => {
    const cells = $(row).find("td");
    if (cells.length < 2) return;
    const key = plain(cells.first().text(),100), value = plain(cells.last().text(),300);
    if (key && value && value !== ":") pairs.push([key,value]);
  });
  if (!name || pairs.length < 2) return null;
  const description = pairs.map(([key,value]) => `${key}: ${value}`).join("\n").slice(0,6000);
  const technicalDetails = productSpecificationsFromPairs(pairs);
  // Preserve the source labels and units verbatim; a bare number is not proof of grams or metres.
  const lengthPairs = pairs.filter(([key]) => /^(?:yumak gramaj[ıi]?|etiket metraj[ıi]?|ball weight|label quantity)$/i.test(key.trim())).slice(0,2);
  if (lengthPairs.length && !technicalDetails.length) technicalDetails.length = lengthPairs.map(([key,value]) => `${key}: ${value}`).join(" / ").slice(0,300);
  const rawImage = $("#primary-image").attr("data-zoom-image") || $("#primary-image").attr("src") || "";
  const image = manufacturerImage(rawImage, page, ["nako.com.tr", "www.nako.com.tr"], /^\/idea\/[^/]+\/[^/]+\/myassets\/products\/[^/]+\/[^/]+\.(?:jpe?g|png|webp)$/i);
  const warnings = ["Üreticinin açıklamasındaki değerleri ve görselin rengini kaydetmeden önce kontrol edin."];
  const collected = variantCollector(warnings);
  const groups = $(".variant-plural .variant-list-group");
  if (groups.length === 1 && /^(?:renk|color|colour)$/i.test(plain(groups.first().find(".variant-group-title").first().text(),100))) {
    groups.first().find(".variant-list .variant-image[data-option-title]").slice(0,500).each((_i, el) => {
      const option = $(el), code = option.attr("data-option-title") || "";
      if (!/^[a-z0-9_-]{1,60}$/i.test(code)) return;
      const photo = manufacturerImage(option.find("img").first().attr("src") || "", page, ["nako.com.tr", "www.nako.com.tr"], /^\/idea\/[^/]+\/[^/]+\/myassets\/options\/[^/]+\.(?:jpe?g|png|webp)$/i);
      collected.add(code, photo);
    });
  } else if (groups.length > 1) warnings.push("Birden fazla varyant grubu var; geçerli kombinasyonlar doğrulanamadığı için otomatik eklenmedi.");
  const variants = collected.result();
  if (!image) warnings.push("Uygun ürün fotoğrafı bulunamadı.");
  return { name, description, sku: "", barcode: "", brand: "Nako", category: "", images: image ? [image] : [], warnings, technicalDetails, variants };
}

function extractMilano($: CheerioAPI, page: URL): ImportedProduct | null {
  if (!["milanorafya.com", "www.milanorafya.com"].includes(page.hostname.toLowerCase()) || !/^\/(?:tr\/)?[^/]+\/?$/i.test(page.pathname)) return null;
  const title = $(".product-name-main h1.product-name"), brand = $(".product-name-main .brand-name");
  const tabs = $(".tab").filter((_i, tab) => plain($(tab).find(".title").first().text(),100).toLocaleLowerCase("tr-TR") === "ürün açıklaması");
  if (title.length !== 1 || brand.length !== 1 || tabs.length !== 1 || tabs.find(".tab-content").length !== 1) return null;
  const name = plain(title.text(),200);
  if (!name) return null;
  const text = tabs.find(".tab-content").first().clone(); text.find("#show-all-description, button").remove();
  const description = clean(text.html(),6000);
  const products: JsonObject[] = [];
  $('script[type="application/ld+json"]').slice(0,25).each((_i, el) => {
    const raw = $(el).text(); if (raw.length > 512000) return;
    try { products.push(...productCandidates(JSON.parse(raw))); } catch { /* ignore invalid JSON */ }
  });
  const matching = products.filter(p => plain(p.name,200) === name);
  if (matching.length > 1) throw new ProductImportError("AMBIGUOUS", "Sayfada birden fazla eşleşen ürün bulundu; görsel otomatik seçilemedi.");
  const candidates = valuesFromImage(matching[0]?.image);
  const images: string[] = [];
  for (const raw of candidates) {
    const image = manufacturerImage(raw, page, ["milanorafya.com", "www.milanorafya.com", "cdn.myikas.com"], /^\/images\/[^?#]+\.(?:jpe?g|png|webp)$/i);
    if (image && !images.includes(image) && images.length < 6) images.push(image);
  }
  if (!description && !images.length) return null;
  const length = name.match(/\b\d+(?:[.,]\d+)?\s*(?:gr|g)\s*\/\s*\d+(?:[.,]\d+)?\s*(?:metre|m)\b/i)?.[0];
  const warnings = ["Ürün bilgileri kaynak sayfadan alınmıştır; özellikle renk ve görselleri kaydetmeden önce kontrol edin."];
  if (!description) warnings.push("Ürün açıklaması bulunamadı.");
  if (!images.length) warnings.push("Uygun ürün fotoğrafı bulunamadı.");
  return { name, description, sku: "", barcode: "", brand: plain(brand.text(),100), category: "", images, warnings, technicalDetails: length ? {length} : {} };
}

/** A ProductGroup is usable only if it explicitly identifies this exact page and embeds its variants. */
function extractProductGroup($: CheerioAPI, page: URL): ImportedProduct | null {
  const groups: JsonObject[] = [];
  $('script[type="application/ld+json"]').slice(0,25).each((_i, el) => {
    const text = $(el).text(); if (text.length > 512000) return;
    try {
      const stack: Array<{ value: unknown; depth: number }> = [{ value: JSON.parse(text), depth: 0 }]; let visited = 0;
      while (stack.length && visited++ < 5000) {
        const {value, depth} = stack.pop()!;
        if (depth > 20) continue;
        if (Array.isArray(value)) { for (const item of value.slice(0,500)) stack.push({value:item,depth:depth+1}); continue; }
        if (!isObject(value)) continue;
        const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
        const groupUrl = typeof value.url === "string" ? value.url : typeof value["@id"] === "string" ? value["@id"] : "";
        if (groupUrl.trim() && types.some(type => typeof type === "string" && /^(?:https?:\/\/schema\.org\/)?ProductGroup$/i.test(type)) && samePage(groupUrl, page)) groups.push(value);
        for (const child of Object.values(value).slice(0,500)) if (child && typeof child === "object") stack.push({value:child,depth:depth+1});
      }
    } catch { /* ignore invalid JSON */ }
  });
  if (groups.length > 1) throw new ProductImportError("AMBIGUOUS", "Sayfaya ait birden fazla ürün grubu bulundu.");
  const group = groups[0];
  if (!group || !Array.isArray(group.hasVariant) || !group.hasVariant.length) return null;
  const name = plain(group.name,200); if (!name) return null;
  const warnings: string[] = [], collected = variantCollector(warnings);
  for (const entry of group.hasVariant.slice(0,500)) {
    if (!isObject(entry) || !isProduct(entry)) continue;
    const color = plain(entry.color,100), size = plain(entry.size,100);
    if (!color && !size) continue;
    let image = "";
    for (const raw of valuesFromImage(entry.image)) {
      try { image = publicHttpsUrl(raw,page.href).href; break; } catch { /* skip unsafe image */ }
    }
    collected.add(color,image,size);
  }
  const variants = collected.result();
  if (!variants.length) return null;
  const images: string[] = [];
  for (const raw of valuesFromImage(group.image)) {
    try { const url = publicHttpsUrl(raw,page.href).href; if (!images.includes(url)) images.push(url); } catch { /* skip unsafe image */ }
    if (images.length >= 6) break;
  }
  const brandValue = group.brand;
  const brand = plain(isObject(brandValue) ? brandValue.name : brandValue, 100);
  const description = clean(group.description,6000);
  if (!description) warnings.push("Ürün açıklaması bulunamadı.");
  if (!images.length) warnings.push("Uygun ürün fotoğrafı bulunamadı.");
  return { name, description, sku: "", barcode: "", brand, category: plain(group.category,100), images, warnings, technicalDetails: productSpecificationsFromPairs(properties(group.additionalProperty)), variants };
}

/** Structured Product, product-specific OpenGraph/microdata, or supported manufacturer pages. Never interprets prices or stocks. */
export function extractProduct(html: string, pageUrl: string): ImportedProduct {
  const page = publicHttpsUrl(pageUrl);
  const $ = load(html);
  const alize = extractAlize($, page);
  if (alize) return alize;
  const manufacturer = extractHimalaya($, page) || extractYarnArt($, page) || extractNako($, page) || extractMilano($, page);
  if (manufacturer) return manufacturer;
  const group = extractProductGroup($,page);
  if (group) return group;
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
  return { name, description: combined, sku, barcode, brand, category, images, warnings, technicalDetails: productSpecificationsFromPairs(specs) };
}
