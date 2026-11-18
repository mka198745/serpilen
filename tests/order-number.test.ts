import { strict as assert } from "node:assert";
import { test } from "node:test";
import { formatOrderNumber, nextSequenceFrom, normalizeOrderNumber } from "../src/lib/order-number";

test("Sipariş numarası yıl ve en az dört haneli sıra içerir", () => {
  assert.equal(formatOrderNumber(1, 2026), "SİP20260001");
  assert.equal(formatOrderNumber(10000, 2026), "SİP202610000");
  assert.equal(formatOrderNumber(1, 2027), "SİP20270001");
});

test("Yeni yılda sıra yeniden başlar", () => {
  const numbers = ["SİP20260003", "SİP20260009", "OR-2026-12345"];
  assert.equal(nextSequenceFrom(numbers, 2026), 10);
  assert.equal(nextSequenceFrom(numbers, 2027), 1);
});

test("İ ve I ile yazılan numaralar aramada eşleşir", () => {
  assert.equal(normalizeOrderNumber("sip 2026-0001"), "SIP20260001");
  assert.equal(normalizeOrderNumber("SİP20260001"), "SIP20260001");
});
