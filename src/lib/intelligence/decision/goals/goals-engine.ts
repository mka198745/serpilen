/**
 * FAZ 3 — Yönetim hedefleri motoru.
 * - İlerleme, KPI YÖNÜNE göre (HIGHER_BETTER / LOWER_BETTER) hesaplanır — tek formül YOK.
 * - Forecast: doğrusal eğilim + dönem sonu projeksiyonu + hedef isabet olasılığı.
 *   Veri yetersizse (< 14 günlük seri veya zayıf eğim güvenilirliği) TAHMİN ÜRETİLMEZ.
 * - Hedef çelişki tespiti: aktif hedefler arasında tanımlı trade-off kuralları.
 * - Goal Alignment Score: karar türü ↔ hedef yönü (işaret) → −100..+100.
 */
import { normalCdf } from "../monte-carlo/prng";

export type GoalDirection = "HIGHER_BETTER" | "LOWER_BETTER";

export interface GoalProgressInput {
  baseline: number | null;
  target: number;
  current: number | null;
  direction: GoalDirection;
}

export interface GoalProgress {
  /** 0..1+ oran (1 = hedefte) */
  ratio: number | null;
  /** Yüzde (0-150+ yuvarlanmış) — gösterim */
  pct: number | null;
  /** Kalan gap (yönüne göre hedef − mevcut; negatif = hedefte/aşıldı) */
  remaining: number | null;
  onTrack: boolean | null;
}

/** Yöne göre ilerleme. Baseline yoksa 0 kabul edilir (tanımsızda ratio null). */
export function goalProgress(input: GoalProgressInput): GoalProgress {
  const { baseline, target, current, direction } = input;
  if (current == null || !Number.isFinite(target)) {
    return { ratio: null, pct: null, remaining: null, onTrack: null };
  }
  const b = baseline ?? 0;
  const span = target - b;
  if (Math.abs(span) < 1e-9) {
    // Hedef baseline'a eşit — tanım gereği başlangıçta "hedefte"
    return { ratio: 1, pct: 100, remaining: 0, onTrack: true };
  }
  let ratio: number;
  if (direction === "HIGHER_BETTER") {
    ratio = (current - b) / span;
  } else {
    // LOWER_BETTER: span negatiftir; formül aynı kalır ama yön çevirisi gerekmez —
    // (current − baseline)/(target − baseline) ikisi de negatif bölgede çalışır.
    ratio = (current - b) / span;
  }
  const remaining = direction === "HIGHER_BETTER" ? target - current : current - target;
  return {
    ratio: Number(ratio.toFixed(4)),
    pct: Number((ratio * 100).toFixed(1)),
    remaining: Number(remaining.toFixed(2)),
    onTrack: ratio >= 1,
  };
}

export interface GoalForecast {
  /** Dönem sonu projeksiyonu */
  projected: number | null;
  /** Hedefe ulaşma olasılığı (0..1) */
  targetProbability: number | null;
  /** Günlük eğim (değer/gün) */
  dailySlope: number | null;
  residualStddev: number | null;
  daysRemaining: number;
  note: string | null;
}

/**
 * Dönem sonu projeksiyonu (doğrusal): current + slope × kalan gün.
 * Hedef olasılığı: N(projected, residualStd × √kalan) altında target'ın kuyruğu.
 * Veri yetersizse hepsi null + açıklayıcı not.
 */
export function goalForecast(opts: {
  dailySeries: Array<{ day: string; value: number }> | null | undefined;
  target: number;
  direction: GoalDirection;
  endDate: string;
  minDays?: number;
}): GoalForecast {
  const series = (opts.dailySeries ?? []).filter((p) => Number.isFinite(p.value));
  const minDays = opts.minDays ?? 14;
  const now = new Date();
  const end = new Date(opts.endDate);
  const daysRemaining = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86400000));
  if (series.length < minDays) {
    return { projected: null, targetProbability: null, dailySlope: null, residualStddev: null, daysRemaining, note: `Tahmin için en az ${minDays} günlük seri gerekli (var: ${series.length}).` };
  }
  const n = series.length;
  const xs = series.map((_, i) => i);
  const ys = series.map((p) => p.value);
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  if (Math.abs(den) < 1e-9) {
    return { projected: null, targetProbability: null, dailySlope: null, residualStddev: null, daysRemaining, note: "Seri sabit — eğim hesaplanamadı." };
  }
  const slope = num / den;
  // Artıklar + std
  const residuals = ys.map((y, i) => y - (my + slope * (xs[i] - mx)));
  const resVar = residuals.reduce((s, r) => s + r * r, 0) / Math.max(1, n - 2);
  const resStd = Math.sqrt(resVar);
  const last = ys[ys.length - 1];
  const projected = last + slope * daysRemaining;
  // Olasılık: N(projected, resStd×√kalan) altında hedef kuyruğu
  const sigma = resStd * Math.sqrt(Math.max(1, daysRemaining));
  let targetProbability: number | null = null;
  if (sigma > 1e-9) {
    const z = (opts.target - projected) / sigma;
    if (opts.direction === "HIGHER_BETTER") targetProbability = 1 - normalCdf(z);
    else targetProbability = normalCdf(z);
  } else {
    // Sigma sıfır: projeksiyon hedefin doğru tarafındaysa 1, değilse 0 (deterministik sınır — etiketli)
    const ok = opts.direction === "HIGHER_BETTER" ? projected >= opts.target : projected <= opts.target;
    targetProbability = ok ? 1 : 0;
  }
  return {
    projected: Number(projected.toFixed(2)),
    targetProbability: targetProbability != null ? Number(clamp01(targetProbability).toFixed(4)) : null,
    dailySlope: Number(slope.toFixed(4)),
    residualStddev: Number(resStd.toFixed(2)),
    daysRemaining,
    note: null,
  };
}

