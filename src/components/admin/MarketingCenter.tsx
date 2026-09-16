"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Megaphone,
  Ticket,
  Coins,
  Star,
  MessageSquareQuote,
  Plus,
  X,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  Send,
  BadgeCheck,
} from "lucide-react";

interface Props {
  categories: any[];
  brands: any[];
}

type SubTab = "promotions" | "coupons" | "loyalty" | "reviews" | "qa";

const RULE_OPTIONS = [
  { id: "PERCENT_CATEGORY", label: "Kategori %İndirim" },
  { id: "PERCENT_BRAND", label: "Marka %İndirim" },
  { id: "THRESHOLD_DISCOUNT", label: "Sepet Eşiği İndirimi (X TL üzeri Y TL)" },
  { id: "BUY_X_PAY_Y", label: "X Al Y Öde" },
  { id: "FREE_SHIPPING", label: "Ücretsiz Kargo" },
  { id: "BUNDLE_PERCENT", label: "Paket (Çoklu Adet) %İndirim" },
];

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-900",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-stone-200 text-stone-500",
  OPEN: "bg-sky-100 text-sky-800",
  ANSWERED: "bg-emerald-100 text-emerald-800",
  HIDDEN: "bg-stone-200 text-stone-500",
};

export function MarketingCenter({ categories, brands }: Props) {
  const [subTab, setSubTab] = useState<SubTab>("promotions");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; isError?: boolean } | null>(null);

  const [promotions, setPromotions] = useState<any[]>([]);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [loyalty, setLoyalty] = useState<any | null>(null);
  const [pendingReviews, setPendingReviews] = useState<any[]>([]);
  const [approvedReviews, setApprovedReviews] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);

  const [isPromoOpen, setIsPromoOpen] = useState(false);
  const [promoForm, setPromoForm] = useState({
    name: "",
    description: "",
    ruleType: "PERCENT_CATEGORY",
    categoryId: "",
    brandId: "",
    percentValue: "20",
    fixedValue: "",
    thresholdAmount: "",
    buyQty: "3",
    payQty: "2",
    minQty: "2",
    maxDiscount: "",
    freeShipping: false,
    priority: "50",
  });

  const [isCouponOpen, setIsCouponOpen] = useState(false);
  const [couponForm, setCouponForm] = useState({ code: "", discountType: "PERCENT", discountValue: "10", minCartAmount: "250", maxDiscount: "", usageLimit: "100" });

  const [loyaltySettings, setLoyaltySettings] = useState<Record<string, string>>({});
  const [answerModal, setAnswerModal] = useState<any | null>(null);
  const [answerText, setAnswerText] = useState("");

  const loadAll = useCallback(async () => {
    setBusy(true);
    try {
      const [pr, cp, ly, rv, rvA, qs] = await Promise.all([
        fetch("/api/promotions", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/coupons", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/loyalty", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/reviews?all=1", { cache: "no-store" }).then((r) => r.json()),
        Promise.resolve({ success: true, data: [] }),
        fetch("/api/questions?all=1", { cache: "no-store" }).then((r) => r.json()),
      ]);
      if (pr?.success) setPromotions(pr.data);
      if (cp?.success) setCoupons(cp.data);
      if (ly?.success) {
        setLoyalty(ly);
        setLoyaltySettings(ly.settings);
      }
      if (rv?.success) {
        setPendingReviews(rv.data.filter((x: any) => x.status === "PENDING"));
        setApprovedReviews(rv.data.filter((x: any) => x.status === "APPROVED"));
      }
      void rvA;
      if (qs?.success) setQuestions(qs.data);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const post = async (url: string, body: unknown) => {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return res.json();
  };

  const handleCreatePromo = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = await post("/api/promotions", { ...promoForm, categoryId: promoForm.categoryId ? Number(promoForm.categoryId) : null, brandId: promoForm.brandId ? Number(promoForm.brandId) : null });
    if (data.success) {
      setFeedback({ text: `Kampanya oluşturuldu: ${data.data.name}` });
      setIsPromoOpen(false);
      void loadAll();
    } else setFeedback({ text: data.error || "Kampanya eklenemedi.", isError: true });
  };

  const handleTogglePromo = async (id: number, active: boolean) => {
    await post("/api/promotions", { action: "UPDATE", id, isActive: !active });
    void loadAll();
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = await post("/api/coupons", { action: "CREATE", ...couponForm });
    if (data.success) {
      setFeedback({ text: `Kupon oluşturuldu: ${data.data.code}` });
      setIsCouponOpen(false);
      setCouponForm({ code: "", discountType: "PERCENT", discountValue: "10", minCartAmount: "250", maxDiscount: "", usageLimit: "100" });
      void loadAll();
    } else setFeedback({ text: data.error || "Kupon eklenemedi.", isError: true });
  };

  const handleToggleCoupon = async (id: number, active: boolean) => {
    const res = await fetch("/api/coupons", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "TOGGLE", id, isActive: !active }) });
    if (res.ok) void loadAll();
  };

  const handleModerateReview = async (id: number, status: "APPROVE" | "REJECT") => {
    await post("/api/reviews", { action: "MODERATE", id, status });
    void loadAll();
  };

  const handleSubmitAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!answerModal || !answerText.trim()) return;
    await post("/api/questions", { action: "ANSWER", id: answerModal.id, answer: answerText, answeredBy: "İpek Tuhafiye Uzman Ekibi" });
    setAnswerModal(null);
    setAnswerText("");
    void loadAll();
  };

  const saveLoyalty = async () => {
    await post("/api/loyalty", { action: "SAVE_SETTINGS", settings: loyaltySettings });
    setFeedback({ text: "Sadakat & sistem ayarları kaydedildi." });
    void loadAll();
  };

  const inputCls = "w-full px-3 py-2 border border-stone-300 rounded-xl text-xs";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-amber-800">FAZ 8 — Pazarlama</span>
          <h2 className="text-xl font-black text-stone-900">Kampanya, Kupon, Sadakat & Topluluk</h2>
          <p className="text-xs text-stone-500">Kural tabanlı promosyon motoru checkout'ta otomatik çalışır; kupon ve sadakat kuralları buradan yönetilir.</p>
        </div>
        <button onClick={() => void loadAll()} className="px-3 py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 text-xs font-bold rounded-xl flex items-center gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} /> Yenile
        </button>
      </div>

      {/* Alt sekmeler */}
      <div className="flex flex-wrap gap-1.5">
        {[
          { id: "promotions" as const, label: `Kampanyalar (${promotions.filter((p) => p.isActive).length})`, icon: Megaphone },
          { id: "coupons" as const, label: `Kuponlar (${coupons.filter((c) => c.isActive).length})`, icon: Ticket },
          { id: "loyalty" as const, label: "Sadakat & Ayarlar", icon: Coins },
          { id: "reviews" as const, label: `Yorum Moderasyonu (${pendingReviews.length})`, icon: Star },
          { id: "qa" as const, label: `Soru & Cevap (${questions.filter((q) => q.status === "OPEN").length})`, icon: MessageSquareQuote },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => { setSubTab(t.id); setFeedback(null); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${subTab === t.id ? "bg-amber-800 text-white" : "bg-white text-stone-600 border border-stone-200"}`}
            >
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {feedback && (
        <div className={`p-2.5 rounded-xl text-xs font-medium border ${feedback.isError ? "bg-rose-50 border-rose-200 text-rose-800" : "bg-emerald-50 border-emerald-200 text-emerald-800"}`}>
          {feedback.text}
        </div>
      )}

      {/* ---------------- KAMPANYALAR ---------------- */}
      {subTab === "promotions" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={() => setIsPromoOpen(true)} className="px-3.5 py-2 bg-amber-800 text-white text-xs font-bold rounded-xl flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> Yeni Kampanya
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {promotions.map((p) => (
              <div key={p.id} className={`p-4 rounded-2xl border bg-white shadow-xs ${p.isActive ? "border-amber-200" : "border-stone-200 opacity-60"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-black text-sm text-stone-900">{p.name}</h4>
                    <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded">{p.ruleLabel}</span>
                  </div>
                  <button onClick={() => void handleTogglePromo(p.id, p.isActive)} className="text-amber-800" title={p.isActive ? "Durdur" : "Aktifleştir"}>
                    {p.isActive ? <ToggleRight className="w-7 h-7" /> : <ToggleLeft className="w-7 h-7 text-stone-400" />}
                  </button>
                </div>
                {p.description && <p className="text-[11px] text-stone-500 mt-1">{p.description}</p>}
                <div className="grid grid-cols-2 gap-1 text-[10px] text-stone-500 mt-2 font-mono">
                  {p.percentValue && <span>İndirim: %{p.percentValue}</span>}
                  {p.fixedValue && <span>Tutar: {p.fixedValue} TL</span>}
                  {p.thresholdAmount && <span>Eşik: {p.thresholdAmount} TL</span>}
                  {p.buyQty && p.payQty && <span>{p.buyQty} al {p.payQty} öde</span>}
                  {p.categoryName && <span>Kategori: {p.categoryName}</span>}
                  {p.brandName && <span>Marka: {p.brandName}</span>}
                  <span>Öncelik: {p.priority}</span>
                  <span>Kullanım: {p.usedCount}</span>
                  <span>Bitiş: {p.endDate ? new Date(p.endDate).toLocaleDateString("tr-TR") : "süresiz"}</span>
                </div>
              </div>
            ))}
          </div>
          {promotions.length === 0 && <p className="text-xs text-stone-400 text-center py-6">Kampanya yok. Yukarıdan ekleyin.</p>}
        </div>
      )}

      {/* ---------------- KUPONLAR ---------------- */}
      {subTab === "coupons" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={() => setIsCouponOpen(true)} className="px-3.5 py-2 bg-amber-800 text-white text-xs font-bold rounded-xl flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> Yeni Kupon
            </button>
          </div>
          <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-stone-50 text-stone-500 uppercase border-b border-stone-200">
                <tr>
                  <th className="py-2.5 px-3">Kod</th>
                  <th className="py-2.5 px-3">Tür</th>
                  <th className="py-2.5 px-3">Min Sepet</th>
                  <th className="py-2.5 px-3">Maks. İndirim</th>
                  <th className="py-2.5 px-3">Kullanım</th>
                  <th className="py-2.5 px-3">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {coupons.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2.5 px-3 font-mono font-black text-amber-900">{c.code}</td>
                    <td className="py-2.5 px-3">{c.discountType === "PERCENT" ? `%${c.discountValue}` : `${c.discountValue} TL`}</td>
                    <td className="py-2.5 px-3">{Number(c.minCartAmount).toFixed(0)} TL</td>
                    <td className="py-2.5 px-3">{c.maxDiscount ? `${c.maxDiscount} TL` : "—"}</td>
                    <td className="py-2.5 px-3">{c.usedCount} / {c.usageLimit}</td>
                    <td className="py-2.5 px-3">
                      <button onClick={() => void handleToggleCoupon(c.id, c.isActive)} className="flex items-center gap-1">
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${c.isActive ? "bg-emerald-100 text-emerald-800" : "bg-stone-200 text-stone-500"}`}>
                          {c.isActive ? "AKTİF" : "PASİF"}
                        </span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------------- SADAKAT & AYARLAR ---------------- */}
      {subTab === "loyalty" && loyalty && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-stone-200 space-y-3">
            <h3 className="font-bold text-sm text-stone-900">Kazanım & Sistem Kuralları</h3>
            {[
              { key: "loyalty.earn_rate_tl", label: "Kazanım oranı: kaç TL harcama" },
              { key: "loyalty.earn_points", label: "→ kazanılan puan" },
              { key: "loyalty.point_value_tl", label: "1 puanın TL karşılığı (harcarken)" },
              { key: "loyalty.expire_days", label: "Puan geçerlilik (gün, 0 = süresiz)" },
              { key: "reservation.minutes", label: "Stok rezervasyon süresi (dk)" },
              { key: "shipping.free_threshold", label: "Ücretsiz kargo eşiği (TL)" },
            ].map((f) => (
              <div key={f.key} className="flex items-center gap-2">
                <label className="flex-1 text-[11px] text-stone-600">{f.label}</label>
                <input
                  value={loyaltySettings[f.key] ?? ""}
                  onChange={(e) => setLoyaltySettings({ ...loyaltySettings, [f.key]: e.target.value })}
                  className="w-24 px-2 py-1.5 border border-stone-300 rounded-lg text-xs text-center font-mono"
                />
              </div>
            ))}
            <button onClick={() => void saveLoyalty()} className="w-full py-2.5 bg-amber-800 text-white text-xs font-bold rounded-xl">Ayarları Kaydet</button>
          </div>

          <div className="space-y-4">
            <div className="bg-white p-5 rounded-2xl border border-stone-200">
              <h3 className="font-bold text-sm text-stone-900 mb-3">Üyelik Tiers (otomatik)</h3>
              <div className="grid grid-cols-4 gap-2 text-center text-[10px] font-bold">
                <div className="p-2 rounded-xl bg-stone-100">BRONZ<br /><span className="text-stone-500 font-normal">&lt;100</span></div>
                <div className="p-2 rounded-xl bg-slate-200">GÜMÜŞ<br /><span className="text-slate-600 font-normal">100+</span></div>
                <div className="p-2 rounded-xl bg-amber-100 text-amber-900">ALTIN<br /><span className="font-normal">500+</span></div>
                <div className="p-2 rounded-xl bg-violet-100 text-violet-900">PLATİN<br /><span className="font-normal">1000+</span></div>
              </div>
              <div className="mt-3 space-y-1">
                {loyalty.members.slice(0, 5).map((m: any) => (
                  <div key={m.id} className="flex justify-between text-xs border-b border-stone-100 py-1">
                    <span className="font-semibold truncate max-w-[140px]">{m.name}</span>
                    <span className="text-amber-800 font-bold">{m.points} puan · {m.tier}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-stone-200">
              <h3 className="font-bold text-sm text-stone-900 mb-3">Son Puan Hareketleri</h3>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {loyalty.transactions.slice(0, 10).map((t: any) => (
                  <div key={t.id} className="flex justify-between text-[11px]">
                    <span className="text-stone-600 truncate max-w-[180px]">{t.customerName} · {t.description}</span>
                    <span className={`font-bold ${t.points > 0 ? "text-emerald-700" : "text-rose-700"}`}>{t.points > 0 ? "+" : ""}{t.points}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- YORUM MODERASYONU ---------------- */}
      {subTab === "reviews" && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-stone-100 font-bold text-sm">Onay Bekleyenler ({pendingReviews.length})</div>
            <div className="divide-y divide-stone-100">
              {pendingReviews.length === 0 && <p className="text-xs text-stone-400 text-center py-6">Bekleyen yorum yok.</p>}
              {pendingReviews.map((r) => (
                <div key={r.id} className="p-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="font-bold text-xs">Ürün #{r.productId} · {r.customerName}</span>
                    {r.verifiedPurchase && <span className="ml-1 text-[10px] text-emerald-700 font-bold flex items-center gap-0.5"><BadgeCheck className="w-3 h-3" /> Doğrulanmış</span>}
                    <p className="text-xs text-stone-600 mt-0.5">{r.title ? <strong>{r.title} — </strong> : null}{r.comment}</p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-1 shrink-0">
                    <button onClick={() => void handleModerateReview(r.id, "APPROVE")} className="px-2.5 py-1.5 bg-emerald-700 text-white rounded-lg text-[10px] font-bold">Onayla</button>
                    <button onClick={() => void handleModerateReview(r.id, "REJECT")} className="px-2.5 py-1.5 bg-stone-200 text-stone-700 rounded-lg text-[10px] font-bold">Reddet</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-stone-100 font-bold text-sm">Yayındaki Yorumlar ({approvedReviews.length})</div>
            <div className="divide-y divide-stone-100 max-h-72 overflow-y-auto">
              {approvedReviews.map((r) => (
                <div key={r.id} className="p-3 text-xs flex justify-between">
                  <span className="truncate max-w-[70%]">{r.customerName}: {r.comment}</span>
                  <span className="font-bold text-amber-700">{r.rating} ★</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ---------------- SORU & CEVAP ---------------- */}
      {subTab === "qa" && (
        <div className="bg-white rounded-2xl border border-stone-200 divide-y divide-stone-100">
          {questions.length === 0 && <p className="text-xs text-stone-400 text-center py-6">Soru yok.</p>}
          {questions.map((q) => (
            <div key={q.id} className="p-4">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs">Ürün #{q.productId} · {q.askerName}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLORS[q.status] || ""}`}>{q.status}</span>
              </div>
              <p className="text-xs text-stone-700 mt-1">{q.question}</p>
              {q.answer ? (
                <p className="text-xs bg-amber-50 border-l-4 border-amber-700 rounded-r-lg p-2 mt-2"><strong>Yanıt:</strong> {q.answer}</p>
              ) : (
                <div className="flex gap-1 mt-2">
                  <button onClick={() => setAnswerModal(q)} className="px-2.5 py-1 bg-amber-800 text-white rounded-lg text-[10px] font-bold flex items-center gap-1">
                    <Send className="w-3 h-3" /> Yanıtla
                  </button>
                  <button onClick={async () => { await post("/api/questions", { action: "HIDE", id: q.id }); void loadAll(); }} className="px-2.5 py-1 bg-stone-200 rounded-lg text-[10px] font-bold">Gizle</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ---------------- MODAL: YENİ KAMPANYA ---------------- */}
      {isPromoOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <h3 className="font-black text-base">Yeni Kampanya (Kural Motoru)</h3>
              <button onClick={() => setIsPromoOpen(false)}><X className="w-5 h-5 text-stone-400" /></button>
            </div>
            <form onSubmit={handleCreatePromo} className="space-y-3 text-xs">
              <input required placeholder="Kampanya adı (örn: Bahar Fermuar Kampanyası)" value={promoForm.name} onChange={(e) => setPromoForm({ ...promoForm, name: e.target.value })} className={inputCls} />
              <div className="grid grid-cols-2 gap-2">
                <select value={promoForm.ruleType} onChange={(e) => setPromoForm({ ...promoForm, ruleType: e.target.value })} className={inputCls}>
                  {RULE_OPTIONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
                <input placeholder="Açıklama" value={promoForm.description} onChange={(e) => setPromoForm({ ...promoForm, description: e.target.value })} className={inputCls} />
              </div>
              {(promoForm.ruleType === "PERCENT_CATEGORY" || promoForm.ruleType === "BUNDLE_PERCENT" || promoForm.ruleType === "BUY_X_PAY_Y") && (
                <select value={promoForm.categoryId} onChange={(e) => setPromoForm({ ...promoForm, categoryId: e.target.value })} className={inputCls}>
                  <option value="">Kategori (X Al Y Öde için opsiyonel)</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              {promoForm.ruleType === "PERCENT_BRAND" && (
                <select required value={promoForm.brandId} onChange={(e) => setPromoForm({ ...promoForm, brandId: e.target.value })} className={inputCls}>
                  <option value="">Marka seçin</option>
                  {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              )}
              <div className="grid grid-cols-3 gap-2">
                {(promoForm.ruleType === "PERCENT_CATEGORY" || promoForm.ruleType === "PERCENT_BRAND" || promoForm.ruleType === "BUNDLE_PERCENT" || promoForm.ruleType === "THRESHOLD_DISCOUNT") && (
                  <div>
                    <label className="block font-bold mb-1">İndirim %</label>
                    <input type="number" step="0.5" value={promoForm.percentValue} onChange={(e) => setPromoForm({ ...promoForm, percentValue: e.target.value })} className={inputCls} />
                  </div>
                )}
                {promoForm.ruleType === "THRESHOLD_DISCOUNT" && (
                  <>
                    <div>
                      <label className="block font-bold mb-1">Eşik (TL)</label>
                      <input type="number" value={promoForm.thresholdAmount} onChange={(e) => setPromoForm({ ...promoForm, thresholdAmount: e.target.value })} className={inputCls} />
                    </div>
                    <div>
                      <label className="block font-bold mb-1">İndirim (TL)</label>
                      <input type="number" value={promoForm.fixedValue} onChange={(e) => setPromoForm({ ...promoForm, fixedValue: e.target.value })} className={inputCls} />
                    </div>
                  </>
                )}
                {promoForm.ruleType === "FREE_SHIPPING" && (
                  <div className="col-span-2">
                    <label className="block font-bold mb-1">Eşik tutarı (boş = her sepete ücretsiz kargo)</label>
                    <input type="number" value={promoForm.thresholdAmount} onChange={(e) => setPromoForm({ ...promoForm, thresholdAmount: e.target.value })} className={inputCls} />
                  </div>
                )}
                {promoForm.ruleType === "BUY_X_PAY_Y" && (
                  <>
                    <div><label className="block font-bold mb-1">Al (X)</label><input type="number" value={promoForm.buyQty} onChange={(e) => setPromoForm({ ...promoForm, buyQty: e.target.value })} className={inputCls} /></div>
                    <div><label className="block font-bold mb-1">Öde (Y)</label><input type="number" value={promoForm.payQty} onChange={(e) => setPromoForm({ ...promoForm, payQty: e.target.value })} className={inputCls} /></div>
                  </>
                )}
                {promoForm.ruleType === "BUNDLE_PERCENT" && (
                  <div><label className="block font-bold mb-1">Min adet</label><input type="number" value={promoForm.minQty} onChange={(e) => setPromoForm({ ...promoForm, minQty: e.target.value })} className={inputCls} /></div>
                )}
                <div>
                  <label className="block font-bold mb-1">Maks. indirim</label>
                  <input type="number" placeholder="ops." value={promoForm.maxDiscount} onChange={(e) => setPromoForm({ ...promoForm, maxDiscount: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="block font-bold mb-1">Öncelik</label>
                  <input type="number" value={promoForm.priority} onChange={(e) => setPromoForm({ ...promoForm, priority: e.target.value })} className={inputCls} />
                </div>
              </div>
              <button type="submit" className="w-full py-3 bg-amber-800 text-white font-bold rounded-xl">Kampanyayı Yayınla</button>
            </form>
          </div>
        </div>
      )}

      {/* ---------------- MODAL: YENİ KUPON ---------------- */}
      {isCouponOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <h3 className="font-black text-base">Yeni Kupon</h3>
              <button onClick={() => setIsCouponOpen(false)}><X className="w-5 h-5 text-stone-400" /></button>
            </div>
            <form onSubmit={handleCreateCoupon} className="space-y-3 text-xs">
              <input required placeholder="KOD (örn BAHAR25)" value={couponForm.code} onChange={(e) => setCouponForm({ ...couponForm, code: e.target.value })} className={`${inputCls} font-mono uppercase`} />
              <div className="grid grid-cols-2 gap-2">
                <select value={couponForm.discountType} onChange={(e) => setCouponForm({ ...couponForm, discountType: e.target.value })} className={inputCls}>
                  <option value="PERCENT">Yüzde %</option>
                  <option value="FIXED">Sabit TL</option>
                </select>
                <input required type="number" step="0.01" placeholder={couponForm.discountType === "PERCENT" ? "20" : "50"} value={couponForm.discountValue} onChange={(e) => setCouponForm({ ...couponForm, discountValue: e.target.value })} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="block font-bold mb-1">Min sepet TL</label><input type="number" value={couponForm.minCartAmount} onChange={(e) => setCouponForm({ ...couponForm, minCartAmount: e.target.value })} className={inputCls} /></div>
                <div><label className="block font-bold mb-1">Maks indirim</label><input type="number" placeholder="ops." value={couponForm.maxDiscount} onChange={(e) => setCouponForm({ ...couponForm, maxDiscount: e.target.value })} className={inputCls} /></div>
              </div>
              <div><label className="block font-bold mb-1">Kullanım limiti</label><input type="number" value={couponForm.usageLimit} onChange={(e) => setCouponForm({ ...couponForm, usageLimit: e.target.value })} className={inputCls} /></div>
              <button type="submit" className="w-full py-3 bg-amber-800 text-white font-bold rounded-xl">Kuponu Oluştur</button>
            </form>
          </div>
        </div>
      )}

      {/* ---------------- MODAL: SORU YANITLA ---------------- */}
      {answerModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <h3 className="font-black text-base">Soruyu Yanıtla</h3>
              <button onClick={() => setAnswerModal(null)}><X className="w-5 h-5 text-stone-400" /></button>
            </div>
            <p className="text-xs bg-stone-50 border border-stone-200 rounded-xl p-3"><strong>{answerModal.askerName}</strong>: {answerModal.question}</p>
            <form onSubmit={handleSubmitAnswer} className="space-y-2">
              <textarea required rows={4} placeholder="Uzman yanıtınız…" value={answerText} onChange={(e) => setAnswerText(e.target.value)} className={inputCls} />
              <button type="submit" className="w-full py-3 bg-amber-800 text-white font-bold rounded-xl">Yanıtı Yayınla</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
