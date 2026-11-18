/** API'den gelen kayıt tarihini güvenle gösterir; eksik/hatalı değerleri gizler. */
export function formatRegistrationDate(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("tr-TR");
}
