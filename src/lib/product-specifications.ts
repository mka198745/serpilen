export const PRODUCT_SPECIFICATION_FIELDS = [
  { key: "articleNo", label: "Artikel No" },
  { key: "composition", label: "Karışım" },
  { key: "size", label: "Ölçü" },
  { key: "length", label: "Metraj / Gramaj" },
  { key: "yarnType", label: "İplik Cinsi" },
  { key: "packaging", label: "Ambalaj" },
  { key: "knittingNeedle", label: "Şiş No" },
  { key: "crochetNeedle", label: "Tığ No" },
  { key: "season", label: "Sezon" },
] as const;

export type ProductSpecificationKey = (typeof PRODUCT_SPECIFICATION_FIELDS)[number]["key"];
export type ProductSpecifications = Partial<Record<ProductSpecificationKey, string>>;
const keys = new Set<string>(PRODUCT_SPECIFICATION_FIELDS.map(field => field.key));

/** Validates untrusted form input; undefined means leave unchanged, null clears. */
export function validateProductSpecifications(value: unknown): ProductSpecifications | null {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Teknik özellikler geçersiz.");
  const result: ProductSpecifications = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!keys.has(key) || typeof entry !== "string" || entry.length > 300) throw new Error("Teknik özellikler geçersiz veya çok uzun.");
    const trimmed = entry.trim();
    if (trimmed) result[key as ProductSpecificationKey] = trimmed;
  }
  return Object.keys(result).length ? result : null;
}

/** Old products and invalid legacy data simply have no structured details. */
export function parseProductSpecifications(value: unknown): ProductSpecifications {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return validateProductSpecifications(parsed) || {};
  } catch { return {}; }
}

function normalizeLabel(value: string): string {
  return value.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").replace(/[^a-z0-9]+/g, " ").trim();
}
const aliases: Record<string, ProductSpecificationKey> = {
  "artikel no": "articleNo", "article no": "articleNo", "article nr": "articleNo", "article number": "articleNo",
  "karisim": "composition", "karisimi hammaddesi": "composition", "karisim ham madde": "composition", "karisim hammadde": "composition", "mixture raw material": "composition", "content": "composition", "composition": "composition",
  "olcu": "size", "boyut": "size", "size": "size", "dimension": "size", "dimensions": "size",
  "metraj": "length", "metraj gramaj": "length", "length": "length", "lenght": "length", "weight and length": "length", "agirlik uzunluk": "length",
  "iplik cinsi": "yarnType", "iplik turu": "yarnType", "yarn type": "yarnType",
  "ambalaj": "packaging", "1 paket": "packaging", "package": "packaging", "packaging": "packaging",
  "sis no": "knittingNeedle", "ilgili sis numaralari": "knittingNeedle", "ilgili sis numarasi": "knittingNeedle", "related skewer numbers": "knittingNeedle", "knitting needle": "knittingNeedle",
  "tig no": "crochetNeedle", "ilgili tig numaralari": "crochetNeedle", "ilgili tig numarasi": "crochetNeedle", "related crochet numbers": "crochetNeedle", "crochet needle": "crochetNeedle",
  "sezon": "season", "mevsim": "season", "season": "season",
};

export function productSpecificationsFromPairs(pairs: Array<[string, string]>): ProductSpecifications {
  const result: ProductSpecifications = {};
  for (const [label, value] of pairs) {
    const key = aliases[normalizeLabel(label)];
    const clean = value.trim().slice(0, 300);
    if (key && clean && !result[key]) result[key] = clean;
  }
  return result;
}
