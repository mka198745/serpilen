"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Sparkles,
  TrendingUp,
  Boxes,
  ShoppingBag,
  Users,
  FileText,
  MessageSquare,
  Send,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ShieldAlert,
  ArrowRight,
  X,
  Bot,
  User as UserIcon,
  RefreshCw,
  Coins,
} from "lucide-react";

type AiResult = any;

const MODULES = [
  { id: "sales_analyst", label: "Satış Analisti", description: "Ciro, kanal dağılımı, büyüme ve 7 günlük tahmin.", icon: TrendingUp, color: "amber" },
  { id: "inventory_assistant", label: "Stok Asistanı", description: "Tükenme tahmini, days-of-cover ve reorder miktarı.", icon: Boxes, color: "rose" },
  { id: "purchasing_advisor", label: "Satın Alma Danışmanı", description: "Tedarikçi eşleştirmesi ve maliyet hesaplı sipariş.", icon: ShoppingBag, color: "emerald" },
  { id: "crm_assistant", label: "CRM & Churn", description: "Segmentasyon, kayıp riski skoru ve LTV analizi.", icon: Users, color: "sky" },
  { id: "content_generator", label: "İçerik & SEO", description: "SEO başlık, meta, uzun açıklama ve etiket üretimi.", icon: FileText, color: "violet" },
];

const COLOR_MAP: Record<string, string> = {
  amber: "bg-amber-800 hover:bg-amber-900",
  rose: "bg-rose-700 hover:bg-rose-800",
  emerald: "bg-emerald-700 hover:bg-emerald-800",
  sky: "bg-sky-800 hover:bg-sky-900",
  violet: "bg-violet-700 hover:bg-violet-800",
};

interface ChatMsg {
  role: "user" | "ai";
  text: string;
  suggestions?: string[];
}

