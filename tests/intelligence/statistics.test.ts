import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sum, mean, variance, stddev, median, quantile, clamp, coefficientOfVariation,
  mad, iqrBounds, ewmaSeries, linearRegression, quantileScore, cusumSeries,
} from "@/lib/intelligence/core/statistics";

test("sum/mean/variance/stddev", () => {
  assert.equal(sum([1, 2, 3, 4]), 10);
  assert.equal(mean([2, 4, 6]), 4);
  assert.equal(variance([2, 4, 4, 4, 5, 5, 7, 9]), 4);
  assert.ok(Math.abs(stddev([2, 4, 4, 4, 5, 5, 7, 9]) - 2) < 1e-9);
  assert.equal(mean([]), 0);
});

test("median odd/even", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
});

test("quantile linear interpolation", () => {
  assert.equal(quantile([1, 2, 3, 4, 5], 0.5), 3);
  assert.equal(quantile([0, 10], 0.25), 2.5);
  assert.equal(quantile([], 0.5), 0);
});

test("clamp + coefficientOfVariation", () => {
  assert.equal(clamp(5, 0, 1), 1);
  assert.equal(coefficientOfVariation([0, 0, 0]), null); // tanımsız — 0'a bölme yok
  assert.ok(coefficientOfVariation([10, 12, 11, 9, 10])! > 0);
});

test("mad and iqrBounds", () => {
  assert.equal(mad([1, 1, 1, 1, 100]), 0);
  const b = iqrBounds([1, 2, 3, 4, 5, 6, 7, 8, 100]);
  assert.ok(b.upper < 100);
});

test("ewmaSeries converges to level", () => {
  const out = ewmaSeries([10, 10, 10, 10], 0.5);
  assert.equal(out.length, 4);
  assert.equal(out[3], 10);
});

test("linearRegression exact fit", () => {
  const { slope, intercept, r2 } = linearRegression([1, 3, 5, 7, 9]);
  assert.ok(Math.abs(slope - 2) < 1e-9);
  assert.ok(Math.abs(intercept - 1) < 1e-9);
  assert.ok(Math.abs(r2 - 1) < 1e-9);
});

test("cusumSeries non-negative and grows on shift", () => {
  const { pos, neg } = cusumSeries([10, 10, 10, 30, 30, 30]);
  assert.equal(pos.length, 6);
  assert.ok(pos[5] > pos[2]);
  assert.ok(neg.every((v) => v >= 0));
});

test("quantileScore deterministic 1-5, invert flips", () => {
  const sorted = [10, 20, 30, 40, 50];
  assert.equal(quantileScore(50, sorted), 5);
  assert.equal(quantileScore(10, sorted), 1);
  assert.equal(quantileScore(10, sorted, true), 5); // invert: küçük = iyi
  assert.equal(quantileScore(50, sorted, true), 1);
  for (const v of sorted) {
    const s = quantileScore(v, sorted);
    assert.ok(s >= 1 && s <= 5);
  }
});
