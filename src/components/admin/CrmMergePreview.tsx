"use client";

import React, { useState } from "react";
import { authFetch } from "@/lib/client-auth";
import { CrmDuplicateCandidates } from "./CrmDuplicateCandidates";
import { CrmDuplicateReview, type DuplicateReview } from "./CrmDuplicateReview";
import { CrmDuplicateReviewHistory } from "./CrmDuplicateReviewHistory";

type Card = { customer: { id: number; name: string; email: string | null; phone: string; companyName: string | null; balance: string | number | null; loyaltyPoints: number; isBlocked: number }; counts: { accounts: number; orders: number; orderItems?: number; orderStatusEvents?: number; returns?: number; returnItems?: number; mismatchedLoyaltyOrders?: number; foreignLoyaltyForOrders?: number; legacyNotePresent?: number; accountTransactions: number; loyaltyTransactions: number; notes: number; editedNotes?: number; tags: number; rfmScores: number; duplicateReviews?: number } };
type Comparison = { sharedTags: number; sharedRfmPeriods: number; fieldConflicts?: string[] };
const conflictLabels: Record<string, string> = { type: "Müşteri tipi", taxOffice: "Vergi dairesi", taxNumber: "Vergi numarası", creditLimit: "Kredi limiti", discountRate: "İskonto oranı", segment: "Segment", approvalStatus: "Onay durumu", blocked: "Engel durumu", balance: "Cari bakiye", loyaltyPoints: "Sadakat puanı" };
type Preview = { source: Card; target: Card; comparison?: Comparison; versions: { source: string; target: string }; review: DuplicateReview | null };

export function CrmMergeComparison({ comparison, sourceAccounts, targetAccounts }: { comparison: Comparison; sourceAccounts: number; targetAccounts: number }) {
  return <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2 text-xs text-amber-950">
    <h4 className="font-bold text-sm">Bağlantı ve çakışma incelemesi</h4>
    <p>İki kartın ortak etiketi: <strong>{comparison.sharedTags}</strong> · Ortak RFM dönemi: <strong>{comparison.sharedRfmPeriods}</strong>.</p>
    {comparison.sharedTags > 0 && <p>Ortak etiket atamaları için tekrarları ele alan bir politika gerekir.</p>}
    {comparison.sharedRfmPeriods > 0 && <p>Aynı döneme ait RFM kayıtları iki kartta da var; hangi sonucun korunacağı veya yeniden hesaplanacağı belirlenmedi.</p>}
    {sourceAccounts > 0 && targetAccounts > 0 && <p>Her iki kartta bağlı hesap var; giriş hesapları kendiliğinden birleştirilemez.</p>}
    {comparison.fieldConflicts ? <p>Farklı olan kart alanları: <strong>{comparison.fieldConflicts.length ? comparison.fieldConflicts.map(key => conflictLabels[key] || "Diğer alan").join(", ") : "Bu kontrolde fark bulunmadı"}</strong>. Boş ve farklı biçimde kayıtlı değerler de farklı sayılabilir; gizli alanların değerleri gösterilmez.</p> : <p>Kart alanı farkları kullanılamıyor; yeniden karşılaştırın.</p>}
    <p>Bu bilgiler yalnız doğrudan bağlı kayıtlara ait anlık sayımlardır; kimlik kanıtı, birleştirme onayı veya tüm risklerin eksiksiz kontrolü değildir. Değişikliklerden sonra güncel sayılar için yeniden karşılaştırın.</p>
  </div>;
}
const amount = (value: string | number | null) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(Number(value) || 0);

