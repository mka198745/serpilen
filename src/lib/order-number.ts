/**
 * Sipariş numarası biçimi: SİP + YIL + 4 haneli sıra numarası.
 * Örnek: SİP20260001 (2026 yılı), SİP20270001 (2027 yılı).
 *
 * Numara tire ve boşluk içermez; yıl kısmı içinde bulunulan yıla göre otomatik değişir.
 */

export const ORDER_NO_PREFIX = "SİP";

/** İçinde bulunulan (yerel) yıl. */
export function currentOrderYear(date: Date = new Date()): number {
  return date.getFullYear();
}

/** Sıra numarasından sipariş numarası üretir: 7 -> SİP20260007 */
export function formatOrderNumber(sequence: number, year: number = currentOrderYear()): string {
  const safeSeq = Number.isFinite(sequence) && sequence > 0 ? Math.floor(sequence) : 1;
  return `${ORDER_NO_PREFIX}${year}${String(safeSeq).padStart(4, "0")}`;
}

/**
 * Sipariş numarasını çözer. "SİP20260007" ve "SIP20260007" (noktasız I) kabul edilir.
 * Biçim tutmuyorsa null döner (eski OR-2026-xxxxx numaraları gibi).
 */
export function parseOrderNumber(value: string | null | undefined): { year: number; sequence: number } | null {
  if (!value) return null;
  const match = /^S[İI]P(\d{4})(\d{1,8})$/.exec(value.trim().toUpperCase());
  if (!match) return null;
  return { year: Number(match[1]), sequence: Number(match[2]) };
}

/**
 * Arama/karşılaştırma için normalleştirme: Türkçe İ/I ve noktalama farkları yok sayılır.
 * "sip 2026-0007" -> "SIP20260007"
 */
export function normalizeOrderNumber(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .trim()
    .toUpperCase()
    .replace(/İ/g, "I")
    .replace(/[^A-Z0-9]/g, "");
}

/** Verilen numaralar arasındaki en büyük sıra numarasının bir fazlasını döndürür. */
export function nextSequenceFrom(
  numbers: Iterable<string | null | undefined>,
  year: number = currentOrderYear()
): number {
  let max = 0;
  for (const raw of numbers) {
    const parsed = parseOrderNumber(raw);
    if (!parsed || parsed.year !== year) continue;
    if (parsed.sequence > max) max = parsed.sequence;
  }
  return max + 1;
}

/** Geçerli yıl + biçim kontrolü (istemciden gelen numarayı doğrulamak için). */
export function isValidOrderNumber(value: string | null | undefined, year: number = currentOrderYear()): boolean {
  const parsed = parseOrderNumber(value);
  return !!parsed && parsed.year === year && parsed.sequence > 0;
}
