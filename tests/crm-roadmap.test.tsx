import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CrmRoadmap } from "../src/components/admin/CrmRoadmap";
import { CrmCustomerNotes } from "../src/components/admin/CrmCustomerNotes";
import { CrmCustomerEdit } from "../src/components/admin/CrmCustomerEdit";
import { CrmTimeline } from "../src/components/admin/CrmTimeline";
import { CrmTimelineExplorer } from "../src/components/admin/CrmTimelineExplorer";
import { CrmCustomerTags } from "../src/components/admin/CrmCustomerTags";
import { CrmCustomerCreate } from "../src/components/admin/CrmCustomerCreate";

test("CRM yol haritası gerçek durumu ve tüm aşamaları gösterir", () => {
  const html = renderToStaticMarkup(<CrmRoadmap />);
  assert.match(html, /Kodlamaya başlandı/);
  assert.match(html, /Faz 1 kısmen hazır/);
  for (const phase of ["Faz 1", "Faz 2", "Faz 3", "Faz 4", "Faz 5"]) assert.ok(html.includes(phase));
  assert.match(html, /Planlandı · Başlanmadı/);
  assert.match(html, /Müşteri özeti, oluşturma, arama, sayfalama ve düzenleme/);
  assert.match(html, /filtreli zaman çizelgesi/);
});

test("Not içeriği HTML olarak çalıştırılmadan gösterilir", () => {
  const html = renderToStaticMarkup(<CrmCustomerNotes customerId={1} initialNotes={[{ id: 1, body: "<script>alert(1)</script>", createdByName: "Personel", createdAt: 1700000000 }]} />);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /Not ekle/);
});

test("Müşteri düzenleme ayrımı ve zaman çizelgesi mevcut verileri doğru açıklar", () => {
  const customer = { id: 1, name: "Deniz", phone: "5551234567", email: null, city: null };
  const editHtml = renderToStaticMarkup(<CrmCustomerEdit customer={customer} editVersion="x" onSaved={() => {}} />);
  assert.match(editHtml, /üye giriş hesabını ve eski sipariş bilgilerini değiştirmez/);
  assert.match(editHtml, /Düzenle/);
  const timelineHtml = renderToStaticMarkup(<CrmTimeline events={[{ kind: "ORDER_STATUS", eventId: 1, occurredAt: 1700000000, orderNumber: "#X", channel: "POS", actor: "Personel", fromStatus: "PAID", toStatus: "SHIPPED" }]} />);
  assert.match(timelineHtml, /PAID → SHIPPED/);
  assert.match(timelineHtml, /Misafir siparişleri ve kaydedilmemiş hareketler gösterilmez/);
});

test("Salt okunur CRM'de değiştirme kontrolleri gösterilmez", () => {
  const tags = renderToStaticMarkup(<CrmCustomerTags customerId={1} initialTags={[{ id: 1, name: "Deneme" }]} canWrite={false} />);
  const notes = renderToStaticMarkup(<CrmCustomerNotes customerId={1} initialNotes={[]} canWrite={false} />);
  const edit = renderToStaticMarkup(<CrmCustomerEdit customer={{ id: 1, name: "Test", phone: "5551234567", email: null, city: null }} canWrite={false} editVersion="x" onSaved={() => {}} />);
  assert.match(tags, /Deneme/);
  assert.doesNotMatch(tags, /Etiket ekle|etiketini kaldır/);
  assert.doesNotMatch(notes, /Not ekle/);
  assert.doesNotMatch(edit, /Düzenle/);
  assert.match(renderToStaticMarkup(<CrmCustomerCreate onCreated={() => {}} />), /Müşteri ekle/);
});

test("İade ve sadakat hareketleri kaynak alanlarını güvenli ve açık gösterir", () => {
  const events = [
    { kind: "RETURN_CREATED" as const, eventId: 1, occurredAt: 1735689600, orderNumber: "A-1", channel: "ONLINE_B2C", actor: "Personel", fromStatus: null, toStatus: null, returnNumber: "IAD-1", returnStatus: "REFUNDED" },
    { kind: "LOYALTY_TRANSACTION" as const, eventId: 2, occurredAt: 1735689600, orderNumber: null, channel: null, actor: null, fromStatus: null, toStatus: null, loyaltyType: "<script>", points: -40 },
  ];
  const html = renderToStaticMarkup(<CrmTimeline events={events} />);
  assert.match(html, /Güncel durum: REFUNDED/);
  assert.match(html, /ödeme sağlayıcısı iadesi değildir/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /-40 puan/);
});

test("Zaman çizelgesi iade ve sadakat türleriyle filtrelenebilir", () => {
  const html = renderToStaticMarkup(<CrmTimelineExplorer customerId={1} refresh={0} />);
  assert.match(html, /value="RETURN_CREATED"/);
  assert.match(html, /value="LOYALTY_TRANSACTION"/);
  assert.match(html, /UTC gün sınırlarına/);
});
