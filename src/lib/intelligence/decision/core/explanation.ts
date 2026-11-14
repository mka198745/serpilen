/**
 * Explanation Report — yöneticiye okunabilir, denetlenebilir karar gerekçesi.
 * Data coverage, alternatifler, varsayımlar, riskler ve "ne zaman geçersiz olur" dahil.
 */
import type { DecisionRecommendation } from "./types";

export function buildExplanation(rec: Pick<DecisionRecommendation,
  | "title" | "summary" | "context" | "alternatives" | "bestAlternativeKind" | "runnerUpKind"
  | "rationale" | "risks" | "assumptions" | "evidence" | "dataCoverage" | "statisticalConfidence" | "decisionConfidence" | "methodNote" | "expectedImpact"
>): string {
  const lines: string[] = [];
  lines.push(`KARAR ÖZETİ: ${rec.title}`);
  lines.push(`YÖNETİCİ ÖZETİ: ${rec.summary}`);
  lines.push(`Kaynak modüller: ${rec.context.sourceModules.join(", ") || "—"}`);
  if (rec.context.analysisPeriodStart && rec.context.analysisPeriodEnd) {
    lines.push(`Analiz dönemi: ${rec.context.analysisPeriodStart} → ${rec.context.analysisPeriodEnd}`);
  }
  lines.push("");
  lines.push(`YÖNTEM: ${rec.methodNote}`);
  lines.push("");
  lines.push(`VERİ KAPSAMA: %${Math.round(rec.dataCoverage)} (verinin varlığı/kapsamı — tahmin doğruluğu DEĞİLDİR)`);
  lines.push(`İSTATİSTİKSEL GÜVEN: ${rec.statisticalConfidence != null ? `%${Math.round(rec.statisticalConfidence)} (geçmiş tahmin isabetine dayanır)` : "hesaplanmadı (tahmin geçmişi yetersiz veya yok)"}`);
  lines.push(`KARAR GÜVENİ: %${Math.round(rec.decisionConfidence)} (kapsama + örneklem + tahmin isabeti bileşenlerinden türetildi)`);
  lines.push("");
  lines.push("ALTERNATİFLER:");
  for (const alt of rec.alternatives) {
    const scoreTxt = alt.weightedScore != null ? `puan ${alt.weightedScore}` : "puanlanamadı (veri yetersiz)";
    const rankTxt = alt.rank ? `#${alt.rank}` : "#—";
    const profitTxt = alt.expectedProfit != null ? `${fmtTl(alt.expectedProfit)} kâr` : "kâr hesaplanamadı";
    lines.push(`  ${rankTxt} ${alt.kind} — ${alt.label} (${scoreTxt}; ${profitTxt}; risk ${alt.riskScore ?? "?"})`);
    if (alt.assumptions.length) lines.push(`      varsayımlar: ${alt.assumptions.join("; ")}`);
  }
  lines.push("");
  lines.push(`EN İYİ ALTERNATİF: ${rec.bestAlternativeKind ?? "belirlenemedi (yetersiz veri/kısıt)"}${rec.runnerUpKind ? ` — ikinci: ${rec.runnerUpKind}` : ""}`);
  lines.push(`GEREKÇE: ${rec.rationale}`);
  lines.push("");
  lines.push(`BEKLENEN ETKİ: ciro ${rec.expectedImpact.revenue != null ? fmtTl(rec.expectedImpact.revenue) : "bilinmiyor"} · kâr ${rec.expectedImpact.profit != null ? fmtTl(rec.expectedImpact.profit) : "bilinmiyor"} · nakit ${rec.expectedImpact.cash != null ? fmtTl(rec.expectedImpact.cash) : "bilinmiyor"}`);
  if (rec.risks.length) {
    lines.push("");
    lines.push("RİSKLER:");
    for (const r of rec.risks) lines.push(`  - ${r}`);
  }
  if (rec.assumptions.length) {
    lines.push("");
    lines.push("VARSAYIMLAR:");
    for (const a of rec.assumptions) lines.push(`  - ${a}`);
  }
  if (rec.evidence.length) {
    lines.push("");
    lines.push("KANITLAR:");
    for (const e of rec.evidence) lines.push(`  - ${e}`);
  }
  lines.push("");
  lines.push("BU KARAR NE ZAMAN GEÇERSİZ OLUR:");
  lines.push("  - Verilen dönem dışında yeni veri aktığında veya varsayımlar çiğnendiğinde (fiyat/maliyet/talep değişimi).");
  lines.push("  - Yönetici onaydan önce yeni bilgiyle çeliştiğinde karar yeniden değerlendirilmelidir.");
  lines.push("  - Kaynak veriler değişmeden karar kayıtlarındaki snapshot temel alınır; gerçek kayıtlar sisteme uygulanmaz.");
  lines.push("");
  lines.push("SINIRLAR: Bu bir karar DESTEK çıktısıdır; otomatik fiyat/sipariş/kampanya/reklam işlemi YAPILMAZ. Yönetici onayı olmadan hiçbir aksiyon alınamaz.");
  return lines.join("\n");
}

function fmtTl(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} TL`;
}