export function CrmMergePreview({ customerId }: { customerId: number }) {
  const [target, setTarget] = useState("");
  const [data, setData] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const chooseTarget = (id: number) => { setTarget(String(id)); setData(null); setError(""); };
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || reviewBusy) return;
    if (!/^[1-9]\d{0,14}$/.test(target) || !Number.isSafeInteger(Number(target)) || Number(target) === customerId) { setData(null); setError("Farklı bir müşteri numarası girin."); return; }
    setBusy(true); setError(""); setData(null);
    try {
      const response = await authFetch(`/api/crm/customers/${customerId}/merge-preview?${new URLSearchParams({ target })}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(typeof json.error === "string" ? json.error : "Ön inceleme yüklenemedi.");
      setData({ ...json.data, versions: json.versions, review: json.review });
    } catch (err) { setError(err instanceof Error ? err.message : "Ön inceleme yüklenemedi."); }
    finally { setBusy(false); }
  }
  return <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm space-y-3"><div><h3 className="font-bold text-stone-900">Birleştirme ön incelemesi</h3><p className="text-xs text-stone-500 mt-1">İki müşteri kartını ve bağlı kayıt sayılarını karşılaştırır. <strong>Birleştirme yapmaz veya müşteri kayıtlarını değiştirmez.</strong> İnceleme denetim kaydına yazılır.</p></div>
    <CrmDuplicateCandidates customerId={customerId} disabled={busy || reviewBusy} onChoose={chooseTarget} />
    <CrmDuplicateReviewHistory customerId={customerId} disabled={busy || reviewBusy} refresh={historyRefresh} onChoose={chooseTarget} />
    <form onSubmit={submit} className="flex flex-wrap gap-2 items-end"><label className="text-xs font-bold text-stone-700">Karşılaştırılacak müşteri numarası<input inputMode="numeric" disabled={busy || reviewBusy} value={target} onChange={e => { setTarget(e.target.value); setData(null); }} maxLength={15} placeholder="Örn. 25" className="mt-1 block rounded-xl border border-stone-300 px-3 py-2 text-sm font-normal"/></label><button disabled={busy || reviewBusy} className="rounded-xl border border-stone-200 px-3 py-2 text-xs font-bold disabled:opacity-40">{busy ? "İnceleniyor…" : "Karşılaştır"}</button></form>
    {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
    {data && <><div className="grid gap-3 sm:grid-cols-2">{([['Mevcut kart', data.source], ['Karşılaştırılan kart', data.target]] as const).map(([label, row]) => <div key={label} className="rounded-xl border border-stone-200 bg-stone-50 p-3"><h4 className="text-xs font-black text-amber-800">{label} · #{row.customer.id}</h4><p className="font-bold text-sm mt-1 break-words">{row.customer.name}</p><p className="text-xs text-stone-500 break-words">{row.customer.email || "E-posta yok"} · {row.customer.phone || "Telefon yok"}</p>{row.customer.companyName && <p className="text-xs text-stone-500 mt-1">{row.customer.companyName}</p>}<dl className="grid grid-cols-2 gap-2 mt-3 text-xs">{([['Üyelik',row.counts.accounts],['Sipariş',row.counts.orders],['Sipariş ürün satırı',row.counts.orderItems ?? '—'],['Sipariş durum kaydı',row.counts.orderStatusEvents ?? '—'],['İade',row.counts.returns ?? '—'],['İade ürün satırı',row.counts.returnItems ?? '—'],['Uyuşmayan puan-sipariş',row.counts.mismatchedLoyaltyOrders ?? '—'],['Başka karta ait puan',row.counts.foreignLoyaltyForOrders ?? '—'],['Eski kart notu',row.counts.legacyNotePresent == null ? '—' : row.counts.legacyNotePresent ? 'Var' : 'Yok'],['Cari hareket',row.counts.accountTransactions],['Sadakat işlemi',row.counts.loyaltyTransactions],['Not',row.counts.notes],['Düzenlenmiş not',row.counts.editedNotes ?? '—'],['Aday değerlendirmesi',row.counts.duplicateReviews ?? '—'],['Etiket',row.counts.tags],['RFM kaydı',row.counts.rfmScores],['Sadakat puanı',row.customer.loyaltyPoints],['Cari bakiye',amount(row.customer.balance)],['Engelli',row.customer.isBlocked ? 'Evet' : 'Hayır']] as const).map(([key,value])=><div key={key}><dt className="text-stone-500">{key}</dt><dd className="font-bold text-stone-900">{value}</dd></div>)}</dl></div>)}</div>{data.comparison ? <CrmMergeComparison comparison={data.comparison} sourceAccounts={data.source.counts.accounts} targetAccounts={data.target.counts.accounts} /> : <p className="text-xs text-amber-900">Çakışma sayıları kullanılamıyor; sayfayı yenileyip tekrar deneyin.</p>}<p className="text-xs text-stone-500">Sipariş durum, ürün ve iade sayıları yalnız karta bağlı siparişleri izler. Uyuşmayan puan-sipariş, karta ait puan hareketinin başka karta, misafire veya bulunamayan siparişe işaret etmesidir. Başka karta ait puan, bu kartın siparişine bağlanmış farklı bir müşteri hareketidir. Aynı çakışma iki kartta sayılabilir. Eski kart notunun yalnız varlığı gösterilir. Aday değerlendirmesi sayıları her karta bağlı tüm çiftleri içerir; aynı çift iki kartta da sayılabilir.</p>{data.versions && <CrmDuplicateReview key={`${customerId}-${data.target.customer.id}`} customerId={customerId} targetId={data.target.customer.id} versions={data.versions} review={data.review} onBusyChange={setReviewBusy} onSaved={review => { setData(previous => previous ? { ...previous, review } : previous); setHistoryRefresh(value => value + 1); }} />}{([data.source, data.target].some(row => (row.counts.mismatchedLoyaltyOrders ?? 0) > 0 || (row.counts.foreignLoyaltyForOrders ?? 0) > 0)) && <p role="alert" className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-xl p-3">Puan hareketi ve sipariş bağlantılarında uyuşmazlık var. Kayıtlar otomatik düzeltilmez; ayrıca incelenmelidir.</p>}<p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3">Birleştirme işlemi henüz kullanıma açık değil. Üyelikler, cari bakiye, sadakat ve farklı kayıt bağlantıları ayrıca güvenle ele alınmalıdır. E-posta veya telefon üzerinden bağlantısız mesajlar ve misafir siparişleri bu sayılara dahil değildir.</p></>}
  </section>;
}
