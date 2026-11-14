/**
 * Türkçe karakterleri güvenle ASCII slug'a çevirir.
 * Örn: "Gütermann İplik A.Ş." → "gutermann-iplik-a-s"
 */
export function slugifyTr(input: string): string {
  const map: Record<string, string> = {
    ç: "c", Ç: "c",
    ğ: "g", Ğ: "g",
    ı: "i", I: "i", İ: "i",
    ö: "o", Ö: "o",
    ş: "s", Ş: "s",
    ü: "u", Ü: "u",
  };

  return input
    .split("")
    .map((ch) => map[ch] ?? ch)
    .join("")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 64);
}

/** Aynı slug zaten varsa sonuna rastgele suffix ekler. */
export function ensureUniqueSlug(base: string, exists: (slug: string) => boolean): string {
  let slug = base || "kayit";
  if (!exists(slug)) return slug;
  const suffix = Math.random().toString(36).slice(2, 6);
  return ensureUniqueSlug(`${base}-${suffix}`, exists);
}
