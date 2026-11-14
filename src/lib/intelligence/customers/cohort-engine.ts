/**
 * Cohort Analysis — ilk geçerli satın alma ayına göre gruplar.
 * Month 0 = ilk alışveriş ayı. Tamamlanmamış aylar retention=null (0 değil).
 */
import type { SalesBundle } from "../repositories";
import { isValidOrder, orderDate } from "../types";

export interface CohortReport {
  generatedAt: string;
  cohorts: Array<{
    cohort: string; // YYYY-MM
    size: number;
    retention: Array<number | null>; // month 0..12 (null = henüz tamamlanmadı)
  }>;
  overall: Array<{ month: number; retentionRate: number | null; cohorts: number }>;
  notes: string[];
}

const MAX_MONTHS = 12;

export function computeCohorts(bundle: SalesBundle): CohortReport {
  const valid = bundle.orders.filter(isValidOrder);
  const byCustomer = new Map<number, Date[]>();
  for (const o of valid) {
    if (o.customerId == null) continue;
    const arr = byCustomer.get(o.customerId) ?? [];
    arr.push(orderDate(o));
    byCustomer.set(o.customerId, arr);
  }

  const now = new Date();
  const currentMonthIndex = now.getFullYear() * 12 + now.getMonth();

  // Müşteri → ilk satın alma ayı indeksi
  const firstByCustomer = new Map<number, number>();
  const monthsByCustomer = new Map<number, Set<number>>();
  for (const [cid, dates] of byCustomer) {
    dates.sort((a, b) => a.getTime() - b.getTime());
    const first = dates[0];
    const firstIdx = first.getFullYear() * 12 + first.getMonth();
    firstByCustomer.set(cid, firstIdx);
    const set = new Set<number>();
    for (const d of dates) set.add(d.getFullYear() * 12 + d.getMonth());
    monthsByCustomer.set(cid, set);
  }

  const cohortsMap = new Map<number, number[]>();
  for (const [cid, firstIdx] of firstByCustomer) {
    const arr = cohortsMap.get(firstIdx) ?? [];
    arr.push(cid);
    cohortsMap.set(firstIdx, arr);
  }

  const cohorts = [...cohortsMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([cohortIdx, cids]) => {
      const retention: Array<number | null> = [];
      for (let m = 0; m <= MAX_MONTHS; m++) {
        const target = cohortIdx + m;
        if (target > currentMonthIndex) {
          retention.push(null); // dönem henüz tamamlanmadı — 0 diye gösterme
          continue;
        }
        const returned = cids.filter((cid) => monthsByCustomer.get(cid)?.has(target)).length;
        retention.push(cids.length ? Number(((returned / cids.length) * 100).toFixed(1)) : null);
      }
      const y = Math.floor(cohortIdx / 12);
      const mo = (cohortIdx % 12) + 1;
      return { cohort: `${y}-${String(mo).padStart(2, "0")}`, size: cids.length, retention };
    });

  const overall: CohortReport["overall"] = [];
  for (let m = 0; m <= MAX_MONTHS; m++) {
    const rates = cohorts.map((c) => c.retention[m]).filter((v): v is number => v != null);
    overall.push({
      month: m,
      retentionRate: rates.length ? Number((rates.reduce((s, v) => s + v, 0) / rates.length).toFixed(1)) : null,
      cohorts: rates.length,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    cohorts,
    overall,
    notes: [
      "Misafir/kasa satışları (customerId'siz) cohort'a dahil değildir.",
      "Month 0 = müşterinin ilk geçerli (iptal/iade hariç) satın alma ayı; her zaman %100.",
      "Henüz tamamlanmamış aylar null gösterilir — yanlışlık olsun diye 0 yazılmaz.",
    ],
  };
}
