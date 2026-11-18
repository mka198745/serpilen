import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminDashboardClient } from "../src/app/admin/AdminDashboardClient";

const base = {
  products: [], categories: [], brands: [], warehouses: [], inventory: [], ledger: [],
  orders: [], customers: [], suppliers: [], purchaseOrders: [], coupons: [], shifts: [],
};

test("İade / Yeni Müşteri kartında raporlara geçiş yok; yetkili yan menü korunur", () => {
  for (const role of ["SUPER_ADMIN", "CASHIER"]) {
    const html = renderToStaticMarkup(<AdminDashboardClient {...base} currentRole={role} />);
    assert.match(html, /İade \/ Yeni Müşteri/);
    assert.doesNotMatch(html, /Detaylı Raporlar/);
    if (role === "SUPER_ADMIN") assert.match(html, /Raporlar &amp; Analitik/);
    else assert.doesNotMatch(html, /Raporlar &amp; Analitik/);
  }
});
