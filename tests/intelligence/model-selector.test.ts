import { test } from "node:test";
import assert from "node:assert/strict";
import { selectModel } from "@/lib/intelligence/forecasting/model-selector";

test("insufficient data -> INSUFFICIENT_DATA, no model", () => {
  const s = selectModel([1, 2, 3], 7, 5);
  assert.equal(s.chosen, null);
  assert.equal(s.dataQuality, "INSUFFICIENT_DATA");
});

test("too few nonzero observations -> INSUFFICIENT_DATA", () => {
  const series = [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0];
  const s = selectModel(series, 7, 5);
  assert.equal(s.chosen, null);
  assert.equal(s.dataQuality, "INSUFFICIENT_DATA");
});

test("steady long series -> model chosen, quality OK", () => {
  const series = Array.from({ length: 60 }, (_, i) => 10 + Math.sin(i / 3) * 2);
  const s = selectModel(series, 7, 5);
  assert.ok(s.chosen != null);
  assert.equal(s.dataQuality, "OK");
  assert.ok(s.chosenMetrics != null && s.chosenMetrics.wape != null);
  assert.ok(s.results.length === 9);
});

test("short-ish series -> LOW_DATA flag", () => {
  const series = Array.from({ length: 15 }, (_, i) => 5 + (i % 3));
  const s = selectModel(series, 7, 5);
  // nonzeroCount=15 >= 4, n>=10 -> chosen; n<28 -> LOW_DATA
  assert.equal(s.dataQuality, "LOW_DATA");
});

test("backtest is out-of-sample (chosen metrics sampleSize = testSize)", () => {
  const series = Array.from({ length: 40 }, (_, i) => 20 + (i % 7));
  const s = selectModel(series, 7, 5);
  assert.ok(s.chosenMetrics != null);
  assert.ok(s.chosenMetrics!.sampleSize <= 5);
});
