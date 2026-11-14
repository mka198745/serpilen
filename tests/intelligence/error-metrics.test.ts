import { test } from "node:test";
import assert from "node:assert/strict";
import { errorMetrics } from "@/lib/intelligence/accuracy/error-metrics";

test("perfect prediction -> 0 error, 0 bias", () => {
  const m = errorMetrics([5, 5, 5], [5, 5, 5]);
  assert.equal(m.mae, 0);
  assert.equal(m.rmse, 0);
  assert.equal(m.bias, 0);
  assert.equal(m.wape, 0);
  assert.equal(m.mape, 0);
});

test("MAPE null when all actuals are zero", () => {
  const m = errorMetrics([1, 2], [0, 0]);
  assert.equal(m.mape, null);
  assert.equal(m.wape, null); // payda 0
});

test("MAPE skips zero actuals but uses the rest", () => {
  const m = errorMetrics([110, 5], [100, 0]);
  assert.ok(m.mape != null && Math.abs(m.mape - 10) < 1e-9);
});

test("WAPE = sum|e| / sum|actual|", () => {
  const m = errorMetrics([90, 110], [100, 100]);
  assert.ok(Math.abs(m.wape! - 10) < 1e-9);
});

test("bias sign follows over-prediction", () => {
  const over = errorMetrics([12, 12], [10, 10]);
  const under = errorMetrics([8, 8], [10, 10]);
  assert.ok(over.bias > 0);
  assert.ok(under.bias < 0);
});

test("MASE null when naive MAE is 0", () => {
  const m = errorMetrics([5, 5, 5], [5, 5, 5]);
  assert.equal(m.mase, null);
  const m2 = errorMetrics([1, 2, 3, 4], [1, 2, 3, 5]);
  assert.ok(m2.mase != null && m2.mase >= 0);
});
