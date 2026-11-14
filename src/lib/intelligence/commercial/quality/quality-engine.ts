/**
 * RETURNS & QUALITY ENGINE — iade + onaylı yorum verisinden kalite sinyalleri.
 * Ürün kalite olay tablosu yoktur; kalite maliyeti = iade tutarı + yeniden stok dışı kayıptır.
 * İade nedeni serbest metindir → normalizasyon + anahtar kelime kümeleme (Pareto).
 */
import { combinedConfidence } from "../core/confidence-engine";
import { financialImpactScale } from "../core/priority-score";
import { buildOpportunity } from "../core/commercial-opportunity-engine";
import type { BuiltOpportunity } from "../core/commercial-opportunity-engine";
import type { ProductSales, ReturnDetail } from "../data-prep";

const n = (v: unknown) => Number(v ?? 0) || 0;
const r2 = (v: number) => Number(v.toFixed(2));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface QualitySettings {
  returnRateAlarmPct: number; // bu iade oranı üzeri alarm
  minUnits: number;           // analiz için asgari satış adedi
  lowRatingThreshold: number; // bu ortalama yorumun altı kalite şüphesi
  minReviews: number;
}

export const DEFAULT_QUALITY_SETTINGS: QualitySettings = {
  returnRateAlarmPct: 8,
  minUnits: 10,
  lowRatingThreshold: 3.5,
  minReviews: 3,
};

export interface ProductQualityRow {
  productId: number;
  name: string;
  sku: string;
  unitsSold: number;
  unitsReturned: number;
  returnRatePct: number | null;
  refundValue: number;
  reviewCount: number;
  avgRating: number | null;
  flags: Array<"HIGH_RETURN_RATE" | "LOW_RATING">;
}

export interface ReasonBucket {
  bucket: string;
  count: number;
  pct: number;
  refundAmount: number;
  sampleReasons: string[];
}

export interface QualityAnalysis {
  generatedAt: string;
  settings: QualitySettings;
  totals: {
    realizedRefunds: number;
    realizedRefundAmount: number;
    restockedSharePct: number | null; // stoklara geri giren pay
    totalReturnRows: number;
  };
  products: ProductQualityRow[];
  reasonPareto: ReasonBucket[];
  opportunities: BuiltOpportunity[];
  dataQuality: { status: "VERIFIED" | "PARTIAL" | "INSUFFICIENT_DATA"; notes: string[] };
}

