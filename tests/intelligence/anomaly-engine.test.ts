import { test } from "node:test";
import assert from "node:assert/strict";
import { detectSeriesAnomalies } from "@/lib/intelligence/anomalies/anomaly-engine";

function mkDates(n: number) {
  const out: string[] = [];
  const d = new Date();
  d.setDate(d.getDate() - n);
  for (let i = 0; i < n; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

test("spike is detected with direction UP", () => {
  const n = 40;
  const dates = mkDates(n);
  const values = Array.from({ length: n }, () => 10);
  values[n - 1] = 100; // son gün patlaması
  const hits = detectSeriesAnomalies({ metric: "DAILY_REVENUE", entityType: "STORE", entityId: "STORE", entityLabel: "Mağaza", dates, values });
  assert.ok(hits.length >= 1, "en az bir anomali beklenirdi");
  const spike = hits.find((h) => h.observedValue === 100);
  assert.ok(spike, "spike günü anomalisi bulunamadı");
  assert.equal(spike!.direction, "UP");
  assert.ok(["HIGH", "CRITICAL"].includes(spike!.severity));
});

test("flat series has no anomalies", () => {
  const n = 40;
  const dates = mkDates(n);
  const values = Array.from({ length: n }, (_, i) => 10 + (i % 2) * 0.1);
  const hits = detectSeriesAnomalies({ metric: "DAILY_REVENUE", entityType: "STORE", entityId: "STORE", entityLabel: "Mağaza", dates, values });
  assert.equal(hits.length, 0);
});

test("below minimum observations -> no detection, no crash", () => {
  const dates = mkDates(8);
  const values = [1, 2, 3, 1, 2, 3, 1, 500];
  const hits = detectSeriesAnomalies({ metric: "X", entityType: "STORE", entityId: "STORE", entityLabel: "S", dates, values });
  assert.equal(hits.length, 0);
});

test("anomalyKey format metric|entity|date (dedup-friendly)", () => {
  const n = 35;
  const dates = mkDates(n);
  const values = Array.from({ length: n }, () => 5);
  values[n - 3] = 90;
  const hits = detectSeriesAnomalies({ metric: "AVG_BASKET", entityType: "STORE", entityId: "STORE", entityLabel: "Mağaza", dates, values });
  for (const h of hits) {
    assert.match(h.anomalyKey, /^AVG_BASKET\|STORE\|\d{4}-\d{2}-\d{2}$/);
    assert.ok(["LOW_DATA_CONFIDENCE", "OK"].includes(h.confidence));
  }
});
