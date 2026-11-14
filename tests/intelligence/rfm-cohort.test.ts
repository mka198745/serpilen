import { test } from "node:test";
import assert from "node:assert/strict";
import { computeRfm } from "@/lib/intelligence/customers/rfm-engine";
import { computeCohorts } from "@/lib/intelligence/customers/cohort-engine";
import { makeBundle, makeOrder, makeProduct } from "./helpers";

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function rfmBundle() {
  // 24 müşteri: yarısı yakın+sık, yarısı eski+tek sefer
  const orders = [];
  const items = [];
  for (let c = 1; c <= 24; c++) {
    const loyal = c <= 12;
    const base = loyal ? [5, 40, 80] : [300];
    for (let k = 0; k < base.length; k++) {
      const id: number = orders.length + 1;
      orders.push(
        makeOrder({
          id,
          createdAt: daysAgo(base[k]),
          customerId: 1000 + c,
          customerName: `Müşteri ${c}`,
          subtotal: loyal ? 500 : 100,
          grandTotal: loyal ? 500 : 100,
        })
      );
      items.push({ orderId: id, productId: 1, variantId: null, productName: "P1", sku: "P1", unitPrice: loyal ? 500 : 100, quantity: 1, totalPrice: loyal ? 500 : 100 });
    }
  }
  return makeBundle({ orders, items, products: [makeProduct({ id: 1 })] });
}

test("RFM scores within 1-5, segments sum to customer count", () => {
  const r = computeRfm(rfmBundle(), 365);
  assert.equal(r.customerCount, 24);
  for (const row of r.rows) {
    for (const s of [row.rScore, row.fScore, row.mScore]) assert.ok(s >= 1 && s <= 5);
  }
  const segTotal = r.segments.reduce((s, x) => s + x.count, 0);
  assert.equal(segTotal, 24);
  assert.equal(r.sampleWarning, null); // 24 ≥ 20
  assert.ok(r.kpis.repeatPurchaseRate! > 0);
});

test("loyal customers outrank dormant ones on recency", () => {
  const r = computeRfm(rfmBundle(), 365);
  const loyalRow = r.rows.find((x) => x.customerId === 1001)!;
  const dormantRow = r.rows.find((x) => x.customerId === 1013)!;
  assert.ok(loyalRow.rScore > dormantRow.rScore);
  assert.ok(loyalRow.fScore > dormantRow.fScore);
});

test("small sample produces sampleWarning", () => {
  const orders = [makeOrder({ id: 1, createdAt: daysAgo(3), customerId: 1, grandTotal: 100 })];
  const r = computeRfm(makeBundle({ orders, items: [], products: [] }), 365);
  assert.ok(r.sampleWarning != null);
});

test("cancelled orders excluded from RFM", () => {
  const orders = [
    makeOrder({ id: 1, createdAt: daysAgo(3), customerId: 1, grandTotal: 100 }),
    makeOrder({ id: 2, createdAt: daysAgo(2), customerId: 1, grandTotal: 9999, status: "CANCELLED" }),
  ];
  const r = computeRfm(makeBundle({ orders, items: [], products: [] }), 365);
  const row = r.rows.find((x) => x.customerId === 1)!;
  assert.equal(row.frequency, 1);
  assert.equal(row.monetary, 100);
});

test("Cohort: month 0 = 100%, unfinished months are null", () => {
  // 3 müşteri, hepsi 2 ay önce ilk alışveriş, 1 ay sonra hepsi tekrar geldi
  const first = daysAgo(62);
  const second = daysAgo(30);
  const orders = [
    makeOrder({ id: 1, createdAt: first, customerId: 1, grandTotal: 100 }),
    makeOrder({ id: 2, createdAt: first, customerId: 2, grandTotal: 100 }),
    makeOrder({ id: 3, createdAt: first, customerId: 3, grandTotal: 100 }),
    makeOrder({ id: 4, createdAt: second, customerId: 1, grandTotal: 100 }),
    makeOrder({ id: 5, createdAt: second, customerId: 2, grandTotal: 100 }),
  ];
  const r = computeCohorts(makeBundle({ orders, items: [], products: [] }));
  assert.equal(r.cohorts.length, 1);
  const c = r.cohorts[0];
  assert.equal(c.size, 3);
  assert.equal(c.retention[0], 100);
  assert.equal(c.retention[1], Number(((2 / 3) * 100).toFixed(1))); // 66.7
  // gelecek aylar (henüz tamamlanmamış) null olmalı
  const now = new Date();
  const monthsElapsed = (now.getFullYear() * 12 + now.getMonth()) - (first.getFullYear() * 12 + first.getMonth());
  assert.equal(c.retention[monthsElapsed + 1], null);
});
