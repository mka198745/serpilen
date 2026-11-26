/** Saf hesaplama: bilinmeyen geçmişi başarı olarak varsaymaz. I/O yapmaz. */
export type SupplierRatingOrder = {
  id: number;
  completedAt: number | null;
  /** Aynı saniyede tamamlanan siparişlerde mal kabul fişi sırası. */
  completionSequence?: number;
  /** Takvim tarihi, YYYY-MM-DD. */
  completedDate: string | null;
  expectedDate: string | null;
  receivedQty: number | null;
  returnedQty: number | null;
  /** İadelerin bu sipariş için sistemde eksiksiz kaydedildiği doğrulanmış mı? */
  returnsCovered: boolean;
};
export type SupplierRatingResult = {
  score: number | null;
  completedCount: number;
  orderIds: number[];
  delivery: number | null;
  returns: number | null;
  terms: number | null;
  missing: string[];
};

/** Yalnız kesin, gün cinsinden tek vade ifadesi kabul edilir. */
export function parsePaymentTermDays(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const text = value.trim().toLocaleLowerCase("tr-TR");
  if (text === "peşin") return 0;
  const match = /^(\d{1,4})\s*gün(?:\s+vade)?$/.exec(text);
  if (!match) return null;
  const days = Number(match[1]);
  return days <= 3650 ? days : null;
}

function dateIsValid(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/**
 * 1–5 yıldız: teslimat %50, iade edilmeyen miktar %30, göreli vade %20.
 * Son üç tamamlanan siparişin tamamı gerekli. Vade için en az bir geçerli
 * diğer aktif tedarikçi gerekir. Eksik veya tutarsız veride puan üretilmez.
 */
export function calculateSupplierRating(orders: SupplierRatingOrder[], ownTerms: unknown, peerTerms: unknown[]): SupplierRatingResult {
  const missing: string[] = [];
  // Sıralama için tarih yoksa hangi siparişlerin son üç olduğu bilinemez.
  const incompleteOrderDates = orders.some(o => !Number.isFinite(o.completedAt) || (o.completedAt ?? 0) <= 0);
  const latest = [...orders].sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0) || (b.completionSequence ?? 0) - (a.completionSequence ?? 0) || b.id - a.id).slice(0, 3);
  if (orders.length < 3) missing.push("En az 3 tamamlanmış sipariş gerekli");
  if (incompleteOrderDates) missing.push("Tamamlanma tarihi eksik");

  let delivery: number | null = null;
  let returns: number | null = null;
  let terms: number | null = null;
  if (latest.length === 3 && !incompleteOrderDates && latest.every(o => dateIsValid(o.completedDate) && dateIsValid(o.expectedDate))) {
    delivery = latest.filter(o => o.completedDate! <= o.expectedDate!).length / 3;
  } else missing.push("Teslim veya beklenen teslim tarihi eksik/geçersiz");

  if (latest.length === 3 && !incompleteOrderDates && latest.every(o => o.returnsCovered && Number.isSafeInteger(o.receivedQty) && (o.receivedQty ?? 0) > 0 && Number.isSafeInteger(o.returnedQty) && (o.returnedQty ?? -1) >= 0 && o.returnedQty! <= o.receivedQty!)) {
    const total = latest.reduce((n, o) => n + o.receivedQty!, 0);
    const returned = latest.reduce((n, o) => n + o.returnedQty!, 0);
    returns = 1 - returned / total;
  } else missing.push("İade geçmişi veya kabul miktarı eksik/tutarsız");

  const own = parsePaymentTermDays(ownTerms);
  const peers = peerTerms.map(parsePaymentTermDays).filter((n): n is number => n !== null);
  if (own === null || peers.length === 0) missing.push("Karşılaştırılabilir vade bilgisi eksik");
  else {
    // Diğerlerine göre yüzdelik konum; eşitlik yarım puan katkısı sağlar.
    terms = peers.reduce((sum, n) => sum + (own > n ? 1 : own === n ? 0.5 : 0), 0) / peers.length;
  }
  return {
    score: delivery === null || returns === null || terms === null || orders.length < 3 || incompleteOrderDates
      ? null : Math.round((1 + 4 * (0.5 * delivery + 0.3 * returns + 0.2 * terms)) * 10) / 10,
    completedCount: orders.length,
    orderIds: latest.map(o => o.id), delivery, returns, terms, missing,
  };
}
