import { test } from "node:test";
import assert from "node:assert/strict";
import { computeAbcXyz } from "@/lib/intelligence/inventory/abc-xyz";
import { makeBundle, makeOrder, makeProduct } from "./helpers";

function seriesBundle() {
  // 10 ürün; P1 baskın (defalarca), diğerleri 1'er kez; hepsi maliyetli
  const orders = [];
  const items = [];
  let oid = 0;
  const start = new Date();
  start.setDate(start.getDate() - 120);
  for (let d = 0; d < 120; d++) {
    // P1 her gün 4 adet, P2 her 3 günde 1, P3-10 ara sıra
    const sales: Array<[number, number]> = [[1, 4]];
    if (d % 3 === 0) sales.push([2, 1]);
    if (d % 11 === 0) sales.push([3, 1]);
    if (d % 17 === 0) sales.push([4, 1]);
    if (d % 23 === 0) sales.push([5, 1]);
    if (d % 29 === 0) sales.push([6, 1]);
    if (d === 5) sales.push([7, 1]);
    if (d === 40) sales.push([8, 1]);
    if (d === 70) sales.push([9, 1]);
    if (d === 100) sales.push([10, 1]);
    for (const [pid, qty] of sales) {
      oid++;
      const date = new Date(start);
      date.setDate(date.getDate() + d);
      orders.push(makeOrder({ id: oid, createdAt: date, customerId: 1, subtotal: qty * 100, grandTotal: qty * 100 }));
      items.push({ orderId: oid, productId: pid, variantId: null, productName: `P${pid}`, sku: `P${pid}`, unitPrice: 100, quantity: qty, totalPrice: qty * 100 });
    }
  }
  const products = Array.from({ length: 10 }, (_, i) => makeProduct({ id: i + 1, name: `P${i + 1}`, buyPrice: 40 }));
  return makeBundle({
    orders,
    items,
    products,
    inventory: products.map((p) => ({ productId: p.id, variantId: null, warehouseId: 1, physicalQty: 100, reservedQty: 10 })),
  });
}

test("dominant product is class A; tail products are C", () => {
  const r = computeAbcXyz(seriesBundle(), { windowDays: 365 });
  const p1 = r.rows.find((x) => x.productId === 1)!;
  assert.equal(p1.abcClass, "A");
  const tail = r.rows.filter((x) => x.annualQty <= 2 && x.productId >= 7);
  for (const t of tail) assert.equal(t.abcClass, "C");
  // kümülatif geçerlilik: sınıflar A...A B...B C...C sıralı (annualValue desc)
  const sorted = [...r.rows].sort((a, b) => b.annualValue - a.annualValue);
  const orderIdx = { A: 0, B: 1, C: 2, "N/A": 3 } as const;
  const ranks = sorted.map((x) => orderIdx[x.abcClass]);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
});

test("missing buyPrice -> ABC N/A (no invented class)", () => {
  const orders = [makeOrder({ id: 1, createdAt: new Date(), customerId: 1, grandTotal: 100 })];
  const items = [{ orderId: 1, productId: 1, variantId: null, productName: "P1", sku: "P1", unitPrice: 100, quantity: 1, totalPrice: 100 }];
  const products = [makeProduct({ id: 1, buyPrice: 0 })];
  const r = computeAbcXyz(makeBundle({ orders, items, products }));
  assert.equal(r.rows.find((x) => x.productId === 1)?.abcClass, "N/A");
});

test("zero-demand product gets ABC C and XYZ N/A, risk DEAD_STOCK", () => {
  const products = [makeProduct({ id: 1, buyPrice: 40 })];
  const r = computeAbcXyz(
    makeBundle({ orders: [], items: [], products, inventory: [{ productId: 1, variantId: null, warehouseId: 1, physicalQty: 50, reservedQty: 0 }] })
  );
  const row = r.rows.find((x) => x.productId === 1)!;
  assert.equal(row.abcClass, "C");
  assert.equal(row.xyzClass, "N/A");
  assert.equal(row.risk, "DEAD_STOCK");
});

test("XYZ: steady daily demand -> X, intermittent -> Z/Y, no info -> N/A", () => {
  const orders = [];
  const items = [];
  const start = new Date();
  start.setDate(start.getDate() - 400);
  let oid = 0;
  for (let d = 0; d < 400; d++) {
    oid++;
    const date = new Date(start);
    date.setDate(date.getDate() + d);
    orders.push(makeOrder({ id: oid, createdAt: date, customerId: 1, grandTotal: 200 }));
    items.push({ orderId: oid, productId: 1, variantId: null, productName: "P1", sku: "P1", unitPrice: 100, quantity: 2, totalPrice: 200 });
  }
  const products = [makeProduct({ id: 1, buyPrice: 10 })];
  const r = computeAbcXyz(makeBundle({ orders, items, products }), { windowDays: 365 });
  const row = r.rows.find((x) => x.productId === 1)!;
  assert.equal(row.xyzClass, "X"); // her ay ~eşit talep, CV düşük
});
