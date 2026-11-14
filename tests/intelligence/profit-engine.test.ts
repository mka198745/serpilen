import { test } from "node:test";
import assert from "node:assert/strict";
import { computeProfitability } from "@/lib/intelligence/profitability/profit-engine";
import { makeBundle, makeOrder, makeProduct } from "./helpers";

const twoLines = () => {
  const order = makeOrder({ id: 1, createdAt: new Date(), subtotal: 300, discountTotal: 30, grandTotal: 270 });
  const items = [
    { orderId: 1, productId: 1, variantId: null, productName: "P1", sku: "P1", unitPrice: 100, quantity: 2, totalPrice: 200 },
    { orderId: 1, productId: 2, variantId: null, productName: "P2", sku: "P2", unitPrice: 100, quantity: 1, totalPrice: 100 },
  ];
  const products = [makeProduct({ id: 1, name: "P1", buyPrice: 60 }), makeProduct({ id: 2, name: "P2", buyPrice: 0 })];
  return { order, items, products };
};

test("pro-rata discount and COGS by line", () => {
  const { order, items, products } = twoLines();
  const r = computeProfitability(makeBundle({ orders: [order], items, products }));
  const p1 = r.levels.product.find((p) => p.key === "1")!;
  const p2 = r.levels.product.find((p) => p.key === "2")!;
  assert.equal(p1.grossSales, 200);
  assert.equal(p2.grossSales, 100);
  assert.equal(p1.discounts, 20); // 30 × 200/300
  assert.equal(p2.discounts, 10);
  assert.equal(p1.cogs, 120); // 2 × 60
  assert.equal(p2.cogs, 0);
  assert.equal(p1.costCoverage, 1);
  assert.equal(p2.costCoverage, 0);
  assert.equal(p2.status, "INSUFFICIENT_DATA");
});

test("item-level refund counted ONCE (no double count), order-level refund added at order/channel level", () => {
  const { order, items, products } = twoLines();
  const bundle = makeBundle({
    orders: [order],
    items,
    products,
    refunds: [
      { orderId: 1, productId: 1, refundAmount: 50, createdAt: new Date() },
      { orderId: 1, productId: null, refundAmount: 20, createdAt: new Date() },
    ],
  });
  const r = computeProfitability(bundle);
  const p1 = r.levels.product.find((p) => p.key === "1")!;
  assert.equal(p1.refunds, 50); // çift sayılmamalı
  const cat = r.levels.category[0];
  assert.equal(cat.refunds, 50); // kategori: yalnız ürün iadesi (order-level kalemlere bölünemez)
  const channel = r.levels.channel[0];
  assert.equal(channel.refunds, 70); // 50 (ürün) + 20 (sipariş seviyesi)
  const daily = r.levels.daily[0];
  assert.equal(daily.refunds, 70);
  const net = 300 - 30 - 70;
  assert.equal(channel.netSales, net);
});

test("REFUNDED order is excluded; REQUESTED refunds don't reach the engine", () => {
  const { items, products } = twoLines();
  const cancelled = makeOrder({ id: 1, createdAt: new Date(), status: "REFUNDED", grandTotal: 300 });
  const r = computeProfitability(makeBundle({ orders: [cancelled], items, products }));
  assert.equal(r.levels.product.length, 0);
  assert.equal(r.levels.channel.length, 0);
});

test("item refund applied to a product that was not sold is ignored for that product rows; channel keeps it", () => {
  const { order, items, products } = twoLines();
  const bundle = makeBundle({
    orders: [order],
    items,
    products,
    refunds: [
      { orderId: 1, productId: 1, refundAmount: 50, createdAt: new Date() },
      { orderId: 1, productId: 999, refundAmount: 40, createdAt: new Date() },
    ],
  });
  const r = computeProfitability(bundle);
  // 999 ürünü satılmamış → ürün satırında yer almıyor (uydurma satır açılmaz)
  assert.equal(r.levels.product.find((p) => p.key === "999"), undefined);
  const p1 = r.levels.product.find((p) => p.key === "1")!;
  assert.equal(p1.refunds, 50); // eşleşen iade ürün satırında bir kez sayılır
  // eşlenmeyen ürün iadesi kanal toplamında kaybolmamalı:
  const channel = r.levels.channel[0];
  assert.equal(channel.refunds, 90); // eşleşen (P1) 50 + eşlenmeyen (999) 40
});

test("cost coverage overall reported", () => {
  const { order, items, products } = twoLines();
  const r = computeProfitability(makeBundle({ orders: [order], items, products }));
  assert.equal(r.costCoverageOverall, 0.5);
  assert.equal(r.missingCostProducts[0].id, 2);
  assert.equal(r.degraded, true);
});
