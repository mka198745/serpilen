/**
 * RFM Engine — quantile-based 1-5 skorları; deterministik sıralama.
 * İptal/iade siparişleri hariç; iade tutarları netleştirilir.
 * Küçük örneklemlerde (<20 müşteri) uyarı döner — hatalı kesin segment iddiası yok.
 */
import type { SalesBundle } from "../repositories";
import { isValidOrder, orderDate } from "../types";
import { quantileScore } from "../core/statistics";

export interface RfmRow {
  customerId: number;
  customerName: string;
  recencyDays: number;
  frequency: number;
  monetary: number;
  rScore: number;
  fScore: number;
  mScore: number;
  segment: string;
  lastOrderAt: string | null;
}

export interface RfmReport {
  generatedAt: string;
  periodDays: number;
  customerCount: number;
  sampleWarning: string | null;
  segments: Array<{ segment: string; count: number; monetary: number }>;
  rows: RfmRow[];
  kpis: {
    repeatPurchaseRate: number | null;
    avgPurchaseIntervalDays: number | null;
    totalCustomers: number;
    oneTimeCustomers: number;
  };
  notes: string[];
}

export const SEGMENT_ACTIONS: Record<string, string> = {
  Champions: "En değerli müşteriler — özel erişim, erken satış ve teşekkür kampanyası ile koruyun.",
  "Loyal Customers": "Düzenli alışveriş — sadakat puanı ve kişiselleştirilmiş önerilerle pekiştirin.",
  "Potential Loyalists": "Son dönemde aktif — ikinci alışverişe teşvik (kupon, ücretsiz kargo) sunun.",
  "Recent Customers": "Yeni müşteri — onboarding ve ilk deneyim anketi ile bağ kurun.",
  Promising: "Potansiyeli var — kategori önerileri ve hafif indirim deneyin.",
  "Need Attention": "Orta seviye — canlandırma e-postası / kampanyası planlayın.",
  "At Risk": "Eski iyi müşteri — kayıp öncesi geri kazanma teklifi (önceden hatırlatma) yapın.",
  "Can't Lose Them": "Yüksek değer + uzun süre yok — kişisel iletişim ile geri kazanın.",
  Hibernating: "Uzaklaşmış — düşük maliyetli toplu kampanya ile test edin.",
  Lost: "Kaybedilmiş — yalnızca maliyetsiz otomasyon ile mesaj; negatif ROI'den kaçının.",
};

function segmentFor(r: number, f: number, m: number): string {
  if (r >= 4 && f >= 4 && m >= 4) return "Champions";
  if (f >= 4 && r >= 3) return "Loyal Customers";
  if (r >= 4 && f >= 2) return "Potential Loyalists";
  if (r >= 4) return "Recent Customers";
  if (r <= 2 && f >= 4 && m >= 4) return "Can't Lose Them";
  if (f >= 3 && r <= 2) return "At Risk";
  if (r === 3 && f <= 2) return "Promising";
  if (r <= 2 && f <= 2) return "Hibernating";
  if (r <= 2) return "Lost";
  return "Need Attention";
}

