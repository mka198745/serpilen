/**
 * FAZ 3 (Karar Zekâsı) uçtan uca duman testi — YALNIZCA "scratch" içeren DATABASE_URL ile çalışır.
 * Canlı DB'ye asla dokunmaz. Migration 0006'nın scratch üzerinde uygulanmış olması gerekir.
 */
import "dotenv/config";
if (!(process.env.DATABASE_URL || "").includes("scratch")) {
  console.error("GÜVENLİK: Bu script yalnızca 'scratch' içeren DATABASE_URL ile çalışır. Çıkılıyor.");
  process.exit(1);
}

async function main() {
  console.log("=== 1) TAM ANALİZ (persist) — runDecisionAnalysis ===");
  const { runDecisionAnalysis } = await import("../src/lib/intelligence/decision/orchestrator/orchestrator");
  const r1 = await runDecisionAnalysis({ actor: "Smoke Test", mode: "MANUAL", persist: true });
  console.log("summary:", JSON.stringify(r1.summary));
  console.log("decisions:", r1.decisions.length, "alerts:", r1.alerts?.length ?? "-");

  console.log("\n=== 2) İDEMPOTENSİ (2. çalıştırma — yeni kayıt beklenmez) ===");
  const r2 = await runDecisionAnalysis({ actor: "Smoke Test", mode: "MANUAL", persist: true });
  console.log("summary:", JSON.stringify(r2.summary));

  console.log("\n=== 3) WHAT-IF SENARYOSU — buildBaseline + runScenario + kaydet ===");
  const { buildBaseline } = await import("../src/lib/intelligence/decision/simulation/baseline");
  const { runScenario } = await import("../src/lib/intelligence/decision/simulation/engine");
  const { createScenarioDefinition, saveScenarioResult, listScenarios } = await import("../src/lib/intelligence/decision/simulation/store");
  const baseline = await buildBaseline("PRICING", null, null, 90);
  console.log("baseline (PRICING/global, 90g):", JSON.stringify(baseline));
  const sres = runScenario("PRICING", baseline, { priceDeltaPct: 10, elasticityPctPerPct: -0.8 });
  console.log("sonuç: expected.netSales=", sres.expected.netSales, "kâr=", sres.expected.contributionProfit, "risk=", sres.riskScore, "assumptions=", sres.assumptions.length);
  const sid = await createScenarioDefinition({ name: "Smoke PRICING +10%", description: "smoke", category: "PRICING", scopeType: null, scopeId: null, parameters: { priceDeltaPct: 10, elasticityPctPerPct: -0.8 }, periodStart: new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10), periodEnd: new Date().toISOString().slice(0, 10), actor: "Smoke Test" });
  const srid = await saveScenarioResult({ scenarioId: sid, result: sres, actor: "Smoke Test" });
  const listed = await listScenarios(5);
  console.log("senaryo kaydedildi id=", sid, "sonuçId=", srid, "liste=", listed.map((x: any) => `#${x.id}:${x.name}`).join(" | "));

  console.log("\n=== 4) MONTE CARLO (seed'li) ===");
  const { runMonteCarlo } = await import("../src/lib/intelligence/decision/monte-carlo/engine");
  const { persistMonteCarloRun, listMonteCarloRuns } = await import("../src/lib/intelligence/decision/monte-carlo/store");
  const mc = runMonteCarlo({
    name: "Smoke katkı kârı", kind: "CONTRIBUTION",
    variables: [
      { name: "price", distribution: { type: "normal", params: { mean: 100, stddev: 5 } }, observationCount: 60, rationale: "smoke" },
      { name: "cost", distribution: { type: "lognormal", params: { mu: 3.6, sigma: 0.2 } }, observationCount: 60, rationale: "smoke" },
      { name: "units", distribution: { type: "triangular", params: { min: 5, mode: 10, max: 20 } }, observationCount: 60, rationale: "smoke" },
    ],
    outputFormula: "(price - cost) * units", iterations: 500, seed: 1234,
  }, { minIterations: 100, maxIterations: 10000 });
  console.log("MC: mean=", mc.mean.toFixed(2), "median=", mc.median.toFixed(2), "P5=", mc.p5.toFixed(2), "P95=", mc.p95.toFixed(2), "P(zarar)=", mc.probLoss, "hedef=", mc.probTarget, "yakınsadı=", mc.reliability.converged, "korelasyon=", mc.reliability.correlationUsed);
  const mcId = await persistMonteCarloRun({ request: { name: "Smoke katkı kârı", kind: "CONTRIBUTION", variables: [
    { name: "price", distribution: { type: "normal", params: { mean: 100, stddev: 5 } }, observationCount: 60, rationale: "smoke" },
    { name: "cost", distribution: { type: "lognormal", params: { mu: 3.6, sigma: 0.2 } }, observationCount: 60, rationale: "smoke" },
    { name: "units", distribution: { type: "triangular", params: { min: 5, mode: 10, max: 20 } }, observationCount: 60, rationale: "smoke" },
  ], outputFormula: "(price - cost) * units", iterations: 500, seed: 1234, clipFraction: 0.005 }, result: mc, actor: "Smoke Test" });
  const runs = await listMonteCarloRuns(5);
  console.log("MC kaydedildi id=", mcId, "| liste:", runs.map((r) => `#${r.id} seed=${r.seed} ort=${Number((r.results as any)?.mean).toFixed(1)}`).join(" | "));

  console.log("\n=== 5) HEDEFLER — oluştur + ölç + değerlendir ===");
  const { createGoal, listGoalsWithProgress, measureAndUpdateGoal, evaluateGoalOutcome, validateGoalInput } = await import("../src/lib/intelligence/decision/goals/store");
  const v = validateGoalInput({ name: "Smoke Ciro Hedefi", category: "SALES", kpi: "REVENUE", unit: "TL", targetValue: 1, direction: "HIGHER_BETTER", startDate: "2026-09-01", endDate: "2026-12-31", priority: "MEDIUM", measurementMethod: "AUTO" });
  console.log("validateGoalInput:", JSON.stringify(v));
  const gid = await createGoal({ name: "Smoke Ciro Hedefi", category: "SALES", kpi: "REVENUE", unit: "TL", baselineValue: null, targetValue: 1, direction: "HIGHER_BETTER", startDate: "2026-09-01", endDate: "2026-12-31", responsibleUser: null, priority: "MEDIUM", measurementMethod: "AUTO", notes: "smoke" }, "Smoke Test");
  console.log("hedef oluşturuldu id=", gid);
  const measured = await measureAndUpdateGoal(gid, "Smoke Test");
  console.log("ölçüm: current=", measured?.currentValue, "progress=", measured?.progressPct, "forecast(projected)=", measured?.forecast?.projected, "note=", measured?.forecast?.note);
  const ev = await evaluateGoalOutcome(gid, "Smoke Test");
  console.log("değerlendirme:", JSON.stringify(ev));
  const { goals, conflicts } = await listGoalsWithProgress();
  console.log("hedefler:", goals.length, "çelişki:", conflicts.length);

  console.log("\n=== 6) SONUÇ KAYDI + ETKİNLİK ===");
  const { db } = await import("../src/db");
  const { decisionRecords } = await import("../src/db/schema");
  const { eq } = await import("drizzle-orm");
  const implemented = await db.select({ id: decisionRecords.id, status: decisionRecords.status }).from(decisionRecords).where(eq(decisionRecords.status, "IMPLEMENTED")).limit(1);
  if (implemented.length === 0) {
    console.log("IMPLEMENTED kayıt yok — recordOutcome atlandı (analiz henüz uygulama üretmedi, beklenen).");
  } else {
    const { recordOutcome, computeEffectiveness } = await import("../src/lib/intelligence/decision/outcomes/store");
    const rec = await recordOutcome({ decisionId: implemented[0].id, actualProfitImpact: 1000, note: "smoke", actor: "Smoke Test" });
    console.log("sonuç kaydı:", JSON.stringify(rec));
    const eff = await computeEffectiveness();
    console.log("etkinlik:", JSON.stringify({ decisionsTotal: eff.decisionsTotal, approved: eff.approved, withOutcome: eff.withOutcome, successRatePct: eff.successRatePct, financialRealizationPct: eff.financialRealizationPct }));
  }

  console.log("\n=== 7) AYARLAR — FAZ3 merge/validate ===");
  const { mergeFaz3Settings, validateFaz3Setting, FAZ3_DEFAULTS } = await import("../src/lib/intelligence/decision/core/settings");
  const merged = mergeFaz3Settings(null);
  console.log("varsayılan anahtar sayısı:", Object.keys(merged).length, "| örnek min_coverage_for_high =", merged["faz3.confidence.min_coverage_for_high"]);
  console.log("validate ok(28):", validateFaz3Setting("faz3.confidence.min_coverage_for_high", "28"));
  console.log("validate bad(200):", validateFaz3Setting("faz3.confidence.min_coverage_for_high", "200"));
  console.log("validate unknown:", validateFaz3Setting("faz3.unknown_key", "1"));

  console.log("\n=== 8) ERKEN UYARI — tarama ===");
  const { upsertAlerts, sweepAlerts } = await import("../src/lib/intelligence/decision/early-warning/store");
  console.log("sweep (expire):", await sweepAlerts(30, "Smoke Test"));
  const { db: db2 } = await import("../src/db");
  const { earlyWarningEvents } = await import("../src/db/schema");
  const alerts = await db2.select().from(earlyWarningEvents).limit(5);
  console.log("uyarı kayıtları (örnek):", alerts.map((a) => `#${a.id} ${a.alertType}/${a.severity}/${a.status}`).join(" | ") || "YOK");

  console.log("\nSMOKE OK");
  process.exit(0);
}
main().catch((e) => { console.error("SMOKE FAIL:", e); process.exit(1); });
