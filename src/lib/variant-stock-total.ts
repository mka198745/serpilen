const MAX_VARIANT_STOCK = 100_000_000;
const MAX_VARIANTS = 50;

/** Incomplete/invalid input is never silently treated as zero. */
function parseStock(value: string, max: number): number | null {
  if (!/^\d+$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n <= max ? n : null;
}

export function variantStockTotal(rows: ReadonlyArray<{ initialStock: string }>): number | null {
  if (rows.length > MAX_VARIANTS) return null;
  let total = 0;
  for (const row of rows) {
    const qty = parseStock(row.initialStock, MAX_VARIANT_STOCK);
    if (qty === null) return null;
    total += qty;
  }
  return total;
}

export function variantStockTarget(value: string): number | null {
  return parseStock(value, MAX_VARIANTS * MAX_VARIANT_STOCK);
}
