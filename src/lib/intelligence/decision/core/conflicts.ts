/**
 * Decision Conflict Detection — kural tabanlı çapraz tarama.
 * Aynı ürün/kampanya için çelişen önerileri yakalar; kararlar aynı anda
 * uygulanırsa doğacak finansal farkı gösterir ve çözüm seçenekleri sunar.
 * Otomatik çözmez; yöneticiye gösterir.
 */
import type { DecisionConflict } from "./types";

export interface ConflictCandidate {
  source: string;         // "decision" | "faz2:pricing" | ...
  refKey: string;         // decisionKey veya opportunityKey
  decisionType: string;   // PRICING ...
  productId?: number | null;
  categoryId?: number | null;
  campaignId?: number | null;
  title: string;
  recommendation: string;
  expectedProfit: number | null;
  tags?: string[];        // ör. ["DEAD_STOCK", "RESTOCK", "INCREASE"]
}

const hasTag = (c: ConflictCandidate, tag: string) => (c.tags ?? []).includes(tag);

/** Çelişen aday çiftlerini bulur ve birleştirilmiş conflict listesi döner. */
export function detectConflicts(candidates: ConflictCandidate[]): DecisionConflict[] {
  const conflicts: DecisionConflict[] = [];
  const byProduct = groupBy(candidates.filter((c) => c.productId != null), (c) => `p${c.productId}`);

  for (const [, group] of byProduct) {
    const pricingUp = group.filter((c) => c.decisionType === "PRICING" && (hasTag(c, "INCREASE") || /artış|yukselt|büyüt/i.test(c.recommendation)));
    const promos = group.filter((c) => (c.decisionType === "CAMPAIGN" || c.decisionType === "MARKETING"));
    for (const p of pricingUp) {
      for (const promo of promos) conflicts.push(mkConflict("PRICE_UP_VS_PROMOTION", p, promo,
        `Aynı üründe fiyat artışı ve kampanya indirimi öneriliyor`,
        [
          "Sequant: önce kampanyayı bitir, sonra fiyatı artır",
          "Kampanya süresini kısalt, fiyat artışını sezon sonrasına bırak",
          "Kampanya marj etkisini fiyat artışıyla dengele (net etkiyi simüle et — What-if)",
        ]));
    }
    const deadStock = group.filter((c) => hasTag(c, "DEAD_STOCK") || /tasfiye|çıkış|gamdan çıkar/i.test(c.recommendation));
    const restock = group.filter((c) => (c.decisionType === "INVENTORY" || c.decisionType === "PROCUREMENT") && !hasTag(c, "DEAD_STOCK"));
    for (const d of deadStock) {
      for (const r of restock) conflicts.push(mkConflict("DEAD_STOCK_CLEARANCE_VS_REORDER", d, r,
        `Aynı üründe tasfiye ve yeni alım/takviye öneriliyor`,
        [
          "Önce mevcut stoku erit, takviyeyi reorder noktasına ertele",
          "Tasfiye miktarını ve yeniden sipariş miktarını tek planda birleştir",
          "ABC-XYZ sınıfına göre karar: A-X takviye / C-Z tasfiye",
        ]));
    }
  }

  // Aynı reklam bütçesini iki aday kullanıyorsa
  const byCampaign = groupBy(candidates.filter((c) => c.campaignId != null && (c.decisionType === "MARKETING" || c.decisionType === "CAMPAIGN")), (c) => `k${c.campaignId}`);
  for (const [, group] of byCampaign) {
    if (group.length >= 2) {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          conflicts.push(mkConflict("AD_BUDGET_OVERALLOCATION", group[i], group[j],
            `Aynı kampanya bütçesi için iki ayrı bütçe önerisi var`,
            [
              "Bütçeyi tek öneride birleştir ve ROAS kanıtı olan kanala yönlendir",
              "İkisini de reddet — mevcut ROAS verisiyle yeniden analiz et",
              "Test-bazlı yaklaşım: önce düşük bütçeyle A/B ölç",
            ]));
        }
      }
    }
  }

  // Tekilleştir (aynı çift aynı türde)
  const seen = new Set<string>();
  return conflicts.filter((c) => {
    const key = `${c.conflictType}|${c.items.map((i) => i.refKey).sort().join("|")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mkConflict(type: DecisionConflict["conflictType"], a: ConflictCandidate, b: ConflictCandidate, title: string, resolutionOptions: string[]): DecisionConflict {
  const pa = a.expectedProfit;
  const pb = b.expectedProfit;
  const finDiff = pa != null && pb != null ? Math.abs(pa - pb) : null;
  return {
    conflictKey: `conflict:${type}:${[a.refKey, b.refKey].sort().join("|")}`.slice(0, 240),
    conflictType: type,
    title,
    description: `"${a.title}" (${a.source}) ↔ "${b.title}" (${b.source}) aynı kapsamda çelişiyor.`,
    relatedProductId: a.productId ?? b.productId ?? null,
    items: [
      { source: a.source, refKey: a.refKey, recommendation: a.recommendation, expectedProfit: a.expectedProfit },
      { source: b.source, refKey: b.refKey, recommendation: b.recommendation, expectedProfit: b.expectedProfit },
    ],
    financialImpactDifference: finDiff != null ? round2(finDiff) : null,
    resolutionOptions,
  };
}

function groupBy<T>(arr: T[], keyFn: (t: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const t of arr) {
    const k = keyFn(t);
    const list = map.get(k);
    if (list) list.push(t);
    else map.set(k, [t]);
  }
  return map;
}

const round2 = (n: number) => Number(n.toFixed(2));