export function AiAssistantCenter({ products }: { products: any[] }) {
  const [mode, setMode] = useState<"modules" | "chat">("modules");
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [result, setResult] = useState<AiResult | null>(null);
  const [guardrail, setGuardrail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Chat
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: "ai",
      text: "Merhaba! Ben **İpek Tuhafiye AI Asistanı**yım. Satış, stok, satın alma, müşteri veya kampanya hakkında doğal dilde soru sorabilirsiniz. 🙌",
      suggestions: ["Bugünkü satışlar nasıl?", "Kritik stokları göster", "Satın alma önerisi ver", "VIP müşterilerim"],
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Content generator
  const [contentProductId, setContentProductId] = useState("");
  const [contentTone, setContentTone] = useState("professional");
  const [generatedContent, setGeneratedContent] = useState<any | null>(null);
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const runModule = async (moduleId: string) => {
    if (moduleId === "content_generator") {
      setActiveModule(moduleId);
      setResult(null);
      return;
    }
    setActiveModule(moduleId);
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module: moduleId }),
      });
      const json = await res.json();
      if (json.success) {
        setResult(json.data);
        setGuardrail(json.guardrail);
      } else {
        setError(json.error || "Analiz başarısız oldu.");
      }
    } catch {
      setError("Sunucuya ulaşılamadı.");
    } finally {
      setLoading(false);
    }
  };

  const sendChat = async (text?: string) => {
    const msg = (text || chatInput).trim();
    if (!msg) return;
    setMessages((prev) => [...prev, { role: "user", text: msg }]);
    setChatInput("");

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module: "chat", prompt: msg }),
      });
      const json = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "ai", text: json.data?.answer || json.error || "Yanıt üretilemedi.", suggestions: json.data?.suggestions },
      ]);
    } catch {
      setMessages((prev) => [...prev, { role: "ai", text: "Sunucuya ulaşılamadı." }]);
    }
  };

  const generateContent = async () => {
    if (!contentProductId) return;
    setLoading(true);
    setGeneratedContent(null);
    setApplied(false);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module: "content_generator", productId: Number(contentProductId), tone: contentTone }),
      });
      const json = await res.json();
      if (json.success) {
        setGeneratedContent(json.data);
        setGuardrail(json.guardrail);
      } else setError(json.error);
    } catch {
      setError("Sunucuya ulaşılamadı.");
    } finally {
      setLoading(false);
    }
  };

  const applyContent = async () => {
    if (!generatedContent) return;
    setLoading(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          module: "apply_content",
          productId: generatedContent.productId,
          content: {
            seoTitle: generatedContent.seoTitle,
            metaDescription: generatedContent.metaDescription,
            seoDescription: generatedContent.seoDescription,
            longDescription: generatedContent.longDescription,
            suggestedTags: generatedContent.suggestedTags,
          },
        }),
      });
      const json = await res.json();
      setLoading(false);
      if (json.success) {
        setApplied(true);
        setError(null);
      } else setError(json.error);
    } catch {
      setLoading(false);
      setError("Uygulama başarısız oldu.");
    }
  };

  const bold = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p, i) =>
      p.startsWith("**") && p.endsWith("**") ? <strong key={i} className="text-stone-900">{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>
    );
  };

  const inputCls = "w-full px-3 py-2 border border-stone-300 rounded-xl text-xs";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-violet-800">FAZ 11 — AI YÖNETİM ASİSTANI</span>
          <h2 className="text-xl font-black text-stone-900 flex items-center gap-2">
            <Bot className="w-6 h-6 text-violet-700" />
            <span>Tuhafiye AI Asistanı & Veri Analisti</span>
          </h2>
          <p className="text-xs text-stone-500">
            Satış, stok, satın alma, müşteri ve içerik analizleri — doğal dil sohbet desteğiyle.
          </p>
        </div>

        {/* Mode toggle */}
        <div className="flex items-center gap-1.5 bg-stone-200 rounded-xl p-1">
          <button
            onClick={() => setMode("modules")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${mode === "modules" ? "bg-white shadow-xs text-stone-900" : "text-stone-600"}`}
          >
            Analiz Modülleri
          </button>
          <button
            onClick={() => setMode("chat")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${mode === "chat" ? "bg-white shadow-xs text-stone-900" : "text-stone-600"}`}
          >
            <MessageSquare className="w-3.5 h-3.5" /> AI Sohbet
          </button>
        </div>
      </div>

      {/* Guardrail Banner */}
      <div className="p-3 rounded-2xl bg-violet-50 border border-violet-200 text-xs text-violet-900 flex items-start gap-2.5">
        <ShieldAlert className="w-5 h-5 shrink-0 text-violet-700 mt-0.5" />
        <div>
          <strong className="block">AI Guardrails (Güvenlik Kalkanı) Aktif</strong>
          AI yalnızca <strong>öneri üretir ve önizleme sunar</strong>. Fiyat, stok, sipariş veya muhasebe kayıtları üzerinde hiçbir değişiklik
          kullanıcı açık onayı vermeden yapılmaz. Ürün içerikleri de "Uygula" onayı sonrası yazılır.
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 font-bold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* --------------------------------------------- */}
      {/* MODE: MODULES */}
      {/* --------------------------------------------- */}
      {mode === "modules" && (
        <div className="space-y-5">
          {/* Module Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            {MODULES.map((m) => {
              const Icon = m.icon;
              const isActive = activeModule === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => void runModule(m.id)}
                  disabled={loading}
                  className={`p-4 rounded-2xl border text-left transition group ${
                    isActive ? "border-violet-500 bg-violet-50 ring-2 ring-violet-500/20" : "border-stone-200 bg-white hover:border-stone-300 hover:shadow-sm"
                  } disabled:opacity-60`}
                >
                  <Icon className={`w-5 h-5 mb-2 ${isActive ? "text-violet-700" : "text-stone-400 group-hover:text-stone-700"} transition-colors`} />
                  <h4 className="font-bold text-xs text-stone-900">{m.label}</h4>
                  <p className="text-[10px] text-stone-500 mt-0.5 leading-snug">
                    {MODULES.find((x) => x.id === m.id)?.description}
                  </p>
                  {loading && isActive && <Loader2 className="w-4 h-4 animate-spin text-violet-700 mt-2" />}
                </button>
              );
            })}
          </div>

          {/* Loading */}
          {loading && activeModule !== "content_generator" && (
            <div className="p-8 text-center text-xs text-stone-500 flex flex-col items-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-violet-700" />
              <span>AI verileri analiz ediyor ve içgörü üretiyor…</span>
            </div>
          )}

          {/* ---------- SALES ---------- */}
          {result && activeModule === "sales_analyst" && (
            <div className="space-y-4">
              <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-xs space-y-4">
                <div className="flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-amber-700 shrink-0 mt-1" />
                  <p className="text-sm text-stone-700 font-medium leading-relaxed">{bold(result.headline)}</p>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {result.kpis.map((k: any) => (
                    <div key={k.label} className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200">
                      <span className="text-[9px] font-bold uppercase text-stone-500 block">{k.label}</span>
                      <div className={`text-lg font-black mt-0.5 ${k.tone === "good" ? "text-emerald-700" : k.tone === "bad" ? "text-rose-700" : "text-stone-900"}`}>
                        {k.value}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-stone-500 pt-2 border-t border-stone-100">
                  <span>Güven skoru: <strong className="text-violet-800">%{result.confidence}</strong></span>
                  <span>·</span>
                  <span>Tahmini 7 günlük ciro: <strong className="text-stone-800">{result.forecast.next7Days.toFixed(2)} TL</strong> ({result.forecast.trend})</span>
                </div>
              </div>

              {/* Kanal dağılımı */}
              <div className="bg-white p-5 rounded-3xl border border-stone-200 space-y-3">
                <h4 className="font-bold text-sm text-stone-900">Kanal Bazlı Ciro Dağılımı</h4>
                {result.channelBreakdown.map((c: any) => (
                  <div key={c.channel} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-stone-700">{c.channel} <span className="text-stone-400">({c.count} işlem)</span></span>
                      <span className="text-stone-900">{c.revenue.toFixed(2)} TL · %{c.share}</span>
                    </div>
                    <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-violet-600 to-violet-400 rounded-full" style={{ width: `${Math.max(2, c.share)}%` }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* İçgörüler & Öneriler */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white p-5 rounded-3xl border border-stone-200 space-y-2.5">
                  <h4 className="font-bold text-sm text-stone-900 flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-amber-700" /> AI İçgörüleri</h4>
                  {result.insights.map((i: string, idx: number) => (
                    <p key={idx} className="text-xs text-stone-600 leading-relaxed flex gap-2">
                      <span className="text-violet-600 font-bold shrink-0">•</span>
                      <span>{bold(i)}</span>
                    </p>
                  ))}
                </div>
                <div className="bg-white p-5 rounded-3xl border border-stone-200 space-y-2.5">
                  <h4 className="font-bold text-sm text-stone-900 flex items-center gap-1.5"><ArrowRight className="w-4 h-4 text-emerald-700" /> Stratejik Öneriler</h4>
                  {result.recommendations.map((r: string, idx: number) => (
                    <p key={idx} className="text-xs text-stone-600 leading-relaxed flex gap-2">
                      <span className="text-emerald-600 font-bold shrink-0">{idx + 1}.</span>
                      <span>{bold(r)}</span>
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ---------- INVENTORY ---------- */}
          {result && activeModule === "inventory_assistant" && (
            <div className="space-y-4">
              <div className="bg-white p-5 rounded-3xl border border-stone-200 space-y-3">
                <div className="flex items-start gap-3">
                  <Boxes className="w-5 h-5 text-rose-700 shrink-0 mt-1" />
                  <p className="text-sm text-stone-700 font-medium">{bold(result.headline)}</p>
                </div>
                {result.insights.map((i: string, idx: number) => (
                  <p key={idx} className="text-xs text-stone-600 flex gap-2"><span className="text-rose-600 font-bold">•</span><span>{bold(i)}</span></p>
                ))}
              </div>

              <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-stone-50 text-stone-500 uppercase border-b border-stone-200">
                    <tr>
                      <th className="py-2.5 px-3">Ürün</th>
                      <th className="py-2.5 px-3">Depo</th>
                      <th className="py-2.5 px-3">Mevcut</th>
                      <th className="py-2.5 px-3">Günlük Satış</th>
                      <th className="py-2.5 px-3">Örtü</th>
                      <th className="py-2.5 px-3">Öneri</th>
                      <th className="py-2.5 px-3">Risk</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {result.items.slice(0, 15).map((i: any) => (
                      <tr key={`${i.productId}-${i.warehouseName}`} className="hover:bg-stone-50/50">
                        <td className="py-2.5 px-3"><span className="font-bold block truncate max-w-[200px]">{i.productName}</span><span className="text-[10px] text-stone-400 font-mono">{i.sku}</span></td>
                        <td className="py-2.5 px-3">{i.warehouseName}</td>
                        <td className="py-2.5 px-3 font-bold">{i.available}</td>
                        <td className="py-2.5 px-3">{i.dailySales}</td>
                        <td className="py-2.5 px-3 font-bold">{i.daysOfCover === 999 ? "∞" : `${i.daysOfCover} gün`}</td>
                        <td className="py-2.5 px-3 font-black text-amber-800">{i.suggestedOrderQty}</td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            i.risk === "CRITICAL" ? "bg-rose-600 text-white" : i.risk === "HIGH" ? "bg-rose-100 text-rose-800" : i.risk === "MEDIUM" ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"
                          }`}>{i.risk}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Link href="/admin" onClick={() => { const ev = new CustomEvent("ai-goto-purchasing"); window.dispatchEvent(ev); }} className="hidden" />
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between">
                <p className="text-xs text-emerald-900 font-semibold">
                  💡 Bu önerileri Satın Alma modülüne taşıyıp talep oluşturabilirsiniz.
                </p>
                <Link href="/admin" className="px-3 py-2 bg-emerald-700 text-white text-xs font-bold rounded-xl whitespace-nowrap">
                  Satın Alma Modülü
                </Link>
              </div>
            </div>
          )}

          {/* ---------- PURCHASING ---------- */}
          {result && activeModule === "purchasing_advisor" && (
            <div className="space-y-4">
              <div className="bg-white p-5 rounded-3xl border border-stone-200 space-y-3">
                <div className="flex items-start gap-3">
                  <ShoppingBag className="w-5 h-5 text-emerald-700 shrink-0 mt-1" />
                  <p className="text-sm text-stone-700 font-medium">{bold(result.headline)}</p>
                </div>
                <div className="flex gap-3 text-xs">
                  <span className="px-3 py-1.5 bg-rose-50 text-rose-800 rounded-xl font-bold">
                    {result.urgentCount} Yüksek Öncelik
                  </span>
                  <span className="px-3 py-1.5 bg-amber-50 text-amber-900 rounded-xl font-bold">
                    Tahmini Maliyet: {result.totalEstimatedCost.toFixed(2)} TL
                  </span>
                </div>
              </div>

              <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-stone-50 text-stone-500 uppercase border-b border-stone-200">
                    <tr>
                      <th className="py-2.5 px-3">Ürün</th>
                      <th className="py-2.5 px-3">Tedarikçi</th>
                      <th className="py-2.5 px-3">Termin</th>
                      <th className="py-2.5 px-3">Önerilen</th>
                      <th className="py-2.5 px-3">Birim</th>
                      <th className="py-2.5 px-3">Tahmini</th>
                      <th className="py-2.5 px-3">Öncelik</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {result.recommendations.map((r: any, i: number) => (
                      <tr key={i}>
                        <td className="py-2.5 px-3"><span className="font-bold block truncate max-w-[180px]">{r.productName}</span><span className="text-[10px] text-stone-400">{r.reason}</span></td>
                        <td className="py-2.5 px-3 font-semibold">{r.supplierName}</td>
                        <td className="py-2.5 px-3">{r.leadTimeDays} gün</td>
                        <td className="py-2.5 px-3 font-black text-amber-800">{r.recommendedQty}</td>
                        <td className="py-2.5 px-3">{r.unitCost.toFixed(2)} TL</td>
                        <td className="py-2.5 px-3 font-bold">{r.estimatedCost.toFixed(2)} TL</td>
                        <td className="py-2.5 px-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${r.priority === "YÜKSEK" ? "bg-rose-600 text-white" : "bg-amber-100 text-amber-900"}`}>{r.priority}</span></td>
                      </tr>
                    ))}
                    {result.recommendations.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-stone-400">Satın alma önerisi yok — stoklar yeterli.</td></tr>}
                  </tbody>
                </table>
              </div>

              <p className="text-[11px] text-stone-500">{result.advice}</p>
            </div>
          )}

          {/* ---------- CRM ---------- */}
          {result && activeModule === "crm_assistant" && (
            <div className="space-y-4">
              <div className="bg-white p-5 rounded-3xl border border-stone-200 space-y-3">
                <div className="flex items-start gap-3">
                  <Users className="w-5 h-5 text-sky-700 shrink-0 mt-1" />
                  <p className="text-sm text-stone-700 font-medium">{bold(result.headline)}</p>
                </div>
                {result.insights.map((i: string, idx: number) => (
                  <p key={idx} className="text-xs text-stone-600 flex gap-2"><span className="text-sky-600 font-bold">•</span><span>{bold(i)}</span></p>
                ))}
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {result.segments.map((s: any) => (
                  <div key={s.segment} className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black" style={{ color: s.color }}>{s.segment}</span>
                      <span className="text-[10px] text-stone-400">{s.count} kişi</span>
                    </div>
                    <div className="text-base font-black text-stone-900 mt-1">{s.totalSpend.toFixed(0)} TL</div>
                    <div className="text-[10px] text-stone-400">Ort. {s.avgSpend.toFixed(0)} TL / müşteri</div>
                  </div>
                ))}
              </div>

              <div className="bg-white rounded-3xl border border-rose-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-stone-100 bg-rose-50/50 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-700" />
                  <h4 className="font-bold text-sm text-rose-900">Kayıp (Churn) Riski Olan Müşteriler</h4>
                </div>
                <table className="w-full text-xs text-left">
                  <thead className="bg-stone-50 text-stone-500 uppercase border-b border-stone-200">
                    <tr><th className="py-2 px-3">Müşteri</th><th className="py-2 px-3">Tip</th><th className="py-2 px-3">Harcama</th><th className="py-2 px-3">Son Sipariş</th><th className="py-2 px-3">Risk</th><th className="py-2 px-3">Önerilen Aksiyon</th></tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {result.churnRisk.map((c: any) => (
                      <tr key={c.customerId}>
                        <td className="py-2 px-3 font-bold">{c.name}</td>
                        <td className="py-2 px-3">{c.type}</td>
                        <td className="py-2 px-3 font-bold">{c.totalSpend.toFixed(0)} TL</td>
                        <td className="py-2 px-3">{c.lastOrderDaysAgo} gün</td>
                        <td className="py-2 px-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${c.riskScore >= 80 ? "bg-rose-600 text-white" : c.riskScore >= 65 ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-900"}`}>
                            %{c.riskScore}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-stone-600">{c.action}</td>
                      </tr>
                    ))}
                    {result.churnRisk.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-stone-400">Yüksek riskli müşteri yok.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ---------- CONTENT GENERATOR ---------- */}
          {activeModule === "content_generator" && (
            <div className="space-y-4">
              <div className="bg-white p-5 rounded-3xl border border-stone-200 space-y-3">
                <h4 className="font-bold text-sm text-stone-900 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-violet-700" /> AI Ürün İçerik & SEO Üretici
                </h4>
                <p className="text-xs text-stone-500">
                  Ürünü seçin; AI, SEO başlığı, meta description, uzun açıklama ve etiket önerisi üretsin. Onayınız olmadan ürüne yazılmaz.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <select value={contentProductId} onChange={(e) => setContentProductId(e.target.value)} className={inputCls}>
                    <option value="">Ürün seçin…</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <select value={contentTone} onChange={(e) => setContentTone(e.target.value)} className={inputCls}>
                    <option value="professional">Profesyonel Ton</option>
                    <option value="friendly">Samimi Ton</option>
                    <option value="craftsman">Ustalık Tonu</option>
                  </select>
                  <button
                    onClick={() => void generateContent()}
                    disabled={!contentProductId || loading}
                    className="py-2 bg-violet-700 hover:bg-violet-800 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    <span>İçerik Üret</span>
                  </button>
                </div>
              </div>

              {generatedContent && (
                <div className="space-y-3">
                  {applied && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs font-bold text-emerald-900 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" /> İçerik ürün sayfasına başarıyla uygulandı!
                    </div>
                  )}

                  {[
                    { label: "SEO Başlığı (65 karakter)", value: generatedContent.seoTitle, field: "seoTitle" },
                    { label: "Meta Description (158 karakter)", value: generatedContent.metaDescription, field: "metaDescription" },
                    { label: "SEO Açıklaması", value: generatedContent.seoDescription, field: "seoDescription" },
                    { label: "Önerilen Etiketler", value: generatedContent.suggestedTags, field: "suggestedTags" },
                  ].map((f) => (
                    <div key={f.field} className="bg-white p-4 rounded-2xl border border-stone-200 space-y-1.5">
                      <span className="text-[10px] font-black uppercase text-stone-500">{f.label}</span>
                      <p className="text-xs text-stone-800 bg-stone-50 p-2.5 rounded-xl border border-stone-100 leading-relaxed">{f.value}</p>
                    </div>
                  ))}

                  <div className="bg-white p-4 rounded-2xl border border-stone-200 space-y-1.5">
                    <span className="text-[10px] font-black uppercase text-stone-500">Uzun Ürün Açıklaması</span>
                    <pre className="text-xs text-stone-800 bg-stone-50 p-3 rounded-xl border border-stone-100 whitespace-pre-wrap font-sans leading-relaxed max-h-64 overflow-y-auto">
                      {generatedContent.longDescription}
                    </pre>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => void applyContent()}
                      disabled={loading || applied}
                      className="flex-1 py-3 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      <span>{applied ? "Uygulandı ✓" : "Onaylıyorum — Ürüne Uygula"}</span>
                    </button>
                    <button onClick={() => void generateContent()} disabled={loading} className="px-4 py-3 bg-stone-200 text-stone-800 font-bold text-xs rounded-xl flex items-center gap-1.5">
                      <RefreshCw className="w-4 h-4" /> Yeniden Üret
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* --------------------------------------------- */}
      {/* MODE: CHAT */}
      {/* --------------------------------------------- */}
      {mode === "chat" && (
        <div className="bg-white rounded-3xl border border-stone-200 shadow-xs overflow-hidden flex flex-col h-[600px]">
          {/* Header */}
          <div className="px-5 py-3.5 bg-gradient-to-r from-violet-800 to-violet-700 text-white flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-black text-sm">İpek Tuhafiye AI Asistanı</h3>
                <p className="text-[10px] text-violet-200">Verileriniz üzerinden içgörü üretir · Guardrail aktif</p>
              </div>
            </div>
            <span className="text-[10px] bg-white/15 px-2 py-1 rounded-full">Güvenli Mod</span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-stone-50">
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-2.5 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "ai" && (
                  <div className="w-8 h-8 rounded-xl bg-violet-700 text-white flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4" />
                  </div>
                )}
                <div className={`max-w-[80%] space-y-2 ${m.role === "user" ? "order-first" : ""}`}>
                  <div
                    className={`p-3 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                      m.role === "user" ? "bg-stone-900 text-white rounded-br-sm" : "bg-white border border-stone-200 text-stone-700 rounded-bl-sm shadow-xs"
                    }`}
                  >
                    {bold(m.text)}
                  </div>
                  {m.suggestions && m.suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {m.suggestions.map((s, j) => (
                        <button
                          key={j}
                          onClick={() => void sendChat(s)}
                          className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-white border border-stone-300 text-stone-700 hover:border-violet-500 hover:text-violet-800 transition"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {m.role === "user" && (
                  <div className="w-8 h-8 rounded-xl bg-amber-800 text-white flex items-center justify-center shrink-0">
                    <UserIcon className="w-4 h-4" />
                  </div>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendChat();
            }}
            className="p-3 border-t border-stone-200 bg-white flex gap-2 shrink-0"
          >
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Örn: Hangi ürünlerin stoğu kritik? Bu ay ne kadar ciro yaparız?"
              className="flex-1 px-3.5 py-2.5 border border-stone-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            />
            <button type="submit" className="px-4 py-2.5 bg-violet-700 hover:bg-violet-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition">
              <Send className="w-3.5 h-3.5" /> Gönder
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
