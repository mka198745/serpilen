/**
 * Karar finans karşılaştırıcı — saf fonksiyonlar.
 * Mevcut duruma göre alternatifin deltasını hesaplar; yetersiz veride null döner.
 */
export interface AlternativeFinancials {
  expectedRevenue: number | null;
  expectedProfit: number | null;
  expectedCost: number | null;
  cashNeed: number | null;
}

export interface FinancialDelta {
  revenueDelta: number | null;
  profitDelta: number | null;
  costDelta: number | null;
  cashDelta: number | null;
  /** Geri ödeme süresi (ay) = nakit ihtiyacı / aylık kâr artışı; tanımsızsa null */
  paybackMonths: number | null;
  /** Basit ROI % = (dönem kâr deltası) / (maliyet + nakit ihtiyacı); payda 0 → null */
  simpleReturnPct: number | null;
}

export function compareFinancials(current: AlternativeFinancials, alt: AlternativeFinancials, periodDays: number): FinancialDelta {
  const sub = (a: number | null, b: number | null): number | null => (a == null || b == null ? null : Number((a - b).toFixed(2)));
  const revenueDelta = sub(alt.expectedRevenue, current.expectedRevenue);
  const profitDelta = sub(alt.expectedProfit, current.expectedProfit);
  const costDelta = sub(alt.expectedCost, current.expectedCost);
  const cashDelta = sub(alt.cashNeed, current.cashNeed);

  let paybackMonths: number | null = null;
  let simpleReturnPct: number | null = null;
  const denom = Math.max(0, alt.expectedCost ?? 0) + Math.max(0, alt.cashNeed ?? 0);
  if (profitDelta != null && periodDays > 0) {
    const monthly = (profitDelta / periodDays) * 30;
    if (alt.cashNeed != null && alt.cashNeed > 0 && monthly > 0) {
      paybackMonths = Number((alt.cashNeed / monthly).toFixed(1));
    }
    if (denom > 0) simpleReturnPct = Number(((profitDelta / denom) * 100).toFixed(1));
  }
  return { revenueDelta, profitDelta, costDelta, cashDelta, paybackMonths, simpleReturnPct };
}

/** Güvenli TL formatı (string, tr-TR). */
export function fmtTlCompact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)} M TL`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)} B TL`;
  return `${sign}${abs.toFixed(0)} TL`;
}
