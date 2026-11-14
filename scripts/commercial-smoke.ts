/**
 * FAZ 2 uçtan uca duman testi — YALNIZCA "scratch" içeren DATABASE_URL ile çalışır.
 * Canlı DB'ye asla dokunmaz. Migration 0005 zaten uygulanmış scratch üzerinde çalışır.
 */
import "dotenv/config";
if (!(process.env.DATABASE_URL || "").includes("scratch")) {
  console.error("GÜVENLİK: Bu script yalnızca 'scratch' içeren DATABASE_URL ile çalışır. Çıkılıyor.");
  process.exit(1);
}

const nf = (n: number) => n.toLocaleString("tr-TR");

async function main() {
  const {
    getPricingAnalysis, getCampaignAnalysis, getBasketAnalysis, getSupplierAnalysis,
    getQualityAnalysis, getProcurementAnalysis, runCommercialAnalysis,
    listOpportunities, getOpportunityDetail, transitionOpportunity,
    completeOpportunityWithImpact, getCommercialSummary,
  } = await import("../src/lib/intelligence/commercial/service");

  console.log("=== 1) PRICING ===");
  const pricing = await getPricingAnalysis();
  console.log("status:", pricing.dataQuality.status, "| products:", pricing.summary.productCount, "| cost coverage:", pricing.summary.costCoveragePct + "%");
  console.log("negativeContribution:", pricing.summary.negativeContributionCount, "| lowMargin:", pricing.summary.lowMarginCount, "| campaignBelowCost:", pricing.summary.campaignBelowCostCount);
  console.log("flags sample:", pricing.rows.filter(r => r.flags.length).map(r => `${r.name}:${r.flags.join("+")}${r.suggestedPrice ? `→${r.suggestedPrice}` : ""}`));

  console.log("\n=== 2) CAMPAIGNS ===");
  const camp = await getCampaignAnalysis();
  console.log("status:", camp.dataQuality.status, "| geçerli sipariş:", camp.totals.validOrders, "| indirim oranı:", camp.totals.discountRatioPct, "%");
  console.log("adToplamı spend:", camp.totals.adSpend, "| ROAS:", camp.totals.adRoas);
  for (const ad of camp.advertising) console.log(`  ad "${ad.name}": roas=${ad.roas} cac=${ad.cac} roi=${ad.roiPct}% flag=${ad.flag}`);
  for (const p of camp.promotions) console.log(`  promo "${p.name}": used=${p.usedCount} gün=${p.daysRunning} flag=${p.flag} estDiscount=${p.estimatedDiscountCost}`);
  console.log("storeAvgContributionPct:", camp.storeAvgContributionPct);

  console.log("\n=== 3) BASKET ===");
  const basket = await getBasketAnalysis();
  console.log("status:", basket.dataQuality.status, "| sepet:", basket.totals.validOrders, "| ort. tutar:", basket.totals.avgBasketValue, "| tek ürün payı:", basket.totals.singleItemOrderPct + "%");
  console.log("pairs:", basket.pairs.slice(0, 5).map(p => `${p.productA.name}+${p.productB.name} lift=${p.lift} pair=${p.pairOrders}`));

  console.log("\n=== 4) SUPPLIERS ===");
  const sup = await getSupplierAnalysis();
  for (const r of sup.rows) {
    console.log(`  ${r.name}: skor=${r.score} kapsama=${r.coverage}% doluluk=${r.fillRatePct}% zamanında=${r.onTimePct}% termin=${r.avgActualLeadDays}g (taahhüt ${r.promisedLeadDays}g) spend=${r.totalSpend}`);
  }
  console.log("konsantrasyon:", sup.categoryConcentration.map(c => `${c.categoryName}:${c.risk} ${c.sharePct}%`));

  console.log("\n=== 5) QUALITY ===");
  const q = await getQualityAnalysis();
  console.log("status:", q.dataQuality.status, "| gerçekleşen iade:", q.totals.realizedRefunds, "| iade tutarı:", q.totals.realizedRefundAmount, "| restock payı:", q.totals.restockedSharePct + "%");
  console.log("pareto:", q.reasonPareto.map(b => `${b.bucket}:${b.count}(${b.pct}%)`));
  const topBad = q.products.filter(p => p.flags.length).slice(0, 5);
  for (const r of topBad) console.log(`  ürün ${r.name}: iade%${r.returnRatePct} adet ${r.unitsReturned}/${r.unitsSold} yorum ${r.avgRating ?? "-"} (${r.reviewCount})`);

  console.log("\n=== 6) PROCUREMENT ===");
  const proc = await getProcurementAnalysis();
  console.log("status:", proc.dataQuality.status, "| ölü stok değeri:", proc.totals.deadStockValue, "| fazla stok:", proc.totals.overstockExcessValue, "| stokta ürün:", proc.totals.productsWithStock);
  console.log("ölü stok:", proc.deadStock.slice(0, 5).map(d => `${d.name}:${d.qty}ad=${d.value}`));
  console.log("reorder adayı:", proc.reorderCandidates.slice(0, 5).map(r => `${r.name}:öneri ${r.suggestedQty} (cover ${r.daysCover}g)`));

  console.log("\n=== 7) RUN COMMERCIAL ANALYSIS (1. çalıştırma) ===");
  const run1 = await runCommercialAnalysis("Smoke Test");
  console.log("modüller:", run1.modules.map(m => `${m.module}:${m.status}/${m.opportunitiesGenerated}fırsat`));
  console.log("created:", run1.upserted.created, "updated:", run1.upserted.updated, "expired:", run1.expired);

  console.log("\n=== 8) IDEMPOTENCY (2. çalıştırma) ===");
  const run2 = await runCommercialAnalysis("Smoke Test");
  console.log("created:", run2.upserted.created, "updated:", run2.upserted.updated, "(created=0 beklenir)");

  console.log("\n=== 9) FIRSAT HAVUZU ===");
  const list = await listOpportunities({ status: ["NEW", "UNDER_REVIEW", "APPROVED", "IN_PROGRESS"], limit: 25, offset: 0 });
  console.log("açık fırsat:", list.total);
  for (const o of list.items) {
    console.log(`  #${o.id} [${o.severity}/${o.priorityScore}] ${o.title} (kaynak ${o.sourceModule}, kâr tahmini ${o.estimatedProfitImpact} TL)`);
  }

  console.log("\n=== 10) YAŞAM DÖNGÜSÜ ===");
  if (list.items.length) {
    const target = list.items.find(o => o.sourceModule === "campaigns") ?? list.items[0];
    const id = target.id;
    const r1 = await transitionOpportunity({ id, action: "review", actor: "Smoke Test", note: "inceleme başlat" });
    console.log(`review: ${r1.from} → ${r1.to}`);
    const r2t = await transitionOpportunity({ id, action: "approve", actor: "Smoke Test", note: "onaylandı" });
    console.log(`approve: ${r2t.from} → ${r2t.to}`);
    const r3 = await transitionOpportunity({ id, action: "start", actor: "Smoke Test" });
    console.log(`start: ${r3.from} → ${r3.to}`);
    const detail = await getOpportunityDetail(id);
    console.log(`detay #${id}: geçmiş=${detail?.history.length} kayıt, kanıt=${detail?.evidence.length} madde, varsayım=${detail?.assumptions.length} madde`);
    const complete = await completeOpportunityWithImpact({ id, actualProfitImpact: Math.round(target.estimatedProfitImpact * 0.6), note: "2 hafta sonra ölçüldü", windowStart: "2026-10-15", windowEnd: "2026-11-12", actor: "Smoke Test" });
    console.log("complete:", JSON.stringify(complete));
    const detail2 = await getOpportunityDetail(id);
    console.log("sonuç durumu:", detail2?.item.status, "| gerçekleşme:", detail2?.impacts[0]?.realizationRate + "%");
  }

  console.log("\n=== 11) ÖZET ===");
  const summary = await getCommercialSummary();
  console.log("açık fırsat:", summary.openCount, "| tahmini kâr (açık):", nf(summary.openEstimatedProfitImpact), "TL | nakit:", nf(summary.openEstimatedCashImpact), "TL");
  console.log("duruma göre:", JSON.stringify(summary.countsByStatus));
  console.log("modüle göre açık:", JSON.stringify(summary.openByModule));
  console.log("\nSMOKE OK");
  process.exit(0);
}

main().catch((err) => {
  console.error("SMOKE FAIL:", err);
  process.exit(1);
});
