import { test } from "node:test";
import assert from "node:assert/strict";
import {
  grossMarginPct, contributionPerUnit, contributionMarginPct, priceForTargetMargin,
  minimumProfitablePrice, roas, roiPct, cac, simpleRoiPct, simulatePriceScenarios,
} from "@/lib/intelligence/commercial/core/financial-calculator";
import { weightedScore } from "@/lib/intelligence/commercial/core/scoring-engine";
import { sampleSaturation, combinedConfidence, coverageOf, confidenceGrade } from "@/lib/intelligence/commercial/core/confidence-engine";
import { priorityScore, severityFromPriority, financialImpactScale, DEFAULT_PRIORITY_WEIGHTS } from "@/lib/intelligence/commercial/core/priority-score";
import { buildOpportunity } from "@/lib/intelligence/commercial/core/commercial-opportunity-engine";

test("grossMarginPct ve katkı marjı", () => {
  assert.equal(grossMarginPct(0, 50), null);
  assert.ok(Math.abs(grossMarginPct(100, 40)! - 60) < 1e-9);
  assert.equal(contributionPerUnit(100, 40, 10), 50);
  assert.ok(Math.abs(contributionMarginPct(100, 40, 10)! - 50) < 1e-9);
  assert.equal(contributionMarginPct(0, 40, 0), null);
});

test("hedef marj fiyatı ve asgari kâr fiyatı", () => {
  // cost 80, hedef %20 marj → fiyat 100
  assert.ok(Math.abs(priceForTargetMargin(80, 20) - 100) < 1e-9);
  // marj tavanı %95'i geçmez (bölme taşması yok)
  assert.ok(priceForTargetMargin(100, 99) > 100 && Number.isFinite(priceForTargetMargin(100, 99)));
  assert.equal(minimumProfitablePrice(75, 5), 80);
});

test("ROAS / ROI / CAC / basit ROI — harcama sıfırken null (kanıt yok)", () => {
  assert.equal(roas(1000, 0), null);
  assert.equal(roas(1000, 250), 4);
  assert.equal(roiPct(300, 0), null);
  assert.equal(roiPct(300, 200), 50);
  assert.equal(cac(900, 0), null);
  assert.equal(cac(900, 3), 300);
  assert.equal(simpleRoiPct(500, 0), null);
  assert.equal(simpleRoiPct(500, 1000), 50);
});

test("fiyat simülasyonu senaryoları simetrik ve hesap tutarlı", () => {
  const rows = simulatePriceScenarios({ currentPrice: 100, unitCost: 40, variableCost: 10, baseQuantity: 10, variableBandPct: 20 });
  assert.equal(rows.length, 5);
  const current = rows.find((r) => r.label === "Mevcut fiyat")!;
  assert.equal(current.quantity, 10);
  assert.equal(current.revenue, 1000);
  assert.equal(current.grossProfit, 600);
  assert.equal(current.contributionProfit, 500);
  const minus10 = rows[1]; // -10%
  assert.ok(Math.abs(minus10.price - 90) < 1e-9);
  assert.ok(minus10.contributionProfit < current.contributionProfit);
});

test("weightedScore eksik kriteri 0 saymaz, ağırlığı düşürür", () => {
  const full = weightedScore([
    { key: "a", weight: 50, score: 100 },
    { key: "b", weight: 50, score: 0 },
  ]);
  assert.equal(full.score, 50);
  assert.equal(full.coverage, 100);
  // b eksik → yalnızca a üzerinden normalize → 100, kapsama 50
  const partial = weightedScore([
    { key: "a", weight: 50, score: 100 },
    { key: "b", weight: 50, score: null },
  ]);
  assert.equal(partial.score, 100);
  assert.equal(partial.coverage, 50);
  assert.deepEqual(partial.missing, ["b"]);
  const none = weightedScore([{ key: "a", weight: 50, score: null }]);
  assert.equal(none.score, null);
  assert.equal(none.coverage, 0);
});

test("güvenilirlik: doygunluk, kapsam ve birleşik puan", () => {
  assert.equal(sampleSaturation(14, 28), 0.5);
  assert.equal(sampleSaturation(100, 28), 1);
  const cov = coverageOf(8, 10);
  assert.equal(cov.coverage, 80);
  assert.equal(cov.label, "HIGH");
  assert.equal(confidenceGrade(80), "HIGH");
  assert.equal(confidenceGrade(50), "MEDIUM");
  assert.equal(confidenceGrade(20), "LOW");
  // kapsam ve örneklem sıfırsa güven de sıfır
  assert.equal(combinedConfidence(0, 0, 28), 0);
  assert.ok(combinedConfidence(100, 100, 28) > combinedConfidence(100, 4, 28));
});

test("priorityScore ağırlıklı; reliability default'u güven puanından gelir", () => {
  const score = priorityScore({ financialImpact: 80, feasibility: 60, urgency: 70, reliability: 90, strategic: 50 });
  assert.ok(score > 0 && score <= 100);
  const w = DEFAULT_PRIORITY_WEIGHTS;
  assert.equal(w.financial + w.feasibility + w.urgency + w.reliability + w.strategic, 100);
  assert.equal(severityFromPriority(90), "CRITICAL");
  assert.equal(severityFromPriority(75), "HIGH");
  assert.equal(severityFromPriority(50), "MEDIUM");
  assert.equal(severityFromPriority(10), "LOW");
  assert.equal(financialImpactScale(0), 0);
  assert.ok(financialImpactScale(100000) <= 100);
});

test("buildOpportunity: öncelik ve severity otomatik işlenir", () => {
  const opp = buildOpportunity({
    opportunityKey: "PRICING_OPPORTUNITY|product:1|low_margin",
    opportunityType: "PRICING_OPPORTUNITY",
    title: "Test",
    description: "Test fırsatı",
    sourceModule: "pricing",
    relatedProductId: 1,
    confidenceScore: 80,
    dataCoverage: 70,
    priorityInputs: { financialImpact: 70, feasibility: 80, urgency: 60, strategic: 50 },
    evidence: ["Kanıt A"],
    assumptions: ["Varsayım B"],
    calculationMethod: "yöntem",
    recommendedAction: "eylem",
  });
  assert.ok(opp.priorityScore > 0);
  assert.ok(["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(opp.severity));
  // reliability verilmemişse confidenceScore kullanılır (buildOpportunity içi)
  assert.ok(opp.priorityScore <= 100);
});
