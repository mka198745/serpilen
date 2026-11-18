import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CrmRoadmap } from "../src/components/admin/CrmRoadmap";
import { CrmCustomerNotes } from "../src/components/admin/CrmCustomerNotes";

test("CRM yol haritası gerçek durumu ve tüm aşamaları gösterir", () => {
  const html = renderToStaticMarkup(<CrmRoadmap />);
  assert.match(html, /Kodlamaya başlandı/);
  assert.match(html, /Faz 1 kısmen hazır/);
  for (const phase of ["Faz 1", "Faz 2", "Faz 3", "Faz 4", "Faz 5"]) assert.ok(html.includes(phase));
  assert.match(html, /Planlandı · Başlanmadı/);
});

test("Not içeriği HTML olarak çalıştırılmadan gösterilir", () => {
  const html = renderToStaticMarkup(<CrmCustomerNotes customerId={1} initialNotes={[{ id: 1, body: "<script>alert(1)</script>", createdByName: "Personel", createdAt: 1700000000 }]} />);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /Not ekle/);
});
