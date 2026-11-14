"use client";

import React, { useEffect, useState } from "react";
import { Star, MessageSquareQuote, BadgeCheck, Send, HelpCircle } from "lucide-react";

interface Review {
  id: number;
  customerName: string;
  rating: number;
  title: string | null;
  comment: string;
  verifiedPurchase: boolean;
  createdAt: string;
}

interface Question {
  id: number;
  askerName: string;
  question: string;
  answer: string | null;
  answeredBy: string | null;
  status: string;
  createdAt: string;
}

function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={i <= Math.round(value) ? "fill-amber-400 text-amber-400" : "text-stone-300"}
          style={{ width: size, height: size }}
        />
      ))}
    </span>
  );
}

export function ReviewsQA({ productId }: { productId: number }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [stats, setStats] = useState<{ count: number; avg: number; distribution: { star: number; count: number }[] } | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [tab, setTab] = useState<"reviews" | "qa">("reviews");

  // review form
  const [showForm, setShowForm] = useState(false);
  const [rForm, setRForm] = useState({ customerName: "", customerEmail: "", rating: 5, title: "", comment: "" });
  const [rBusy, setRBusy] = useState(false);
  const [rMsg, setRMsg] = useState<string | null>(null);

  // question form
  const [showQ, setShowQ] = useState(false);
  const [qForm, setQForm] = useState({ askerName: "", question: "" });
  const [qBusy, setQBusy] = useState(false);
  const [qMsg, setQMsg] = useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const [rv, qs] = await Promise.all([
        fetch(`/api/reviews?productId=${productId}`, { cache: "no-store" }).then((r) => r.json()),
        fetch(`/api/questions?productId=${productId}`, { cache: "no-store" }).then((r) => r.json()),
      ]);
      if (rv?.success) {
        setReviews(rv.data || []);
        setStats(rv.stats || null);
      }
      if (qs?.success) setQuestions(qs.data || []);
    } catch {
      /* sessiz */
    }
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    setRBusy(true);
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, ...rForm }),
    }).then((r) => r.json());
    setRBusy(false);
    if (res.success) {
      setRMsg(res.message || "Yorumunuz alındı.");
      setRForm({ customerName: "", customerEmail: "", rating: 5, title: "", comment: "" });
      setShowForm(false);
      void load();
    } else {
      setRMsg(res.error || "Yorum gönderilemedi.");
    }
  };

  const submitQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setQBusy(true);
    const res = await fetch("/api/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, ...qForm }),
    }).then((r) => r.json());
    setQBusy(false);
    if (res.success) {
      setQMsg(res.message || "Sorunuz iletildi.");
      setQForm({ askerName: "", question: "" });
      setShowQ(false);
      void load();
    }
  };

  const maxDist = stats?.distribution ? Math.max(...stats.distribution.map((d) => d.count), 1) : 1;

  return (
    <div className="bg-white rounded-3xl border border-stone-200 shadow-xs overflow-hidden">
      <div className="flex border-b border-stone-100 text-sm font-semibold">
        <button
          onClick={() => setTab("reviews")}
          className={`px-6 py-3.5 border-b-2 flex items-center gap-1.5 transition ${tab === "reviews" ? "border-amber-800 text-amber-900" : "border-transparent text-stone-500 hover:text-stone-800"}`}
        >
          <Star className="w-4 h-4" /> Değerlendirmeler ({stats?.count ?? 0})
        </button>
        <button
          onClick={() => setTab("qa")}
          className={`px-6 py-3.5 border-b-2 flex items-center gap-1.5 transition ${tab === "qa" ? "border-amber-800 text-amber-900" : "border-transparent text-stone-500 hover:text-stone-800"}`}
        >
          <HelpCircle className="w-4 h-4" /> Soru & Cevap ({questions.length})
        </button>
      </div>

      {tab === "reviews" && (
        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Özet */}
          <div className="space-y-3">
            <div className="text-center p-4 bg-amber-50 rounded-2xl border border-amber-100">
              <div className="text-4xl font-black text-amber-900">{stats?.avg ?? "—"}</div>
              <div className="flex justify-center py-1">
                <Stars value={stats?.avg ?? 0} size={20} />
              </div>
              <p className="text-xs text-stone-500">{stats?.count ?? 0} değerlendirme</p>
            </div>
            {stats && stats.count > 0 && (
              <div className="space-y-1">
                {stats.distribution.map((d) => (
                  <div key={d.star} className="flex items-center gap-2 text-[11px] text-stone-600">
                    <span className="w-8">{d.star} ★</span>
                    <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500 rounded-full" style={{ width: `${(d.count / maxDist) * 100}%` }} />
                    </div>
                    <span className="w-6 text-right">{d.count}</span>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowForm((v) => !v)}
              className="w-full py-2.5 bg-amber-800 hover:bg-amber-900 text-white text-xs font-bold rounded-xl transition"
            >
              {showForm ? "Formu Kapat" : "Yorum Yaz"}
            </button>
          </div>

          {/* Liste / Form */}
          <div className="md:col-span-2 space-y-3">
            {showForm && (
              <form onSubmit={submitReview} className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-2.5 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <input required placeholder="Adınız Soyadınız" value={rForm.customerName} onChange={(e) => setRForm({ ...rForm, customerName: e.target.value })} className="px-3 py-2 border border-stone-300 rounded-xl" />
                  <input type="email" placeholder="E-posta (doğrulanmış alıcı için)" value={rForm.customerEmail} onChange={(e) => setRForm({ ...rForm, customerEmail: e.target.value })} className="px-3 py-2 border border-stone-300 rounded-xl" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-stone-700">Puanınız:</span>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <button key={i} type="button" onClick={() => setRForm({ ...rForm, rating: i })} aria-label={`${i} yıldız`}>
                      <Star className={`w-5 h-5 ${i <= rForm.rating ? "fill-amber-400 text-amber-400" : "text-stone-300"}`} />
                    </button>
                  ))}
                </div>
                <input placeholder="Başlık (opsiyonel)" value={rForm.title} onChange={(e) => setRForm({ ...rForm, title: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-xl" />
                <textarea required rows={3} placeholder="Deneyiminizi paylaşın…" value={rForm.comment} onChange={(e) => setRForm({ ...rForm, comment: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-xl" />
                <button type="submit" disabled={rBusy} className="px-4 py-2 bg-stone-900 text-white font-bold rounded-xl disabled:opacity-60">
                  {rBusy ? "Gönderiliyor…" : "Yorumu Gönder"}
                </button>
                <p className="text-[10px] text-stone-400">Yorumlar moderasyon onayıyla yayınlanır.</p>
              </form>
            )}
            {rMsg && <p className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">{rMsg}</p>}

            {reviews.length === 0 && !showForm && <p className="text-xs text-stone-400 text-center py-6">Bu ürün için henüz onaylı yorum yok. İlk yorumu siz yazın!</p>}
            {reviews.map((r) => (
              <article key={r.id} className="p-4 rounded-2xl border border-stone-200 space-y-1.5">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-stone-900">{r.customerName}</span>
                    {r.verifiedPurchase && (
                      <span className="flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-200">
                        <BadgeCheck className="w-3 h-3" /> Doğrulanmış Alıcı
                      </span>
                    )}
                  </div>
                  <Stars value={r.rating} />
                </div>
                {r.title && <h5 className="font-bold text-xs text-stone-800">{r.title}</h5>}
                <p className="text-xs text-stone-600 leading-relaxed">{r.comment}</p>
                <p className="text-[10px] text-stone-400">{new Date(r.createdAt).toLocaleDateString("tr-TR")}</p>
              </article>
            ))}
          </div>
        </div>
      )}

      {tab === "qa" && (
        <div className="p-6 space-y-3">
          {showQ && (
            <form onSubmit={submitQuestion} className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-2.5 text-xs">
              <input required placeholder="Adınız" value={qForm.askerName} onChange={(e) => setQForm({ ...qForm, askerName: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-xl" />
              <textarea required rows={2} placeholder="Ürün hakkında sorunuzu yazın (örn: Bu kumaşla uyumlu mu?)" value={qForm.question} onChange={(e) => setQForm({ ...qForm, question: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-xl" />
              <button type="submit" disabled={qBusy} className="px-4 py-2 bg-stone-900 text-white font-bold rounded-xl flex items-center gap-1.5 disabled:opacity-60">
                <Send className="w-3.5 h-3.5" /> {qBusy ? "Gönderiliyor…" : "Soruyu Gönder"}
              </button>
            </form>
          )}
          {qMsg && <p className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">{qMsg}</p>}

          {questions.length === 0 && !showQ && (
            <p className="text-xs text-stone-400 text-center py-4">Henüz soru yok.</p>
          )}
          {questions.map((q) => (
            <div key={q.id} className="p-4 rounded-2xl border border-stone-200 space-y-2">
              <div className="flex items-center gap-2 text-xs">
                <MessageSquareQuote className="w-4 h-4 text-amber-800 shrink-0" />
                <span className="font-bold text-stone-800">{q.askerName}</span>
                <span className="text-[10px] text-stone-400">sordu · {new Date(q.createdAt).toLocaleDateString("tr-TR")}</span>
              </div>
              <p className="text-xs text-stone-700">{q.question}</p>
              {q.answer ? (
                <div className="bg-amber-50/70 border-l-4 border-amber-700 rounded-r-xl p-3">
                  <span className="text-[10px] font-black uppercase text-amber-900">Uzman Yanıtı</span>
                  <p className="text-xs text-stone-700 mt-0.5">{q.answer}</p>
                  <p className="text-[10px] text-stone-400 mt-1">{q.answeredBy}</p>
                </div>
              ) : (
                <p className="text-[11px] text-stone-400 italic">Bu soru henüz yanıtlanmadı.</p>
              )}
            </div>
          ))}

          {!showQ && (
            <button onClick={() => setShowQ(true)} className="w-full py-2.5 text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 rounded-xl transition">
              + Ürün Hakkında Soru Sor
            </button>
          )}
        </div>
      )}
    </div>
  );
}