/** Türkçe karakter indirme + küçültme (yerel kopya — ai-engine bağımlılığı yok). */
export function foldReason(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i")
    .replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const REASON_KEYWORDS: Array<{ bucket: string; keywords: string[] }> = [
  { bucket: "BEDEN / NUMARA", keywords: ["beden", "numara", "numarasi", "kalibi", "boyu", "sığmadı", "sigmadi", "kucuk", "buyuk"] },
  { bucket: "KUMAŞ / İPLİK", keywords: ["kumas", "iplik", "elyaf", "ritim", "tiftigi", "tiftik", "pelus", "penye"] },
  { bucket: "RENK / TON", keywords: ["renk", "tonu", "solma", "solmus", "renk sol", "parlak"] },
  { bucket: "HASAR / DEFO", keywords: ["hasar", "kirik", "bozuk", "defolu", "defo", "yirtik", "delik", "leke"] },
  { bucket: "YANLIŞ / EKSİK ÜRÜN", keywords: ["yanlis urun", "eksik parca", "eksik urun", "farkli urun", "kargodan yanlis"] },
  { bucket: "BEĞENMEDİ / CAYMA", keywords: ["begenmedim", "begenmedik", "vazgectim", "vazgectik", "cayma", "fikir degis"] },
  { bucket: "GECİKME / LOJİSTİK", keywords: ["gecik", "kargo", "gec geldi", "ulasmadi"] },
];

export function classifyReason(reason: string | null): string {
  if (!reason || !reason.trim()) return "BELİRTİLMEMİŞ";
  const folded = foldReason(reason);
  for (const { bucket, keywords } of REASON_KEYWORDS) {
    if (keywords.some((k) => folded.includes(k))) return bucket;
  }
  return "DİĞER";
}

export function analyzeQuality(opts: {
  salesByProduct: Map<number, ProductSales>;
  productDims: Map<number, { name: string; sku: string }>;
  returnsDetail: ReturnDetail[];
  approvedReviewsByProduct: Map<number, { count: number; avgRating: number }>;
  settings?: Partial<QualitySettings>;
}): QualityAnalysis {
  const settings: QualitySettings = { ...DEFAULT_QUALITY_SETTINGS, ...(opts.settings ?? {}) };
  const notes: string[] = [];

  // Gerçekleşmiş iadeler (REJECTED/REQUESTED hariç)
  const realized = opts.returnsDetail.filter((r) => r.status !== "REJECTED" && r.status !== "REQUESTED");
  const refundTotal = realized.reduce((s, r) => s + n(r.refundAmount), 0);
  const restocked = realized.filter((r) => r.restock).length;
  const restockedSharePct = realized.length ? r2((restocked / realized.length) * 100) : null;

  // Ürün satırları
  const rows: ProductQualityRow[] = [];
  for (const [pid, s] of opts.salesByProduct) {
    const dim = opts.productDims.get(pid);
    const returnRatePct = s.unitsSold > 0 ? r2((s.returnsQty / s.unitsSold) * 100) : null;
    const review = opts.approvedReviewsByProduct.get(pid);
    const flags: ProductQualityRow["flags"] = [];
    if (s.unitsSold >= settings.minUnits && returnRatePct != null && returnRatePct >= settings.returnRateAlarmPct) {
      flags.push("HIGH_RETURN_RATE");
    }
    if (review && review.count >= settings.minReviews && review.avgRating <= settings.lowRatingThreshold) {
      flags.push("LOW_RATING");
    }
    rows.push({
      productId: pid,
      name: dim?.name ?? `Ürün #${pid}`,
      sku: dim?.sku ?? "",
      unitsSold: s.unitsSold,
      unitsReturned: s.returnsQty,
      returnRatePct,
      refundValue: r2(s.returnsValue),
      reviewCount: review?.count ?? 0,
      avgRating: review?.avgRating ?? null,
      flags,
    });
  }
  rows.sort((a, b) => (b.returnRatePct ?? 0) - (a.returnRatePct ?? 0));

  // İade nedeni Pareto'su
  const bucketAgg = new Map<string, { count: number; refundAmount: number; samples: Set<string> }>();
  for (const r of realized) {
    const bucket = classifyReason(r.reason);
    const cur = bucketAgg.get(bucket) ?? { count: 0, refundAmount: 0, samples: new Set<string>() };
    cur.count += 1;
    cur.refundAmount += n(r.refundAmount);
    if (r.reason && cur.samples.size < 3) cur.samples.add(r.reason);
    bucketAgg.set(bucket, cur);
  }
  const reasonPareto: ReasonBucket[] = [...bucketAgg.entries()]
    .map(([bucket, v]) => ({
      bucket,
      count: v.count,
      pct: realized.length ? r2((v.count / realized.length) * 100) : 0,
      refundAmount: r2(v.refundAmount),
      sampleReasons: [...v.samples],
    }))
    .sort((a, b) => b.count - a.count);

  // Fırsatlar
  const opportunities: BuiltOpportunity[] = [];
  const period = { start: daysAgoISO(90), end: new Date().toISOString().slice(0, 10) };
  for (const row of rows) {
    if (!row.flags.includes("HIGH_RETURN_RATE")) continue;
    const est = r2(row.refundValue * 0.3); // iadelerin %30'u kök neden çözümüyle engellenebilir varsayımı
    opportunities.push(buildOpportunity({
      opportunityKey: `RETURN_REDUCTION|product:${row.productId}|high_return_rate`,
      opportunityType: "RETURN_REDUCTION",
      title: `"${row.name}" iade oranı %${row.returnRatePct} — kalite kök neden aksiyonu`,
      description: `${row.unitsSold} satıştan ${row.unitsReturned} adedi iade (eşik %${settings.returnRateAlarmPct}). İade tutarı ${row.refundValue} TL.`,
      sourceModule: "quality",
      relatedProductId: row.productId,
      estimatedCostSaving: est,
      estimatedProfitImpact: est,
      confidenceScore: combinedConfidence(80, row.unitsSold, 40),
      dataCoverage: 80,
      priorityInputs: {
        financialImpact: financialImpactScale(est, 30000),
        feasibility: 60,
        urgency: 65,
        strategic: 70,
      },
      evidence: [
        `İade oranı %${row.returnRatePct} (${row.unitsReturned}/${row.unitsSold})`,
        `İade tutarı ${row.refundValue} TL`,
        row.reviewCount > 0 ? `Onaylı yorum: ${row.reviewCount} (ort ${row.avgRating})` : "Onaylı yorum yok",
      ],
      assumptions: [
        "İade → ürün/tedarikçi zinciri kesin bağlanamaz; PO bağıyla tedarikçi modülü sinyal üretir.",
        "Kök neden çözümüyle iadelerin %30'u engellenebilir varsayıldı (ölçülmüş etki değil).",
      ],
      calculationMethod: "tasarruf = ürün iade tutarı × %30.",
      recommendedAction: "İade nedeni Pareto'sunda bu ürünün kovasını bulun; numune incelemesi ve tedarikçiyle kalite görüşmesi başlatın.",
      dataPeriodStart: period.start,
      dataPeriodEnd: period.end,
      expiresInDays: 45,
    }));
  }

  for (const row of rows) {
    if (!row.flags.includes("LOW_RATING")) continue;
    opportunities.push(buildOpportunity({
      opportunityKey: `QUALITY_IMPROVEMENT|product:${row.productId}|low_rating`,
      opportunityType: "QUALITY_IMPROVEMENT",
      title: `"${row.name}" yorumu zayıf (ort ${row.avgRating}) — kalite iyileştirme`,
      description: `${row.reviewCount} onaylı yorumla ortalama ${row.avgRating}/5; eşiğin (${settings.lowRatingThreshold}) altında.`,
      sourceModule: "quality",
      relatedProductId: row.productId,
      estimatedProfitImpact: 0,
      confidenceScore: combinedConfidence(65, row.reviewCount, 10),
      dataCoverage: 60,
      priorityInputs: { financialImpact: 25, feasibility: 55, urgency: 40, strategic: 70 },
      evidence: [
        `Ortalama puan ${row.avgRating}/5 (${row.reviewCount} onaylı yorum)`,
        `Satış: ${row.unitsSold} adet · iade: ${row.unitsReturned}`,
      ],
      assumptions: [
        "Yorumlar moderasyondan geçmiş onaylı kayıtlardır; seçilmiş örneklem yanlılığı olabilir.",
        "Finansal etki tahmini yoktur — itibar riski nitelikseldir.",
      ],
      calculationMethod: "Niteliksel kalite sinyali; sayısal etki tahmini üretilmedi.",
      recommendedAction: "Yorumlardaki ortak şikâyet temasını çıkarın; ürün/tedarikçi kalitesini gözden geçirin, açıklamayı güncelleyin.",
      dataPeriodStart: period.start,
      dataPeriodEnd: period.end,
      expiresInDays: 60,
    }));
  }

  // Pareto tepe kovası için aksiyon fırsatı
  const top = reasonPareto[0];
  if (top && top.count >= 5 && top.pct >= 30 && top.bucket !== "BELİRTİLMEMİŞ") {
    const est = r2(top.refundAmount * 0.3);
    opportunities.push(buildOpportunity({
      opportunityKey: `RETURN_REDUCTION|reason:${top.bucket}|pareto_top`,
      opportunityType: "RETURN_REDUCTION",
      title: `İade nedenlerinin %${top.pct}'i "${top.bucket}" — kök neden sprinti`,
      description: `${top.count} gerçekleşmiş iadede "${top.bucket}" ağırlıkta; toplam iade tutarı etkisi ${top.refundAmount} TL.`,
      sourceModule: "quality",
      estimatedCostSaving: est,
      estimatedProfitImpact: est,
      confidenceScore: combinedConfidence(75, top.count, 12),
      dataCoverage: 75,
      priorityInputs: {
        financialImpact: financialImpactScale(est, 40000),
        feasibility: 60,
        urgency: 55,
        strategic: 75,
      },
      evidence: [
        `"${top.bucket}": ${top.count} iade (%${top.pct}), iade tutarı ${top.refundAmount} TL`,
        `Örnek ifadeler: ${top.sampleReasons.join(" | ") || "—"}`,
      ],
      assumptions: [
        "Neden metni serbest girilmiş; otomatik kümeleme hata payı içerir.",
        "Kök neden çözümüyle tepe kobanın %30'u engellenebilir varsayıldı.",
      ],
      calculationMethod: "tasarruf = tepe kovanın iade tutarı × %30.",
      recommendedAction: "Tepe kovaya ait ürünleri/SKU'ları listeleyin; ölçü/kalıp/fotoğraf-açıklama güncellemesi yapın.",
      dataPeriodStart: period.start,
      dataPeriodEnd: period.end,
      expiresInDays: 45,
    }));
  }

  const status: "VERIFIED" | "PARTIAL" | "INSUFFICIENT_DATA" =
    realized.length === 0 ? "INSUFFICIENT_DATA"
    : realized.length < 5 ? "PARTIAL"
    : "PARTIAL"; // neden serbest metin olduğu için tam VERIFIED denmez
  if (realized.length === 0) notes.push("Gerçekleşmiş iade kaydı yok.");
  else notes.push("İade nedeni serbest metindir; kümeleme anahtar kelime eşleştirmesiyle yapılır ve hata payı taşır.");
  notes.push("Ürün kalite olay tablosu (hasar/arıza bildirimi) şemada yok; kalite sinyali iade + onaylı yorumla sınırlıdır.");

  return {
    generatedAt: new Date().toISOString(),
    settings,
    totals: {
      realizedRefunds: realized.length,
      realizedRefundAmount: r2(refundTotal),
      restockedSharePct,
      totalReturnRows: opts.returnsDetail.length,
    },
    products: rows,
    reasonPareto,
    opportunities,
    dataQuality: { status, notes },
  };
}

function daysAgoISO(days: number): string {
  const d = new Date(Date.now() - days * 86400000);
  return d.toISOString().slice(0, 10);
}