// ---------- Hedef çelişki tespiti ----------
export interface GoalConflict {
  goalAId: number;
  goalAName: string;
  goalBId: number;
  goalBName: string;
  rule: string;
  explanation: string;
  tradeOffs: string[];
}

interface GoalLike {
  id: number;
  name: string;
  kpi: string;
  direction: string;
  status: string;
}

/** Tanımlı trade-off kuralları — aktif hedefler arasında taranır. */
const CONFLICT_RULES: Array<{ a: string; b: string; explanation: string; tradeOffs: string[] }> = [
  {
    a: "REVENUE",
    b: "CONTRIBUTION_MARGIN",
    explanation: "Ciro artışı genellikle indirim/kampanya ile sağlanır ve katkı marjını baskılar.",
    tradeOffs: ["Ciro +%10 için marj −puan riski var mı?", "Kampanya kurgularını marj tabanıyla sınırla", "Marj korumalı büyüme senaryosu için What-if çalıştır"],
  },
  {
    a: "REVENUE",
    b: "RETURN_RATE",
    explanation: "Hızlı büyüme (agresif hedef) iade oranını yükseltebilir.",
    tradeOffs: ["İade neden kodlarında artış var mı?", "Yeni müşteri ediniminde ürün açıklamalarını güçlendir"],
  },
  {
    a: "REVENUE",
    b: "ROAS",
    explanation: "Reklam bütçesini kısmak ROAS'ı iyileştirir ama ciroyu düşürebilir.",
    tradeOffs: ["Marjinal ROAS kanal bazında incelensin", "Ciroyu koruyarak ROAS hedefi için kanal kırılımı gerekir"],
  },
  {
    a: "DEAD_STOCK_VALUE",
    b: "FILL_RATE_PCT",
    explanation: "Aşırı stok azaltımı fill rate'i düşürebilir (stok-out riski).",
    tradeOffs: ["ABC analiziyle yalnız C-Z kalemlerini tasfiye et", "Fill rate ≥ %90 kısıtıyla ölü stok hedefini gözden geçir"],
  },
  {
    a: "DEAD_STOCK_VALUE",
    b: "REVENUE",
    explanation: "Tasfiye indirimleri kısa vadede ciroyu artırır ama marj ve marka dengesini değiştirir.",
    tradeOffs: ["Tasfiye paketleri marj tabanlı fiyatlansın", "Tasfiye dönemi sonrası stok ölçümü"],
  },
  {
    a: "ORDER_COUNT",
    b: "AVG_ORDER_VALUE",
    explanation: "Sepet büyütme hedefi dönüşüm oranını düşürebilir (yüksek sepet eşiği).",
    tradeOffs: ["Ücretsiz kargo eşiğini A/B test et", "Sepet büyütme kuponunu dönüşüm maliyetiyle karşılaştır"],
  },
  {
    a: "ROAS",
    b: "REVENUE",
    explanation: "ROAS odaklı kesinti toplam reklam geliri katkısını azaltır.",
    tradeOffs: ["ROAS<1 kanalları kapat, kârlıları koru", "Blended ROAS hedefinin ciro etkisini ölç"],
  },
  {
    a: "RETURN_RATE",
    b: "REVENUE",
    explanation: "İade kısıtlamak müşteri memnuniyetini ve tekrarlı alımları düşürebilir.",
    tradeOffs: ["Kısıtlama yerine ürün açıklaması iyileştir", "İade politikasını koşulsuz bırakıp kök nedeni çöz"],
  },
  {
    a: "CONTRIBUTION_MARGIN",
    b: "DEAD_STOCK_VALUE",
    explanation: "Ölü stoku eritmek için derin indirim marjı eritir.",
    tradeOffs: ["Tasfiye tavanı: ana kalemlerde %-10 marj sınırı", "Paket (bundle) ile marjı koruyarak tasfiye"],
  },
];

