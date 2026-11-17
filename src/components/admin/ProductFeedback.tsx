"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, EyeOff, MessageCircle, MessageSquareQuote, RefreshCw, Send, Trash2 } from "lucide-react";
import { authFetch } from "@/lib/client-auth";

type ProductRef = { id: number; name: string; slug: string } | null;
interface Review {
  id: number; productId: number; product: ProductRef; customerName: string; customerEmail: string | null;
  rating: number; title: string | null; comment: string; status: string; createdAt: string; verifiedPurchase: boolean;
}
interface Question {
  id: number; productId: number; product: ProductRef; askerName: string; question: string; answer: string | null;
  status: string; createdAt: string;
}

type Tab = "reviews" | "questions";
const labels: Record<string, string> = {
  PENDING: "Onay bekliyor", OPEN: "Onay bekliyor", APPROVED: "Yayında", ANSWERED: "Yanıtlandı", REJECTED: "Reddedildi", HIDDEN: "Gizlendi",
};
function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
}
function errorText(data: { error?: string | { message?: string } }, fallback: string) {
  return typeof data.error === "string" ? data.error : data.error?.message || fallback;
}

export function ProductFeedback() {
  const [tab, setTab] = useState<Tab>("reviews");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [filter, setFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    try {
      const [reviewResponse, questionResponse] = await Promise.all([
        authFetch("/api/reviews?all=1", { cache: "no-store" }),
        authFetch("/api/questions?all=1", { cache: "no-store" }),
      ]);
      const [reviewData, questionData] = await Promise.all([reviewResponse.json(), questionResponse.json()]);
      if (!reviewResponse.ok || !reviewData.success) throw new Error(errorText(reviewData, "Yorumlar yüklenemedi."));
      if (!questionResponse.ok || !questionData.success) throw new Error(errorText(questionData, "Sorular yüklenemedi."));
      setReviews(reviewData.data);
      setQuestions(questionData.data);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıtlar yüklenemedi.");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const visibleReviews = useMemo(() => reviews.filter((row) => filter === "ALL" || row.status === filter), [reviews, filter]);
  const visibleQuestions = useMemo(() => questions.filter((row) => filter === "ALL" || row.status === filter), [questions, filter]);

  async function change(kind: Tab, id: number, action: string, extra: Record<string, string> = {}) {
    if (busy) return;
    if (action === "DELETE" && !window.confirm("Bu kayıt kalıcı olarak silinsin mi?")) return;
    const endpoint = kind === "reviews" ? "/api/reviews" : "/api/questions";
    setBusy(`${kind}-${id}`);
    setError(null);
    setMessage(null);
    try {
      const res = await authFetch(action === "DELETE" ? `${endpoint}?id=${id}` : endpoint, {
        method: action === "DELETE" ? "DELETE" : "POST",
        ...(action === "DELETE" ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action, ...extra }) }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(errorText(data, "İşlem tamamlanamadı."));
      if (action === "ANSWER") setDrafts((prev) => { const next = { ...prev }; delete next[id]; return next; });
      setLoading(true);
      if (await load()) setMessage(action === "DELETE" ? "Kayıt silindi." : "Kayıt güncellendi.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "İşlem tamamlanamadı.");
    } finally {
      setBusy(null);
    }
  }

  const button = "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition disabled:opacity-50 disabled:cursor-not-allowed";
  const filters = tab === "reviews"
    ? [["ALL", "Tümü"], ["PENDING", "Onay bekliyor"], ["APPROVED", "Yayında"], ["REJECTED", "Reddedildi"]]
    : [["ALL", "Tümü"], ["OPEN", "Onay bekliyor"], ["APPROVED", "Yayında"], ["ANSWERED", "Yanıtlandı"], ["HIDDEN", "Gizlendi"]];

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-stone-200 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-stone-900">Ürün Yorumları &amp; Soruları</h2>
          <p className="text-xs text-stone-500 mt-1">Ürün değerlendirmelerini ve soruları inceleyin, yayınlayın veya silin. Soruya yanıt vermek soruyu da yayınlar.</p>
        </div>
        <button type="button" onClick={() => { setLoading(true); setError(null); void load(); }} disabled={loading || !!busy} className={`${button} bg-stone-100 hover:bg-stone-200 text-stone-700`}><RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Yenile</button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => { setTab("reviews"); setFilter("ALL"); }} className={`${button} ${tab === "reviews" ? "bg-amber-800 text-white" : "bg-white text-stone-700 border border-stone-200"}`}><MessageSquareQuote className="w-4 h-4" /> Yorumlar ({reviews.length})</button>
        <button type="button" onClick={() => { setTab("questions"); setFilter("ALL"); }} className={`${button} ${tab === "questions" ? "bg-amber-800 text-white" : "bg-white text-stone-700 border border-stone-200"}`}><MessageCircle className="w-4 h-4" /> Sorular ({questions.length})</button>
      </div>
      <div className="flex flex-wrap gap-2">
        {filters.map(([key, label]) => <button key={key} type="button" onClick={() => setFilter(key)} className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${filter === key ? "border-amber-700 bg-amber-50 text-amber-900" : "border-stone-200 bg-white text-stone-600"}`}>{label}</button>)}
      </div>
      {error && <p role="alert" className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">{error}</p>}
      {message && <p role="status" className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800">{message}</p>}
      {loading ? <div className="bg-white rounded-2xl border border-stone-200 p-8 text-center text-sm text-stone-500">Kayıtlar yükleniyor…</div> : (
        <div className="space-y-3">
          {tab === "reviews" && visibleReviews.map((row) => (
            <article key={row.id} className="bg-white rounded-2xl border border-stone-200 p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-bold text-stone-900">{row.customerName}</span>
                <span className="font-semibold text-amber-800">{row.rating} / 5 ★</span>
                <span className="rounded-full bg-stone-100 px-2 py-1 text-stone-600">{labels[row.status] || row.status}</span>
                <span className="text-stone-400">{dateLabel(row.createdAt)}</span>
                {row.verifiedPurchase && <span className="text-emerald-700">Doğrulanmış alıcı</span>}
              </div>
              <ProductLink product={row.product} productId={row.productId} />
              {row.title && <p className="font-bold text-sm text-stone-800">{row.title}</p>}
              <p className="text-sm text-stone-700 whitespace-pre-wrap break-words">{row.comment}</p>
              {row.customerEmail && <p className="text-xs text-stone-500">E-posta: {row.customerEmail}</p>}
              <div className="flex flex-wrap gap-2">
                {row.status !== "APPROVED" && <button type="button" disabled={!!busy} onClick={() => void change("reviews", row.id, "MODERATE", { status: "APPROVE" })} className={`${button} bg-emerald-50 text-emerald-800 hover:bg-emerald-100`}><Check className="w-4 h-4" /> Onayla ve yayınla</button>}
                {row.status !== "REJECTED" && <button type="button" disabled={!!busy} onClick={() => void change("reviews", row.id, "MODERATE", { status: "REJECT" })} className={`${button} bg-stone-100 text-stone-700 hover:bg-stone-200`}><EyeOff className="w-4 h-4" /> Reddet / yayından kaldır</button>}
                <button type="button" disabled={!!busy} onClick={() => void change("reviews", row.id, "DELETE")} className={`${button} bg-rose-50 text-rose-700 hover:bg-rose-100`}><Trash2 className="w-4 h-4" /> Sil</button>
              </div>
            </article>
          ))}
          {tab === "questions" && visibleQuestions.map((row) => (
            <article key={row.id} className="bg-white rounded-2xl border border-stone-200 p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-bold text-stone-900">{row.askerName}</span>
                <span className="rounded-full bg-stone-100 px-2 py-1 text-stone-600">{labels[row.status] || row.status}</span>
                <span className="text-stone-400">{dateLabel(row.createdAt)}</span>
              </div>
              <ProductLink product={row.product} productId={row.productId} />
              <p className="text-sm text-stone-700 whitespace-pre-wrap break-words">{row.question}</p>
              {row.answer && <p className="text-xs text-amber-900 bg-amber-50 rounded-xl p-3 whitespace-pre-wrap break-words"><strong>Mevcut yanıt:</strong> {row.answer}</p>}
              <label className="block text-xs font-semibold text-stone-700" htmlFor={`question-answer-${row.id}`}>Yanıt</label>
              <textarea id={`question-answer-${row.id}`} maxLength={1200} rows={3} value={drafts[row.id] ?? row.answer ?? ""} onChange={(e) => setDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))} placeholder="Ürün sorusunu yanıtlayın…" className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm" />
              <div className="flex flex-wrap gap-2">
                {row.status !== "APPROVED" && row.status !== "ANSWERED" && <button type="button" disabled={!!busy} onClick={() => void change("questions", row.id, "APPROVE")} className={`${button} bg-emerald-50 text-emerald-800 hover:bg-emerald-100`}><Check className="w-4 h-4" /> Onayla ve yayınla</button>}
                <button type="button" disabled={!!busy || !(drafts[row.id] ?? row.answer ?? "").trim()} onClick={() => void change("questions", row.id, "ANSWER", { answer: drafts[row.id] ?? row.answer ?? "" })} className={`${button} bg-amber-800 text-white hover:bg-amber-900`}><Send className="w-4 h-4" /> Yanıtla ve yayınla</button>
                {row.status !== "HIDDEN" && <button type="button" disabled={!!busy} onClick={() => void change("questions", row.id, "HIDE")} className={`${button} bg-stone-100 text-stone-700 hover:bg-stone-200`}><EyeOff className="w-4 h-4" /> Gizle</button>}
                <button type="button" disabled={!!busy} onClick={() => void change("questions", row.id, "DELETE")} className={`${button} bg-rose-50 text-rose-700 hover:bg-rose-100`}><Trash2 className="w-4 h-4" /> Sil</button>
              </div>
            </article>
          ))}
          {((tab === "reviews" && visibleReviews.length === 0) || (tab === "questions" && visibleQuestions.length === 0)) && <div className="bg-white rounded-2xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-500">Bu filtrede kayıt bulunmuyor.</div>}
        </div>
      )}
    </div>
  );
}

function ProductLink({ product, productId }: { product: ProductRef; productId: number }) {
  return product ? <Link href={`/urun/${product.slug}`} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-amber-800 hover:underline">Ürün: {product.name} ↗</Link> : <p className="text-xs text-stone-500">Ürün bulunamadı (ID: {productId})</p>;
}
