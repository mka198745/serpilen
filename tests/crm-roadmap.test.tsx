import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CrmRoadmap } from "../src/components/admin/CrmRoadmap";
import { CrmLatestUpdate } from "../src/components/admin/CrmLatestUpdate";
import { CrmDemoNotice, isCrmPreviewDemo } from "../src/components/admin/CrmDemoNotice";
import { CrmCustomerSegmentFilters, emptySegmentFilters } from "../src/components/admin/CrmCustomerSegmentFilters";
import { CrmDuplicateReview } from "../src/components/admin/CrmDuplicateReview";
import { CrmMergeComparison } from "../src/components/admin/CrmMergePreview";
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
  const html = renderToStaticMarkup(<CrmCustomerNotes customerId={1} initialNotes={[{ id: 1, body: "<script>alert(1)</script>", createdByName: "Personel", createdAt: 1700000000, revision: 1, updatedByName: null, updatedAt: null }]} />);
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
  const notes = renderToStaticMarkup(<CrmCustomerNotes customerId={1} initialNotes={[{ id: 1, body: "Salt not", createdByName: "Personel", createdAt: 1700000000, revision: 1, updatedAt: null, updatedByName: null }]} canWrite={false} />);
  const edit = renderToStaticMarkup(<CrmCustomerEdit customer={{ id: 1, name: "Test", phone: "5551234567", email: null, city: null }} canWrite={false} editVersion="x" onSaved={() => {}} />);
  assert.match(tags, /Deneme/);
  assert.doesNotMatch(tags, /Etiket ekle|etiketini kaldır/);
  assert.doesNotMatch(notes, /Not ekle|notu düzenle|>Düzenle</);
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
  assert.match(html, /value="NOTE_UPDATED"/);
  assert.match(html, /UTC gün sınırlarına/);
  assert.match(html, /Müşteri zaman çizelgesi/);
  assert.match(html, /İade kayıtları/);
  assert.match(html, /Sadakat puan hareketleri/);
  assert.match(html, /Filtreleri temizle/);
  assert.match(html, /crm-timeline/);
});

test("Panel son geliştirmenin ne olduğunu ve yerini açıklar", () => {
  const html = renderToStaticMarkup(<CrmLatestUpdate />);
  assert.match(html, /Son geliştirme · Sipariş kanalı filtresi/);
  assert.match(html, /Online, POS, her ikisi, diğer kanal veya hiç bağlı siparişi olmayan kartları/);
  assert.match(html, /bağlantısız misafir siparişleri dahil değildir/);
});

test("Demo uyarısı yalnız özel işaretli kartlarda gösterilmek için eşleşir", () => {
  assert.equal(isCrmPreviewDemo({name:"[DEMO CRM] Deniz Örnek",email:"crm.demo.onizleme@example.test"}), true);
  assert.equal(isCrmPreviewDemo({name:"Gerçek Müşteri",email:"crm.demo.onizleme@example.test"}), false);
  assert.equal(isCrmPreviewDemo({name:"[DEMO CRM] Başka",email:"baska@example.test"}), false);
  const html=renderToStaticMarkup(<CrmDemoNotice />);
  assert.match(html,/gerçek ödeme, kargo veya stok hareketi değildir/);
  assert.match(html,/özet ve raporlarına örnek tutar olarak yansıyabilir/);
});

test("Şehir ve müşteri kayıt tarihi filtreleri panelde bulunur", () => {
  const html=renderToStaticMarkup(<CrmCustomerSegmentFilters draft={emptySegmentFilters} onChange={()=>{}} onApply={()=>{}} onClear={()=>{}} error="" />);
  assert.match(html, /Şehir ve müşteri kayıt tarihi/);
  assert.match(html, /crm-city-filter/);
  assert.match(html, /crm-created-from/);
  assert.match(html, /crm-created-to/);
  assert.match(html, /crm-last-paid-from/);
  assert.match(html, /crm-last-paid-to/);
  assert.match(html, /ödeme tarihi değildir/);
  assert.match(html, /büyük\/küçük harfe duyarlı/);
  assert.match(html, /UTC gün sınırlarına/);
});

test("Aday değerlendirmesi birleştirme yapmadığını ve alan sınırlarını gösterir", () => {
  const html = renderToStaticMarkup(<CrmDuplicateReview customerId={1} targetId={2} versions={{source:"a".repeat(64),target:"b".repeat(64)}} review={{status:"DISTINCT",revision:1,reviewedByName:"<Personel>",reviewedAt:1700000000,stale:true}} onSaved={()=>{}} onBusyChange={()=>{}} />);
  assert.match(html, /birleştirme yapmaz/);
  assert.match(html, /Kart alanları değişmiş; yeniden inceleyin/);
  assert.match(html, /&lt;Personel&gt;/);
  assert.match(html, /Siparişler, üyelikler ve dış kaynaklardaki değişiklikler/);
});


test("Bağlantı incelemesi çakışmaları gösterir, birleştirmeye uygunluk iddia etmez", () => {
  const html=renderToStaticMarkup(<CrmMergeComparison comparison={{sharedTags:2,sharedRfmPeriods:1}} sourceAccounts={1} targetAccounts={1} />);
  assert.match(html,/ortak etiketi: <strong>2/);
  assert.match(html,/Ortak RFM dönemi: <strong>1/);
  assert.match(html,/giriş hesapları kendiliğinden birleştirilemez/);
  assert.match(html,/birleştirme onayı veya tüm risklerin eksiksiz kontrolü değildir/);
  const noOverlap=renderToStaticMarkup(<CrmMergeComparison comparison={{sharedTags:0,sharedRfmPeriods:0}} sourceAccounts={1} targetAccounts={0} />);
  assert.doesNotMatch(noOverlap,/Her iki kartta bağlı hesap var|tekrarları ele alan|Aynı döneme ait RFM kayıtları/);
  assert.match(noOverlap,/tüm risklerin eksiksiz kontrolü değildir/);
});
