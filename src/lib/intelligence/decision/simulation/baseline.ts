/**
 * Baseline türetici — senaryoların "gerçek dünya" girdisini oluşturur (salt okuma).
 * Kaynak ticari kayıtlar (ürün, fiyat, maliyet, stok, sipariş, reklam) DEĞİŞTİRİLMEZ.
 * Hem simulations/route.ts (yeni senaryo) hem simulations/[id]/run/route.ts (yeniden çalıştır) bu modülü kullanır.
 */
import { db } from "@/db";
import { advertisingPerformance } from "@/db/schema";
import { loadSalesBundle } from "@/lib/intelligence/repositories";
import { productMetricsFromBundle, globalBaselineFromBundle } from "@/lib/intelligence/decision/data-bridge";
import type { SimulationCategory, SimulationBaseline } from "@/lib/intelligence/decision/simulation/engine";

/** Baseline'ı kapsamdan türetir (gerçek kayıtlar değişmez — salt okuma). */
export async function buildBaseline(category: SimulationCategory, scopeType: string | null, scopeId: number | null, periodDays: number): Promise<SimulationBaseline> {
  const bundle = await loadSalesBundle();
  const isProduct = scopeType === "PRODUCT" && scopeId != null;
  const m = isProduct ? productMetricsFromBundle(bundle, scopeId) : globalBaselineFromBundle(bundle);
  // MARKETING: reklam harcamasını advertisingPerformance'dan al
  let adSpend30d: number | null = null;
  let attributedRevenue30d: number | null = null;
  if (category === "MARKETING") {
    try {
      const adRows = await db.select().from(advertisingPerformance);
      const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const recent = adRows.filter((r) => (r.endsOn ?? r.startsOn) >= since);
      if (recent.length) {
        adSpend30d = Number(recent.reduce((s, r) => s + Number(r.spend ?? 0), 0).toFixed(2));
        attributedRevenue30d = Number(recent.reduce((s, r) => s + Number(r.revenueAttributed ?? 0), 0).toFixed(2));
      }
    } catch { /* reklam verisi yoksa null kalır */ }
  }
  return {
    periodDays,
    price: m.price,
    unitCost: m.unitCost,
    variableCost: m.variableCost,
    dailyUnits: m.dailyUnits,
    avgDailyRevenue: m.avgDailyRevenue,
    avgOrderValue: m.orderCount > 0 && m.revenue30d != null ? Number((m.revenue30d / m.orderCount).toFixed(2)) : null,
    stockQty: m.stockQty,
    coverDays: m.coverDays,
    dailyHoldingCost: m.unitCost != null ? Number((m.unitCost * 0.00068).toFixed(4)) : null, // yıllık %25 varsayımı → günlük (etiketli)
    adSpend30d,
    attributedRevenue30d,
    orderCount30d: m.orderCount,
    grossMarginPct: m.marginPct30d,
  };
}