/** Aktif hedefler arasında kural bazlı çelişki taraması. */
export function detectGoalConflicts(goals: GoalLike[]): GoalConflict[] {
  const active = goals.filter((g) => g.status === "ACTIVE");
  const conflicts: GoalConflict[] = [];
  const seen = new Set<string>();
  for (const rule of CONFLICT_RULES) {
    const aList = active.filter((g) => g.kpi === rule.a);
    const bList = active.filter((g) => g.kpi === rule.b);
    for (const a of aList) {
      for (const b of bList) {
        const key = [a.id, b.id].sort().join(":") + ":" + rule.a + rule.b;
        if (seen.has(key)) continue;
        seen.add(key);
        conflicts.push({
          goalAId: a.id,
          goalAName: a.name,
          goalBId: b.id,
          goalBName: b.name,
          rule: `${rule.a} ↔ ${rule.b}`,
          explanation: rule.explanation,
          tradeOffs: rule.tradeOffs,
        });
      }
    }
  }
  return conflicts;
}

// ---------- Goal Alignment Score ----------

/** Karar türü × KPI etki tablosu (+1 destekler / −1 engeller / 0 nötr). Yön çevrimi direction'la uygulanır. */
const DECISION_KPI_EFFECT: Record<string, Partial<Record<string, number>>> = {
  PRICING: { CONTRIBUTION_MARGIN: 1, REVENUE: 0, RETURN_RATE: 0 },
  INVENTORY: { DEAD_STOCK_VALUE: 1, FILL_RATE_PCT: 1, REVENUE: 0 },
  PROCUREMENT: { DEAD_STOCK_VALUE: 1, FILL_RATE_PCT: 1, ON_TIME_PCT: 1, GROSS_PROFIT: 0 },
  SUPPLIER: { ON_TIME_PCT: 1, FILL_RATE_PCT: 1, GROSS_PROFIT: 1 },
  CAMPAIGN: { REVENUE: 1, ORDER_COUNT: 1, AVG_ORDER_VALUE: 0, CONTRIBUTION_MARGIN: -1 },
  MARKETING: { REVENUE: 1, ROAS: 1, CONTRIBUTION_MARGIN: -1, ORDER_COUNT: 1 },
  FINANCIAL: {},
  QUALITY: { RETURN_RATE: 1, REVENUE: 0 },
  CUSTOMER: { ORDER_COUNT: 1, REVENUE: 1, AVG_ORDER_VALUE: 0 },
  ASSORTMENT: { DEAD_STOCK_VALUE: 1, REVENUE: 0 },
  CASH_FLOW: {},
  RETURNS: { RETURN_RATE: 1 },
  FORECAST: { FILL_RATE_PCT: 1 },
  OPERATIONAL: { ON_TIME_PCT: 1 },
};

export interface GoalAlignmentItem {
  goalId: number;
  goalName: string;
  kpi: string;
  direction: GoalDirection;
  effect: number; // yön düzeltmesi sonrası işaret
  weight: number; // priority ağırlığı
}

export interface GoalAlignmentResult {
  score: number | null; // −100..+100; hedef/etki verisi yoksa null
  items: GoalAlignmentItem[];
  note: string | null;
}

/**
 * Kararın aktif hedeflere hizası: Σ(etki × öncelik ağırlığı) / Σ(|etki| × öncelik ağırlığı) × 100.
 * Yalnız etki ≠ 0 olan KPI'lar hesaba katılır; hiçbiri yoksa null (not ile).
 */
export function goalAlignmentScore(decisionType: string, goals: Array<{ id: number; name: string; kpi: string; direction: GoalDirection; priority: string; status: string }>): GoalAlignmentResult {
  const active = goals.filter((g) => g.status === "ACTIVE");
  const effectMap = DECISION_KPI_EFFECT[decisionType] ?? {};
  const items: GoalAlignmentItem[] = [];
  for (const g of active) {
    const raw = effectMap[g.kpi];
    if (raw === undefined || raw === 0) continue;
    const dirSign = g.direction === "HIGHER_BETTER" ? 1 : -1;
    const effect = raw * dirSign; // hedef "azalt" yönündeyse işaret ters
    const weight = g.priority === "HIGH" ? 2 : g.priority === "LOW" ? 0.5 : 1;
    items.push({ goalId: g.id, goalName: g.name, kpi: g.kpi, direction: g.direction, effect, weight });
  }
  if (!items.length) {
    return { score: null, items: [], note: "Bu karar türünü doğrudan etkileyen aktif hedef yok — uyum nötr kabul edilmedi, hesaplanmadı." };
  }
  const wSum = items.reduce((s, i) => s + Math.abs(i.effect) * i.weight, 0);
  const signed = items.reduce((s, i) => s + i.effect * i.weight, 0);
  const score = Math.round((signed / Math.max(EPS, wSum)) * 100);
  return { score, items, note: null };
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const EPS = 1e-9;