export function computeRfm(bundle: SalesBundle, periodDays = 365): RfmReport {
  const now = Date.now();
  const windowStart = now - periodDays * 86400000;
  const valid = bundle.orders.filter((o) => isValidOrder(o));
  const refundByOrder = new Map<number, number>();
  for (const r of bundle.refunds) {
    refundByOrder.set(r.orderId, (refundByOrder.get(r.orderId) ?? 0) + r.refundAmount);
  }

  const ordersInWindow = valid.filter((o) => orderDate(o).getTime() >= windowStart);
  const byCustomer = new Map<number, { name: string; orders: typeof valid; monetary: number; last: Date }>();
  for (const o of ordersInWindow) {
    if (o.customerId == null) continue; // misafir/kasa satışları RFM'e dahil değil
    const cur = byCustomer.get(o.customerId) ?? {
      name: o.customerName || `Müşteri #${o.customerId}`,
      orders: [],
      monetary: 0,
      last: new Date(0),
    };
    cur.orders.push(o);
    cur.monetary += Math.max(0, o.grandTotal - (refundByOrder.get(o.id) ?? 0));
    const d = orderDate(o);
    if (d > cur.last) cur.last = d;
    byCustomer.set(o.customerId, cur);
  }

  const drafts = [...byCustomer.entries()].map(([customerId, v]) => ({
    customerId,
    customerName: v.name,
    recencyDays: Math.floor((now - v.last.getTime()) / 86400000),
    frequency: v.orders.length,
    monetary: Number(v.monetary.toFixed(2)),
    lastOrderAt: v.last.toISOString(),
    orderDates: v.orders.map((o) => orderDate(o).getTime()).sort((a, b) => a - b),
  }));

  const n = drafts.length;
  const sortedRecency = drafts.map((d) => d.recencyDays).sort((a, b) => a - b);
  const sortedFrequency = drafts.map((d) => d.frequency).sort((a, b) => a - b);
  const sortedMonetary = drafts.map((d) => d.monetary).sort((a, b) => a - b);

  const rows: RfmRow[] = drafts.map((d) => {
    // Recency: küçük = iyi → invert=true
    const rFinal = quantileScore(d.recencyDays, sortedRecency, true);
    const fScore = quantileScore(d.frequency, sortedFrequency, false);
    const mScore = quantileScore(d.monetary, sortedMonetary, false);
    return {
      customerId: d.customerId,
      customerName: d.customerName,
      recencyDays: d.recencyDays,
      frequency: d.frequency,
      monetary: d.monetary,
      rScore: rFinal,
      fScore,
      mScore,
      segment: segmentFor(rFinal, fScore, mScore),
      lastOrderAt: d.lastOrderAt,
    };
  }).sort((a, b) => b.monetary - a.monetary);

  const segmentAgg = new Map<string, { count: number; monetary: number }>();
  for (const r of rows) {
    const e = segmentAgg.get(r.segment) ?? { count: 0, monetary: 0 };
    e.count++;
    e.monetary += r.monetary;
    segmentAgg.set(r.segment, e);
  }
  const segments = [...segmentAgg.entries()]
    .map(([segment, v]) => ({ segment, count: v.count, monetary: Number(v.monetary.toFixed(2)) }))
    .sort((a, b) => b.monetary - a.monetary);

  const repeat = rows.filter((r) => r.frequency >= 2).length;
  const intervals: number[] = [];
  for (const d of drafts) {
    for (let i = 1; i < d.orderDates.length; i++) {
      intervals.push((d.orderDates[i] - d.orderDates[i - 1]) / 86400000);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    periodDays,
    customerCount: n,
    sampleWarning: n < 20 ? `Örneklem küçük (${n} müşteri) — segment sınırları istatistiksel olarak zayıf; sonuçları ihtiyatla yorumlayın.` : null,
    segments,
    rows,
    kpis: {
      repeatPurchaseRate: n ? Number(((repeat / n) * 100).toFixed(1)) : null,
      avgPurchaseIntervalDays: intervals.length ? Number((intervals.reduce((s, v) => s + v, 0) / intervals.length).toFixed(1)) : null,
      totalCustomers: n,
      oneTimeCustomers: rows.filter((r) => r.frequency === 1).length,
    },
    notes: [
      "Recency gün cinsinden (küçük = iyi); F ve M büyükten iyiye 1-5 aralığında quantile skorlandı.",
      "Eşit puanlarda deterministik üst-sınır sıralaması kullanıldı.",
      "İptal/iade siparişler hariç; parasal değer iadeler düşülmüş NET cirondur.",
      "Misafir/kasa (customerId'siz) satışlar RFM'e dahil değildir.",
    ],
  };
}
