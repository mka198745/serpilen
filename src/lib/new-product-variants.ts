export type NewProductVariant = {
  colorName: string;
  colorHex: string;
  size: string;
  length: string;
  sku: string;
  barcode: string;
  buyPrice: string;
  retailPrice: string;
  initialStock: number;
};

export class VariantValidationError extends Error {}

/** Validate untrusted input before any product or stock is written. */
export function validateNewProductVariants(value: unknown): NewProductVariant[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 50) throw new VariantValidationError("En fazla 50 varyant eklenebilir.");
  const result: NewProductVariant[] = [];
  const combinations = new Set<string>();
  for (const [index, item] of value.entries()) {
    const fail = (message: string): never => { throw new VariantValidationError(`${index + 1}. varyant: ${message}`); };
    if (!item || typeof item !== "object" || Array.isArray(item)) fail("Geçersiz veri.");
    const fields = item as Record<string, unknown>;
    const text = (key: string, max: number) => {
      const raw = fields[key];
      if (raw !== undefined && typeof raw !== "string") return fail(`${key} metin olmalıdır.`);
      const val = (raw as string | undefined)?.trim() || "";
      if (val.length > max) return fail(`${key} çok uzun.`);
      return val;
    };
    const colorName = text("colorName", 100), colorHex = text("colorHex", 7), size = text("size", 100), length = text("length", 100);
    const sku = text("sku", 40), barcode = text("barcode", 80), buyPrice = text("buyPrice", 20), retailPrice = text("retailPrice", 20);
    if (!colorName && !size && !length) fail("Renk adı, ölçü veya uzunluk girin.");
    if (colorHex && !/^#[0-9a-f]{6}$/i.test(colorHex)) fail("Renk kodu geçersiz.");
    for (const price of [buyPrice, retailPrice]) if (price && (!/^\d+(?:\.\d{1,2})?$/.test(price) || Number(price) > 100000000)) fail("Fiyat sıfır veya pozitif olmalı ve en fazla iki ondalık basamak içermelidir.");
    const stock = fields.initialStock;
    if ((typeof stock !== "number" && typeof stock !== "string") || String(stock).trim() === "" || !/^\d+$/.test(String(stock)) || !Number.isSafeInteger(Number(stock)) || Number(stock) > 100000000) fail("Başlangıç stoğu sıfır veya pozitif tam sayı olmalıdır.");
    const combination = [colorName, size, length].map(x => x.toLocaleLowerCase("tr-TR")).join("\0");
    if (combinations.has(combination)) fail("Aynı renk, ölçü ve uzunluk zaten eklenmiş.");
    combinations.add(combination);
    result.push({ colorName, colorHex, size, length, sku, barcode, buyPrice, retailPrice, initialStock: Number(stock) });
  }
  return result;
}

/** Produce a legible, bounded base; uniqueness is checked inside the write transaction. */
export function variantSkuBase(productSku: string, variant: NewProductVariant): string {
  const part = (value: string) => value.toLocaleUpperCase("tr-TR").replace(/[İI]/g, "I").replace(/Ç/g, "C").replace(/Ğ/g, "G").replace(/Ö/g, "O").replace(/Ş/g, "S").replace(/Ü/g, "U").replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${part(productSku) || "URUN"}-${part(variant.colorName) || "GENEL"}-${part(variant.size || variant.length) || "STD"}`.slice(0, 32).replace(/-+$/, "");
}
