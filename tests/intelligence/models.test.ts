import { test } from "node:test";
import assert from "node:assert/strict";
import { FORECAST_MODELS, getModel } from "@/lib/intelligence/forecasting/models";

const steady = Array.from({ length: 60 }, () => 10);

test("SMA returns window average for every horizon step", () => {
  const out = getModel("SMA").forecast(steady, 5, 7);
  assert.deepEqual(out, [10, 10, 10, 10, 10]);
});

test("WMA weights recent values higher than SMA", () => {
  const series = [0, 0, 0, 0, 0, 0, 7];
  const wma = getModel("WMA").forecast(series, 1, 7)[0];
  const sma = getModel("SMA").forecast(series, 1, 7)[0];
  assert.ok(wma > sma, `WMA(${wma}) SMA(${sma})'den büyük olmalı`);
  assert.ok(Math.abs(wma - (7 * 7) / 28) < 1e-9); // 1.75 — ağırlıklar 1..7
  assert.ok(wma < 7);
});

test("SES stays at level for constant series", () => {
  assert.deepEqual(getModel("SES").forecast(steady, 3, 7), [10, 10, 10]);
});

test("LINEAR_REGRESSION extrapolates upward trend", () => {
  const series = Array.from({ length: 30 }, (_, i) => i + 1);
  const out = getModel("LINEAR_REGRESSION").forecast(series, 2, 7);
  assert.ok(Math.abs(out[0] - 31) < 0.5, `got ${out[0]}`);
  assert.ok(out[1] > out[0]);
});

test("SEASONAL_NAIVE repeats last period", () => {
  const week = [1, 2, 3, 4, 5, 6, 7, 1, 2, 3, 4, 5, 6, 7];
  const out = getModel("SEASONAL_NAIVE").forecast(week, 7, 7);
  assert.deepEqual(out, [1, 2, 3, 4, 5, 6, 7]);
});

test("HOLT_WINTERS reproduces weekly seasonal pattern", () => {
  const seasonal = [10, 50, 10, 10, 10, 10, 10];
  const series = [...seasonal, ...seasonal, ...seasonal, ...seasonal];
  const out = getModel("HOLT_WINTERS").forecast(series, 7, 7);
  assert.equal(out.length, 7);
  // salı (idx 1) tahmini cuma-sb günlerinden belirgin yüksek olmalı
  assert.ok(out[1] > out[0] && out[1] > out[3]);
});

test("Croston/SBA handle intermittent demand; SBA <= Croston bias", () => {
  const series = [0, 0, 5, 0, 0, 0, 7, 0, 0, 3, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0];
  const croston = getModel("CROSTON").forecast(series, 4, 7);
  const sba = getModel("SBA").forecast(series, 4, 7);
  assert.ok(croston[0] > 0);
  assert.ok(sba[0] <= croston[0] + 1e-9);
  assert.equal(new Set(croston).size, 1); // düzey tahmini sabit
});

test("all models return non-negative finite values", () => {
  for (const m of FORECAST_MODELS) {
    const out = m.forecast(steady, 7, 7);
    assert.equal(out.length, 7, m.id);
    for (const v of out) {
      assert.ok(Number.isFinite(v) && v >= 0, `${m.id} -> ${v}`);
    }
  }
});
