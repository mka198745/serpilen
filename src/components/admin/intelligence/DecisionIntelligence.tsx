"use client";

/**
 * Karar Zekâsı (FAZ 3) — Merkezi Decision Intelligence katmanı.
 * 9 alt görünüm: Overview / Öneriler / Erken Uyarı / What-if / Monte Carlo /
 * Yönetim Hedefleri / Karar Geçmişi / Karar Etkinliği / Karar Ayarları.
 * Hiçbir FAZ 1/2 API'si değiştirilmedi; tamamen /api/intelligence/decision/* uçları kullanılır.
 * Guardrail: öneri/kayıt yönetir; gerçek fiyat/stok/sipariş kaydına YAZMAZ; yönetici onayı olmadan uygulanmaz.
 */
import React, { useEffect, useState } from "react";
import {
  LayoutDashboard, Sparkles, Siren, SlidersHorizontal, Dices, Target, History, Gauge, Settings,
  Loader2, AlertTriangle, CheckCircle2, RefreshCw, ClipboardList,
} from "lucide-react";
import { authFetch } from "@/lib/client-auth";

const tl = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(n);
const pct = (n: number | null | undefined, digits = 1) => (n == null ? "—" : `%${n.toFixed(digits)}`);
const sigma = (n: number | null | undefined, digits = 2) => (n == null ? "—" : n.toFixed(digits));

type ApiState<T> = { data: T | null; loading: boolean; error: string | null };

function useApi<T>(url: string | null, refreshKey: number): ApiState<T> {
  const [state, setState] = useState<{ key: string | null; data: T | null; error: string | null }>({ key: null, data: null, error: null });
  const currentKey = url == null ? null : `${url}#${refreshKey}`;
  useEffect(() => {
    if (!currentKey) return;
    let alive = true;
    (async () => {
      try {
        const res = await authFetch(url as string, { cache: "no-store" });
        const json = await res.json();
        if (!alive) return;
        if (json.success) setState({ key: currentKey, data: json.data as T, error: null });
        else setState({ key: currentKey, data: null, error: json?.error?.message || "Veri alınamadı." });
      } catch {
        if (alive) setState({ key: currentKey, data: null, error: "Sunucuya ulaşılamadı." });
      }
    })();
    return () => { alive = false; };
  }, [currentKey, url]);
  if (state.key !== currentKey) return { data: null, loading: true, error: null };
  return { data: state.data, loading: false, error: state.error };
}

const card = "rounded-2xl border border-stone-200 bg-white";
const cardPad = `${card} p-4 sm:p-5`;
const h2 = "text-sm font-black text-stone-900";
const sub = "text-[11px] text-stone-500";
const inputCls = "px-3 py-2 border border-stone-300 rounded-xl text-xs bg-white";
const btnPrimary = "flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-700 hover:bg-violet-800 text-white text-xs font-bold transition disabled:opacity-50";
const btnGhost = "flex items-center gap-1.5 px-3 py-2 rounded-xl border border-stone-300 text-stone-700 hover:bg-stone-50 text-xs font-bold transition disabled:opacity-50";
const chip = "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold";
const badge = (tone: "ok" | "warn" | "bad" | "info" | "muted") =>
  ({ ok: `${chip} bg-emerald-100 text-emerald-800`, warn: `${chip} bg-amber-100 text-amber-800`, bad: `${chip} bg-rose-100 text-rose-800`, info: `${chip} bg-sky-100 text-sky-800`, muted: `${chip} bg-stone-100 text-stone-600` }[tone]);
const decisionTypeLabel = (t: string) => ({
  PRICING: "Fiyat", INVENTORY: "Stok", PROCUREMENT: "Satın Alma", SUPPLIER: "Tedarikçi", CAMPAIGN: "Kampanya",
  MARKETING: "Pazarlama", FINANCIAL: "Finans", QUALITY: "Kalite", CUSTOMER: "Müşteri", ASSORTMENT: "Ürün Gamı",
  CASH_FLOW: "Nakit", RETURNS: "İade", FORECAST: "Tahmin", OPERATIONAL: "Operasyon",
} as Record<string, string>)[t] ?? t;
const confTone = (c: number | null | undefined) => (c == null ? badge("muted") : c >= 75 ? badge("ok") : c >= 45 ? badge("warn") : badge("bad"));
const severityBadge = (s: string) => ({ CRITICAL: badge("bad"), HIGH: badge("warn"), MODERATE: badge("info"), LOW: badge("muted") } as Record<string, string>)[s] ?? badge("muted");
const decisionStatusBadge = (s: string) => ({
  RECOMMENDED: badge("info"), UNDER_REVIEW: badge("warn"), APPROVED: badge("ok"), REJECTED: badge("bad"),
  SCHEDULED: badge("info"), IMPLEMENTED: badge("ok"), MONITORING: badge("info"), COMPLETED: badge("ok"),
  EVALUATED: badge("muted"), ARCHIVED: badge("muted"),
} as Record<string, string>)[s] ?? badge("muted");

const SUB_TABS = [
  { id: "overview", label: "Karar Özeti", icon: LayoutDashboard },
  { id: "recommendations", label: "Öneriler", icon: Sparkles },
  { id: "alerts", label: "Erken Uyarı", icon: Siren },
  { id: "whatif", label: "What-if", icon: SlidersHorizontal },
  { id: "montecarlo", label: "Monte Carlo", icon: Dices },
  { id: "goals", label: "Yönetim Hedefleri", icon: Target },
  { id: "history", label: "Karar Geçmişi", icon: History },
  { id: "effectiveness", label: "Etkililik", icon: Gauge },
  { id: "settings", label: "Karar Ayarları", icon: Settings },
] as const;
type SubTabId = (typeof SUB_TABS)[number]["id"];

function Loading() { return <div className="py-10 flex items-center justify-center gap-2 text-stone-500 text-xs"><Loader2 className="w-4 h-4 animate-spin" /> Hesaplanıyor…</div>; }
function ErrorBox({ msg }: { msg: string }) { return <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />{msg}</div>; }
function Empty({ msg }: { msg: string }) { return <div className="py-10 text-center text-xs text-stone-400">{msg}</div>; }

export function DecisionIntelligence({ refreshKey }: { refreshKey: number }) {
  const [tab, setTab] = useState<SubTabId>("overview");
  const [localRefresh, setLocalRefresh] = useState(0);
  const rk = refreshKey + localRefresh * 1000;
  const bump = () => setLocalRefresh((k) => k + 1);
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-violet-100 text-violet-800 shrink-0"><ClipboardList className="w-5 h-5" /></div>
          <div>
            <h3 className="text-sm font-black text-violet-950">Karar Zekâsı — Merkezi Karar Destek Motoru</h3>
            <p className="text-[11px] text-violet-900/80 mt-0.5">FAZ 1 + FAZ 2 verilerini birleştirir: alternatifli değerlendirme, erken uyarı, What-if, Monte Carlo, hedef takibi ve sonuç ölçümü. Otomatik uygulama YOK; her aksiyon yönetici onayından geçer, hepsi audit log’a düşer. Kaynak ticari kayıtlar DEĞİŞTİRİLMEZ.</p>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 p-1.5 rounded-2xl bg-stone-100 border border-stone-200">
        {SUB_TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[10px] font-bold transition ${active ? "bg-white shadow-xs text-violet-900" : "text-stone-500 hover:text-stone-800"}`}>
              <Icon className="w-3.5 h-3.5" /><span className="hidden md:inline">{t.label}</span>
            </button>
          );
        })}
      </div>
      {tab === "overview" && <OverviewTab refreshKey={rk} onChanged={bump} />}
      {tab === "recommendations" && <RecommendationsTab refreshKey={rk} onChanged={bump} />}
      {tab === "alerts" && <AlertsTab refreshKey={rk} onChanged={bump} />}
      {tab === "whatif" && <WhatIfTab refreshKey={rk} />}
      {tab === "montecarlo" && <MonteCarloTab refreshKey={rk} />}
      {tab === "goals" && <GoalsTab refreshKey={rk} onChanged={bump} />}
      {tab === "history" && <HistoryTab refreshKey={rk} onChanged={bump} />}
      {tab === "effectiveness" && <EffectivenessTab refreshKey={rk} />}
      {tab === "settings" && <SettingsTab refreshKey={rk} onChanged={bump} />}
    </div>
  );
}

/* ---------------- 1) KARAR ÖZETİ ---------------- */
function OverviewTab({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const { data, loading, error } = useApi<any>("/api/intelligence/decision/overview", refreshKey);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const runAnalyze = async () => {
    setRunning(true); setMsg(null);
    try {
      const res = await authFetch("/api/intelligence/decision/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const json = await res.json();
      if (json.success) {
        const s = json.data?.summary;
        setMsg({ ok: true, text: `Analiz tamamlandı: ${s?.decisionsCreated ?? 0} yeni karar, ${s?.alertsCreated ?? 0} yeni uyarı, ${s?.conflictsDetected ?? 0} çelişki.` });
        onChanged();
      } else setMsg({ ok: false, text: json?.error?.message || "Analiz çalıştırılamadı." });
    } catch { setMsg({ ok: false, text: "Sunucuya ulaşılamadı." }); }
    finally { setRunning(false); }
  };
  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return <Empty msg="Özet yok." />;
  const sc = data.decisionStatusCounts ?? {};
  const statCard = (label: string, value: React.ReactNode, tone: "ok" | "warn" | "bad" | "info" | "muted" = "info") => (
    <div className={cardPad}><div className={sub}>{label}</div><div className="mt-1 text-xl font-black text-stone-900">{value}</div></div>
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <p className={sub}>Kayıtlı kararların, açık uyarıların ve hedef sağlığının özeti. Gerekirse tam analizi tekrar çalıştırın (idempotenttir; aynı karar anahtarları güncellenir).</p>
        <button onClick={runAnalyze} disabled={running} className={btnPrimary}>{running ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Karar Analizini Çalıştır</button>
      </div>
      {msg && <div className={`p-3 rounded-xl text-xs border ${msg.ok ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-rose-50 border-rose-200 text-rose-800"}`}>{msg.text}</div>}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {statCard("Açık Öneriler", data.openRecommendations ?? 0)}
        {statCard("Onaylanan (tüm zamanlar)", (sc["APPROVED"] ?? 0) + (sc["SCHEDULED"] ?? 0) + (sc["IMPLEMENTED"] ?? 0) + (sc["MONITORING"] ?? 0) + (sc["COMPLETED"] ?? 0) + (sc["EVALUATED"] ?? 0) + (sc["ARCHIVED"] ?? 0))}
        {statCard("Açık Uyarılar", data.openAlerts ?? 0)}
        {statCard("Kritik Uyarı", data.criticalAlerts ?? 0, (data.criticalAlerts ?? 0) > 0 ? "bad" : "ok")}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {statCard("Aktif Hedef", data.activeGoals ?? 0)}
        {statCard("Riskli Hedef (<%50)", data.goalsAtRisk ?? 0, (data.goalsAtRisk ?? 0) > 0 ? "warn" : "ok")}
        {statCard("Ortalama Hedef İlerlemesi", data.avgGoalProgress != null ? pct(data.avgGoalProgress, 0) : "—")}
        {statCard("Karar Başarı Oranı", data.effectiveness?.successRatePct != null ? pct(data.effectiveness.successRatePct) : "ölçüm yok")}
      </div>
      <div className={`${cardPad} flex flex-wrap items-center gap-x-8 gap-y-2`}>
        <div><div className={sub}>Kabul Oranı</div><div className="text-lg font-black">{pct(data.effectiveness?.acceptanceRatePct)}</div></div>
        <div><div className={sub}>Uygulama Oranı</div><div className="text-lg font-black">{pct(data.effectiveness?.implementationRatePct)}</div></div>
        <div><div className={sub}>Finansal Gerçekleşme</div><div className="text-lg font-black">{pct(data.effectiveness?.financialRealizationPct)}</div></div>
        <div><div className={sub}>Toplam Karar Kaydı</div><div className="text-lg font-black">{data.effectiveness?.decisionsTotal ?? 0}</div></div>
      </div>
      <p className={sub}>Yöntem: Weighted Scoring (11 kriter, yönetici ağırlıkları) + Cost-Benefit. En yüksek puan otomatik “en iyi” değildir; hedefler ve kısıtlar dikkate alınır. Onay ≠ uygulama; her kayıt audit log’a yazılır.</p>
    </div>
  );
}

/* ---------------- 2) ÖNERİLER ---------------- */
function RecommendationsTab({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const [status, setStatus] = useState<string>("RECOMMENDED");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data, loading, error } = useApi<any>(`/api/intelligence/decision/recommendations?status=${status}&limit=50`, refreshKey);
  const detail = useApi<any>(selectedId != null ? `/api/intelligence/decision/${selectedId}` : null, refreshKey + (selectedId ?? 0));
  const [acting, setActing] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const act = async (action: "review" | "approve" | "reject" | "implement" | "complete") => {
    if (selectedId == null) return;
    setActing(true); setActionMsg(null);
    try {
      const res = await authFetch(`/api/intelligence/decision/${selectedId}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const json = await res.json();
      setActionMsg(json.success ? `Aksiyon uygulandı: ${json.data?.status ?? action}` : json?.error?.message || "Aksiyon uygulanamadı.");
      onChanged();
    } catch { setActionMsg("Sunucuya ulaşılamadı."); }
    finally { setActing(false); }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
      <div className="xl:col-span-2 space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {["RECOMMENDED", "UNDER_REVIEW", "APPROVED", "SCHEDULED", "IMPLEMENTED", "MONITORING", "COMPLETED", "REJECTED"].map((s) => (
            <button key={s} onClick={() => setStatus(s)} className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition ${status === s ? "bg-violet-700 text-white border-violet-700" : "bg-white text-stone-600 border-stone-200 hover:border-stone-400"}`}>{s}</button>
          ))}
        </div>
        {loading && <Loading />}
        {error && <ErrorBox msg={error} />}
        {!loading && data?.items?.length === 0 && <Empty msg="Bu durumda kayıt yok. FAZ 2 fırsatları oluşturulduysa 'Karar Analizini Çalıştır' ile öneri listesini doldurun." />}
        {data?.items?.map((r: any) => {
          const selected = selectedId === r.id;
          return (
            <button key={r.id} onClick={() => setSelectedId(r.id)} className={`w-full text-left ${cardPad} transition ${selected ? "ring-2 ring-violet-500 border-violet-300" : "hover:border-stone-300"}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-black uppercase text-violet-800">{decisionTypeLabel(r.decisionType)}</span>
                <span className={decisionStatusBadge(r.status)}>{r.status}</span>
                <span className={confTone(r.confidenceLabel === "HIGH" ? 80 : r.confidenceLabel === "MEDIUM" ? 60 : 30)}>Güven: {r.confidenceLabel}</span>
              </div>
              <div className="text-xs font-bold text-stone-900 mt-1.5">{r.title}</div>
              <div className="flex items-center gap-3 mt-1.5 text-[10px] text-stone-500">
                <span>Kâr: <b className={Number(r.expectedProfitImpact) >= 0 ? "text-emerald-700" : "text-rose-700"}>{tl(Number(r.expectedProfitImpact))}</b></span>
                <span>Risk: {Number(r.riskScore).toFixed(0)}</span>
                <span>Kapsam: {pct(Number(r.dataCoverage), 0)}</span>
              </div>
            </button>
          );
        })}
      </div>
      <div className="xl:col-span-3">
        {selectedId == null && <div className={`${cardPad} h-full flex items-center justify-center`}><Empty msg="Detay için listeden bir öneri seçin." /></div>}
        {selectedId != null && (
          detail.loading ? <Loading /> :
          detail.error ? <ErrorBox msg={detail.error} /> :
          detail.data ? (
            <div className="space-y-3">
              <div className={cardPad}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h4 className="text-sm font-black text-stone-900">{detail.data.title}</h4>
                  <span className={decisionStatusBadge(detail.data.status)}>{detail.data.status}</span>
                </div>
                <p className="text-[11px] text-stone-600 mt-1">{detail.data.recommendationSummary}</p>
                <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-[11px]">
                  <span className={sub}>Kapsama: <b>{pct(Number(detail.data.dataCoverage), 0)}</b></span>
                  <span className={sub}>İstatistiksel güven: <b>{detail.data.statisticalConfidence != null ? pct(Number(detail.data.statisticalConfidence), 0) : "hesaplanmadı"}</b></span>
                  <span className={sub}>Yöntem: {detail.data.methodNote}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  <button disabled={acting} onClick={() => act("review")} className={btnGhost}>İncelemeye Al</button>
                  <button disabled={acting} onClick={() => act("approve")} className={btnPrimary}><CheckCircle2 className="w-4 h-4" /> Onayla</button>
                  <button disabled={acting} onClick={() => act("implement")} className={btnGhost}>Uygulandı İşaretle</button>
                  <button disabled={acting} onClick={() => act("complete")} className={btnGhost}>Tamamla</button>
                  <button disabled={acting} onClick={() => act("reject")} className="px-3 py-2 rounded-xl border border-rose-300 text-rose-700 hover:bg-rose-50 text-xs font-bold">Reddet</button>
                </div>
                {actionMsg && <div className="mt-2 text-[11px] text-stone-700 bg-stone-50 border border-stone-200 rounded-lg px-2 py-1.5">{actionMsg}</div>}
                <p className={`${sub} mt-2`}>Onay ≠ uygulama. Her aksiyon audit log’a yazılır; ticari kayıtlar değişmez.</p>
              </div>
              <div className={cardPad}>
                <h5 className="text-[11px] font-black text-stone-700 uppercase tracking-wide">Alternatifler</h5>
                <div className="mt-2 space-y-2">
                  {detail.data.alternatives?.slice().sort((a: any, b: any) => (a.rank ?? 99) - (b.rank ?? 99)).map((a: any) => (
                    <div key={a.id ?? a.kind} className="border border-stone-200 rounded-xl p-2.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="text-xs font-bold text-stone-800">#{a.rank ?? "—"} {a.label} {a.kind === "CURRENT_STATE" && <span className={badge("muted")}>mevcut</span>}</div>
                        <div className="text-[10px] font-black">{a.score != null ? `${Number(a.score).toFixed(1)}/100` : "puanlanamadı"}</div>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-[10px] text-stone-500">
                        <span>Kâr: <b>{a.expectedProfit != null ? tl(Number(a.expectedProfit)) : "—"}</b></span>
                        <span>Nakit: {a.cashNeed != null ? tl(Number(a.cashNeed)) : "—"}</span>
                        <span>Risk: {a.riskScore != null ? Math.round(Number(a.riskScore)) : "—"}</span>
                        <span>Süre: {a.implementationDays != null ? `${a.implementationDays}g` : "—"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {detail.data.explanation && (
                <details className={cardPad}>
                  <summary className="text-[11px] font-black text-stone-700 cursor-pointer select-none">Explanation Report (tam gerekçe)</summary>
                  <pre className="mt-2 text-[10px] whitespace-pre-wrap text-stone-600 font-mono">{detail.data.explanation}</pre>
                </details>
              )}
            </div>
          ) : <Empty msg="Detay yok." />
        )}
      </div>
    </div>
  );
}

/* ---------------- 3) ERKEN UYARI ---------------- */
function AlertsTab({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const [status, setStatus] = useState("OPEN");
  const [category, setCategory] = useState("");
  const { data, loading, error } = useApi<any>(`/api/intelligence/decision/early-warning?status=${status}${category ? `&category=${category}` : ""}&limit=100`, refreshKey);
  const [scanning, setScanning] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const act = async (id: number, action: "acknowledge" | "investigate" | "action_required" | "resolve" | "false-positive") => {
    const effective = action.replace("action_required", "action-required");
    try {
      const res = await authFetch(`/api/intelligence/decision/early-warning/${id}/${effective}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const json = await res.json();
      setMsg(json.success ? "Aksiyon uygulandı." : json?.error?.message || "Aksiyon uygulanamadı.");
      onChanged();
    } catch { setMsg("Sunucuya ulaşılamadı."); }
  };
  const scan = async () => {
    setScanning(true); setMsg(null);
    try {
      const res = await authFetch("/api/intelligence/decision/early-warning/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const json = await res.json();
      setMsg(json.success ? `Tarama tamamlandı: ${json.data?.summary?.alertsCreated ?? 0} yeni uyarı, ${json.data?.summary?.alertsUpdated ?? 0} tekrar güncellendi.` : json?.error?.message || "Tarama başarısız.");
      onChanged();
    } catch { setMsg("Sunucuya ulaşılamadı."); }
    finally { setScanning(false); }
  };
  const CATEGORIES = ["", "FINANCIAL", "SALES", "INVENTORY", "SUPPLIER", "MARKETING", "QUALITY", "OPERATIONAL"];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap gap-1.5">
          {["OPEN", "NEW", "ACKNOWLEDGED", "INVESTIGATING", "ACTION_REQUIRED", "RESOLVED", "FALSE_POSITIVE", "EXPIRED", "ALL"].map((s) => (
            <button key={s} onClick={() => setStatus(s)} className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold border ${status === s ? "bg-violet-700 text-white border-violet-700" : "bg-white text-stone-600 border-stone-200"}`}>{s}</button>
          ))}
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c || "Tüm kategoriler"}</option>)}
          </select>
        </div>
        <button onClick={scan} disabled={scanning} className={btnPrimary}>{scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Uyarıları Tara</button>
      </div>
      {msg && <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200 text-[11px] text-stone-700">{msg}</div>}
      {loading && <Loading />}
      {error && <ErrorBox msg={error} />}
      {!loading && data?.items?.length === 0 && <Empty msg="Açık uyarı yok. 'Uyarıları Tara' ile FAZ 1+2 verilerini tarayın." />}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {data?.items?.map((a: any) => (
          <div key={a.id} className={`${cardPad} ${a.severity === "CRITICAL" ? "border-rose-300" : ""}`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className={severityBadge(a.severity)}>{a.severity}</span>
                <span className="text-[9px] font-bold uppercase text-stone-500">{a.category}</span>
                {a.occurrenceCount > 1 && <span className={badge("warn")}>×{a.occurrenceCount}</span>}
              </div>
              <div className="text-[11px] font-black text-stone-800">Risk {Math.round(a.riskScore)}<span className="text-stone-400 font-bold"> /100</span></div>
            </div>
            <div className="text-xs font-bold text-stone-900 mt-1.5">{a.relatedEntityLabel || a.alertType}</div>
            <p className="text-[11px] text-stone-600 mt-0.5">{a.triggerCondition}</p>
            {a.recommendedAction && <p className="text-[10px] text-violet-900 mt-1.5 bg-violet-50 border border-violet-100 rounded-lg px-2 py-1.5"><b>Önerilen aksiyon: </b>{a.recommendedAction}</p>}
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5 text-[10px] text-stone-500">
              {a.observedValue != null && <span>Gözlenen: <b>{Number(a.observedValue).toFixed(2)}</b></span>}
              {a.expectedValue != null && <span>Beklenen: <b>{Number(a.expectedValue).toFixed(2)}</b></span>}
              {a.deviationPct != null && <span>Sapma: <b>{pct(a.deviationPct)}</b></span>}
              {a.potentialFinancialImpact != null && <span>Potansiyel Etki: <b>{tl(a.potentialFinancialImpact)}</b></span>}
              <span>Güven: <b>{pct(a.confidence, 0)}</b></span>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <button onClick={() => act(a.id, "acknowledge")} className={btnGhost}>Gördüm</button>
              <button onClick={() => act(a.id, "investigate")} className={btnGhost}>İncele</button>
              <button onClick={() => act(a.id, "action_required")} className={btnGhost}>Aksiyon Gerekiyor</button>
              <button onClick={() => act(a.id, "resolve")} className={btnPrimary}><CheckCircle2 className="w-4 h-4" /> Çözüldü</button>
              <button onClick={() => act(a.id, "false-positive")} className="px-3 py-2 rounded-xl border border-stone-300 text-stone-600 text-[11px] font-bold">Yanlış Alarm</button>
            </div>
          </div>
        ))}
      </div>
      <p className={sub}>Bildirim altyapısı kurulu değil — uyarılar yalnız bu panelde görünür (bilinçli tasarım). Aynı koşul tekrarlanırsa yeni kayıt açılmaz; occurrenceCount artar ve 3. tekrarda severity bir kademe yükselir.</p>
    </div>
  );
}

/* ---------------- 4) WHAT-IF ---------------- */
const SCENARIO_PRESETS: Record<string, { label: string; defaults: Record<string, number | null>; help: string }> = {
  PRICING: { label: "Fiyat", defaults: { priceDeltaPct: 10, elasticityPctPerPct: null }, help: "priceDeltaPct: fiyat değişimi % (örn. 10). elasticityPctPerPct: talep esnekliği (örn. -0.8); boşsa sabit talep varsayılır (etiketli)." },
  SALES: { label: "Satış/Talep", defaults: { demandDeltaPct: 15, avgOrderValueDeltaPct: 0 }, help: "demandDeltaPct: talep değişimi %. avgOrderValueDeltaPct: sepet değeri değişimi %." },
  PROCUREMENT: { label: "Satın Alma", defaults: { quantityDeltaPct: 0, unitCostDeltaPct: 5, leadTimeDeltaDays: 7 }, help: "quantityDeltaPct: alım miktarı değişimi %. unitCostDeltaPct: alış fiyatı değişimi %. leadTimeDeltaDays: gecikme (gün)." },
  MARKETING: { label: "Pazarlama", defaults: { budgetDeltaPct: 25, expectedRoas: 2.0 }, help: "budgetDeltaPct: bütçe değişimi %. expectedRoas: beklenen ROAS (boşsa mevcut atfedilen ROAS varsayılır)." },
  INVENTORY: { label: "Stok", defaults: { targetCoverDays: 21, holdingCostPctYear: 25 }, help: "targetCoverDays: hedef kaplama günü. holdingCostPctYear: yıllık stok tutma maliyeti %." },
  FINANCIAL: { label: "Finans", defaults: { budgetDelta: 50000, expectedReturnPct: null }, help: "budgetDelta: ek bütçe/nakit (TL). expectedReturnPct: beklenen getiri % (boşsa yalnız nakit etkisi raporlanır)." },
};

function WhatIfTab({ refreshKey }: { refreshKey: number }) {
  const [category, setCategory] = useState("PRICING");
  const [name, setName] = useState("");
  const [scopeType, setScopeType] = useState<"STORE" | "PRODUCT">("STORE");
  const [scopeId, setScopeId] = useState("");
  const [params, setParams] = useState<string>(JSON.stringify(SCENARIO_PRESETS.PRICING.defaults, null, 1));
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [result, setResult] = useState<any>(null);
  const [localKey, setLocalKey] = useState(0);
  const listState = useApi<any>("/api/intelligence/decision/simulations", refreshKey + localKey);

  const submit = async () => {
    setRunning(true); setMsg(null); setResult(null);
    try {
      const parsed = JSON.parse(params);
      const res = await authFetch("/api/intelligence/decision/simulations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || `${SCENARIO_PRESETS[category].label} senaryosu`,
          category,
          scopeType,
          scopeId: scopeType === "PRODUCT" && scopeId ? Number(scopeId) : null,
          parameters: parsed,
          periodDays: 90,
          run: true,
        }),
      });
      const json = await res.json();
      if (json.success) { setResult(json.data?.result ?? null); setMsg({ ok: true, text: `Senaryo kaydedildi ve çalıştırıldı (id #${json.data?.id}).` }); setLocalKey((k) => k + 1); }
      else setMsg({ ok: false, text: json?.error?.message || "Senaryo çalıştırılamadı." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof SyntaxError ? "Parametreler geçerli JSON değil." : "Sunucuya ulaşılamadı." });
    } finally { setRunning(false); }
  };

  const cat = SCENARIO_PRESETS[category];
  const r = result;
  return (
    <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
      <div className={`${cardPad} xl:col-span-2 space-y-2`}>
        <h4 className={h2}>Senaryo Oluştur & Çalıştır</h4>
        <p className={sub}>Gerçek kayıtlar DEĞİŞTİRİLMEZ — yalnız analiz üretilir. Best/Worst, kullanıcı aralığı verilmediyse VARSAYIMSAL ±10% bant olarak etiketlenir.</p>
        <div className="grid grid-cols-2 gap-2">
          <label className={sub}>Kategori<select className={`${inputCls} w-full mt-1`} value={category} onChange={(e) => { const c = e.target.value; setCategory(c); setParams(JSON.stringify(SCENARIO_PRESETS[c].defaults, null, 1)); }}>
            {Object.entries(SCENARIO_PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select></label>
          <label className={sub}>Kapsam<select className={`${inputCls} w-full mt-1`} value={scopeType} onChange={(e) => setScopeType(e.target.value as "STORE" | "PRODUCT")}>
            <option value="STORE">Mağaza geneli</option><option value="PRODUCT">Ürün (id)</option>
          </select></label>
        </div>
        {scopeType === "PRODUCT" && <input className={`${inputCls} w-full`} placeholder="Ürün id (örn. 12)" value={scopeId} onChange={(e) => setScopeId(e.target.value)} />}
        <input className={`${inputCls} w-full`} placeholder="Senaryo adı" value={name} onChange={(e) => setName(e.target.value)} />
        <label className={sub}>Parametreler (JSON)
          <textarea className={`${inputCls} w-full mt-1 font-mono text-[10px]`} rows={6} value={params} onChange={(e) => setParams(e.target.value)} />
        </label>
        <p className={sub}>{cat.help}</p>
        <button onClick={submit} disabled={running} className={btnPrimary}>{running ? <Loader2 className="w-4 h-4 animate-spin" /> : <SlidersHorizontal className="w-4 h-4" />} Çalıştır</button>
        {msg && <div className={`p-2.5 rounded-xl text-[11px] border ${msg.ok ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-rose-50 border-rose-200 text-rose-800"}`}>{msg.text}</div>}
      </div>
      <div className="xl:col-span-3 space-y-3">
        {r ? (
          <div className={cardPad}>
            <h4 className={h2}>Sonuç — {r.category}</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-[11px]">
              <div><div className={sub}>Ciro (beklenen)</div><b>{tl(r.expected?.netSales)}</b></div>
              <div><div className={sub}>Katkı kârı</div><b>{tl(r.expected?.contributionProfit)}</b></div>
              <div><div className={sub}>Marj</div><b>{pct(r.expected?.contributionMarginPct)}</b></div>
              <div><div className={sub}>Risk</div><b>{r.riskScore ?? "—"}</b></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2 text-[10px]">
              <div className="border rounded-xl p-2"><div className={sub}>Base (mevcut)</div>Ciro {tl(r.baseline?.netSales)} · Kâr {tl(r.baseline?.contributionProfit)}</div>
              <div className="border border-emerald-200 rounded-xl p-2"><div className={sub}>Best{r.bestCaseLabel ? ` — ${r.bestCaseLabel}` : ""}</div>{r.best ? <>Ciro {tl(r.best?.netSales)} · Kâr {tl(r.best?.contributionProfit)}</> : "hesaplanmadı"}</div>
              <div className="border border-rose-200 rounded-xl p-2"><div className={sub}>Worst{r.worstCaseLabel ? ` — ${r.worstCaseLabel}` : ""}</div>{r.worst ? <>Ciro {tl(r.worst?.netSales)} · Kâr {tl(r.worst?.contributionProfit)}</> : "hesaplanmadı"}</div>
            </div>
            <div className="mt-2 text-[10px] text-stone-500"><b>Delta:</b> Ciro {tl(r.financialImpact?.revenueDelta)} · Kâr {tl(r.financialImpact?.profitDelta)} · Nakit {tl(r.financialImpact?.cashDelta)}</div>
            {Array.isArray(r.assumptions) && r.assumptions.length > 0 && (
              <details className="mt-2 text-[10px] text-stone-500"><summary className="cursor-pointer font-bold">Varsayımlar ({r.assumptions.length})</summary><ul className="list-disc pl-4 mt-1">{r.assumptions.map((a: string, i: number) => <li key={i}>{a}</li>)}</ul></details>
            )}
          </div>
        ) : <div className={`${cardPad} flex items-center justify-center`}><Empty msg="Soldan bir senaryo çalıştırın; sonuç burada görünür." /></div>}
        <div className={cardPad}>
          <h4 className={h2}>Kayıtlı Senaryolar (son 50)</h4>
          {listState.loading && <Loading />}
          {listState.data?.items?.length === 0 && <Empty msg="Henüz senaryo kaydı yok." />}
          <div className="mt-2 space-y-1.5 max-h-64 overflow-y-auto">
            {listState.data?.items?.map((sc: any) => (
              <div key={sc.id} className="flex items-center justify-between gap-2 text-[11px] border border-stone-100 rounded-lg px-2 py-1.5">
                <div><b>#{sc.id}</b> {sc.name} <span className="text-stone-400">· {sc.category}</span></div>
                <span className="text-[9px] text-stone-400">{String(sc.createdAt).slice(0, 16).replace("T", " ")}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- 5) MONTE CARLO ---------------- */
const MC_PRESET_VARIABLES = JSON.stringify([
  { name: "price", distribution: { type: "normal", params: { mean: 100, stddev: 5 } }, observationCount: 60, rationale: "Son 60 gün fiyat ortalaması" },
  { name: "cost", distribution: { type: "lognormal", params: { mu: 3.69, sigma: 0.12 } }, observationCount: 60, rationale: "Alış fiyatı dağılımı (lognormal)" },
  { name: "units", distribution: { type: "triangular", params: { min: 8, mode: 12, max: 20 } }, observationCount: 60, rationale: "Günlük adet — min/mod/max" },
], null, 1);
const MC_PRESET_FORMULA = "(price - cost) * units";

function MonteCarloTab({ refreshKey }: { refreshKey: number }) {
  const [localKey, setLocalKey] = useState(0);
  const listState = useApi<any>("/api/intelligence/decision/monte-carlo", refreshKey + localKey);
  const [name, setName] = useState("Katkı kârı simülasyonu");
  const [kind, setKind] = useState("CONTRIBUTION");
  const [iterations, setIterations] = useState("2000");
  const [seed, setSeed] = useState("42");
  const [formula, setFormula] = useState(MC_PRESET_FORMULA);
  const [variables, setVariables] = useState(MC_PRESET_VARIABLES);
  const [correlation, setCorrelation] = useState(""); // boş = bağımsızlık varsayımı (raporlanır)
  const [targetValue, setTargetValue] = useState("");
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [result, setResult] = useState<any>(null);
  const submit = async () => {
    setRunning(true); setMsg(null); setResult(null);
    try {
      const parsedVars = JSON.parse(variables);
      const body: Record<string, unknown> = {
        name: name.trim() || "Monte Carlo koşusu",
        kind,
        iterations: Number(iterations),
        seed: Number(seed),
        outputFormula: formula.trim(),
        variables: parsedVars,
      };
      if (correlation.trim()) body.correlation = JSON.parse(correlation);
      if (targetValue.trim() && Number.isFinite(Number(targetValue))) body.target = { value: Number(targetValue), direction: "ABOVE" };
      const res = await authFetch("/api/intelligence/decision/monte-carlo/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (json.success) { setResult(json.data?.result ?? null); setMsg({ ok: true, text: `Çalıştırma tamam (kayıt #${json.data?.id}, seed ${json.data?.seed}).` }); setLocalKey((k) => k + 1); }
      else setMsg({ ok: false, text: json?.error?.message || "Monte Carlo çalıştırılamadı." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof SyntaxError ? "Değişkenler/Korelasyon geçerli JSON değil." : "Sunucuya ulaşılamadı." });
    } finally { setRunning(false); }
  };

  const r = result;
  const rel = r?.reliability;
  return (
    <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
      <div className={`${cardPad} xl:col-span-2 space-y-2`}>
        <h4 className={h2}>Monte Carlo Çalıştır</h4>
        <p className={sub}>Dağılım seçimi size aittir — otomatik/kontrolsüz dağılım seçilmez. Korelasyon matrisi boşsa değişkenler BAĞIMSIZ varsayılır ve sonuçlarda açıkça raporlanır (varsayımı kabul etmek sizin kararınızdır). Max 10.000 iterasyon.</p>
        <div className="grid grid-cols-2 gap-2">
          <label className={sub}>İsim<input className={`${inputCls} w-full mt-1`} value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className={sub}>Tür<select className={`${inputCls} w-full mt-1`} value={kind} onChange={(e) => setKind(e.target.value)}>
            {["CONTRIBUTION", "PRICE", "COST", "DEMAND", "LEAD_TIME", "CAMPAIGN", "PROCUREMENT"].map((k) => <option key={k} value={k}>{k}</option>)}
          </select></label>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <label className={sub}>İterasyon<input className={`${inputCls} w-full mt-1`} type="number" min={100} max={10000} step={100} value={iterations} onChange={(e) => setIterations(e.target.value)} /></label>
          <label className={sub}>Seed<input className={`${inputCls} w-full mt-1`} type="number" value={seed} onChange={(e) => setSeed(e.target.value)} /></label>
          <label className={sub}>Hedef ≥<input className={`${inputCls} w-full mt-1`} type="number" placeholder="ör. 500" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} /></label>
        </div>
        <label className={sub}>Değişkenler (JSON — dağılım + parametre + kaynak + gerekçe)
          <textarea className={`${inputCls} w-full mt-1 font-mono text-[10px]`} rows={9} value={variables} onChange={(e) => setVariables(e.target.value)} />
        </label>
        <label className={sub}>Çıkış formülü<input className={`${inputCls} w-full mt-1 font-mono`} value={formula} onChange={(e) => setFormula(e.target.value)} /></label>
        <label className={sub}>Korelasyon matrisi (opsiyonel, variables sırasıyla; boş = bağımsızlık)
          <textarea className={`${inputCls} w-full mt-1 font-mono text-[10px]`} rows={3} placeholder="[[1, 0.6, 0.1], [0.6, 1, 0.2], [0.1, 0.2, 1]]" value={correlation} onChange={(e) => setCorrelation(e.target.value)} />
        </label>
        <button onClick={submit} disabled={running} className={btnPrimary}>{running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Dices className="w-4 h-4" />} Çalıştır (seed={seed})</button>
        {msg && <div className={`p-2.5 rounded-xl text-[11px] border ${msg.ok ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-rose-50 border-rose-200 text-rose-800"}`}>{msg.text}</div>}
      </div>
      <div className="xl:col-span-3 space-y-3">
        {r ? (
          <div className={cardPad}>
            <h4 className={h2}>Sonuç — {rel?.iterations} iterasyon, seed {rel?.seed}</h4>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mt-2 text-center text-[10px]">
              {[["Ortalama", r.mean], ["Medyan", r.median], ["±Std", r.stddev], ["Min", r.min], ["P5", r.p5], ["P95", r.p95]].map(([l, v]) => (
                <div key={String(l)} className="border rounded-xl p-2"><div className={sub}>{l}</div><div className="text-sm font-black">{Number(v).toFixed(1)}</div></div>
              ))}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-center text-[10px]">
              {[["P10", r.p10], ["P25", r.p25], ["P75", r.p75], ["P90", r.p90]].map(([l, v]) => (
                <div key={String(l)} className="border rounded-xl p-2"><div className={sub}>{l}</div><div className="text-sm font-black">{Number(v).toFixed(1)}</div></div>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-[11px]">
              <span>P(zarar) <b>{r.probLoss != null ? pct(r.probLoss * 100) : "—"}</b></span>
              {r.probTarget != null && <span>P(hedef ≥) <b>{pct(r.probTarget * 100)}</b></span>}
              <span>Yakınsama <b>{rel?.converged ? "OK (%1)" : "Zayıf — daha fazla iterasyon deneyin"}</b></span>
              <span>Korelasyon <b>{rel?.correlationUsed ? "kullanıldı" : "bağımsızlık varsayıldı"}</b></span>
            </div>
            {rel?.correlationDisclaimer && <p className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 mt-2">{rel.correlationDisclaimer}</p>}
            {Array.isArray(r.sensitivity) && r.sensitivity.length > 0 && (
              <div className="mt-2"><div className={sub}>Duyarlılık (Pearson |r|)</div>
                {r.sensitivity.map((s: any) => (
                  <div key={s.variable} className="flex items-center gap-2 mt-1">
                    <span className="w-16 text-[10px] font-mono">{s.variable}</span>
                    <div className="flex-1 h-2 rounded-full bg-stone-100 overflow-hidden"><div className="h-full bg-violet-500" style={{ width: `${Math.min(100, s.absPearson * 100)}%` }} /></div>
                    <span className="text-[10px] w-10 text-right">{s.absPearson.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
            {Array.isArray(rel?.warnings) && rel.warnings.length > 0 && (
              <details className="mt-2 text-[10px] text-amber-800"><summary className="cursor-pointer font-bold">Uyarılar ({rel.warnings.length})</summary><ul className="list-disc pl-4 mt-1">{rel.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}</ul></details>
            )}
            <p className={`${sub} mt-2`}>Bu bir SIMÜLASYONDUR, kesin tahmin değildir. Varsayımlar açıkça listelenir; varsayımlar değişirse sonuçlar değişir.</p>
          </div>
        ) : (
          <div className={cardPad}>
            <h4 className={h2}>Kayıtlı Çalıştırmalar</h4>
            {listState.loading && <Loading />}
            {listState.data?.items?.length === 0 && <Empty msg="Henüz Monte Carlo kaydı yok." />}
            <div className="mt-2 space-y-1.5 max-h-96 overflow-y-auto">
              {listState.data?.items?.map((run: any) => (
                <div key={run.id} className="border border-stone-100 rounded-lg px-2 py-1.5 text-[10px] flex items-center justify-between gap-2">
                  <div><b>#{run.id}</b> {run.name} · seed {run.seed} · {run.iterations} iter <span className="text-stone-400">· ort {Number(run.results?.mean ?? 0).toFixed(1)}</span></div>
                  <span className="text-[9px] text-stone-400">{String(run.createdAt).slice(0, 16).replace("T", " ")}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {result && listState.data?.items?.length > 0 && (
          <p className={sub}>Kayıtlar listelendi — sayfayı yenilemek için sekmeyi değiştirin. Ham örneklemler saklanmaz; yalnız parametreler + özet saklanır.</p>
        )}
      </div>
    </div>
  );
}

/* ---------------- 6) YÖNETİM HEDEFLERİ ---------------- */
const KPI_OPTIONS: Array<{ value: string; label: string; category: string }> = [
  { value: "REVENUE", label: "Ciro", category: "FINANCIAL" },
  { value: "GROSS_PROFIT", label: "Brüt kâr", category: "FINANCIAL" },
  { value: "CONTRIBUTION_MARGIN", label: "Katkı marjı %", category: "FINANCIAL" },
  { value: "ROAS", label: "ROAS", category: "FINANCIAL" },
  { value: "REVENUE", label: "Ciro", category: "SALES" },
  { value: "ORDER_COUNT", label: "Sipariş adedi", category: "SALES" },
  { value: "AVG_ORDER_VALUE", label: "Ortalama sipariş", category: "SALES" },
  { value: "GROSS_PROFIT", label: "Brüt kâr", category: "SALES" },
  { value: "CONTRIBUTION_MARGIN", label: "Katkı marjı %", category: "SALES" },
  { value: "DEAD_STOCK_VALUE", label: "Ölü stok değeri", category: "INVENTORY" },
  { value: "FILL_RATE_PCT", label: "Fill rate %", category: "INVENTORY" },
  { value: "FILL_RATE_PCT", label: "Fill rate %", category: "PROCUREMENT" },
  { value: "ON_TIME_PCT", label: "Zamanında teslim %", category: "PROCUREMENT" },
  { value: "DEAD_STOCK_VALUE", label: "Ölü stok değeri", category: "PROCUREMENT" },
  { value: "ROAS", label: "ROAS", category: "MARKETING" },
  { value: "REVENUE", label: "Ciro", category: "MARKETING" },
  { value: "ORDER_COUNT", label: "Sipariş adedi", category: "MARKETING" },
  { value: "AVG_ORDER_VALUE", label: "Ortalama sipariş", category: "MARKETING" },
  { value: "RETURN_RATE", label: "İade oranı %", category: "QUALITY" },
];
const KPI_LABELS: Record<string, string> = { REVENUE: "Ciro", ORDER_COUNT: "Sipariş adedi", AVG_ORDER_VALUE: "Ortalama sipariş", GROSS_PROFIT: "Brüt kâr", CONTRIBUTION_MARGIN: "Katkı marjı %", RETURN_RATE: "İade oranı %", ROAS: "ROAS", DEAD_STOCK_VALUE: "Ölü stok değeri", FILL_RATE_PCT: "Fill rate %", ON_TIME_PCT: "Zamanında teslim %" };
const CATEGORY_KPIS: Record<string, string[]> = { FINANCIAL: ["REVENUE", "GROSS_PROFIT", "CONTRIBUTION_MARGIN", "ROAS"], SALES: ["REVENUE", "ORDER_COUNT", "AVG_ORDER_VALUE", "GROSS_PROFIT", "CONTRIBUTION_MARGIN"], INVENTORY: ["DEAD_STOCK_VALUE", "FILL_RATE_PCT"], PROCUREMENT: ["FILL_RATE_PCT", "ON_TIME_PCT", "DEAD_STOCK_VALUE"], MARKETING: ["ROAS", "REVENUE", "ORDER_COUNT", "AVG_ORDER_VALUE"], QUALITY: ["RETURN_RATE"] };
const GOAL_CATEGORIES = ["FINANCIAL", "SALES", "INVENTORY", "PROCUREMENT", "MARKETING", "QUALITY"];

function GoalsTab({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const { data, loading, error } = useApi<any>("/api/intelligence/decision/goals", refreshKey);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("SALES");
  const [kpi, setKpi] = useState("REVENUE");
  const [unit, setUnit] = useState("TL");
  const [baseline, setBaseline] = useState("");
  const [target, setTarget] = useState("");
  const [direction, setDirection] = useState<"HIGHER_BETTER" | "LOWER_BETTER">("HIGHER_BETTER");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10));
  const [priority, setPriority] = useState("MEDIUM");
  const [responsibleUser, setResponsibleUser] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [measuringId, setMeasuringId] = useState<number | null>(null);

  const create = async () => {
    setSaving(true); setMsg(null);
    try {
      const res = await authFetch("/api/intelligence/decision/goals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        name: name.trim(), category, kpi, unit, baselineValue: baseline === "" ? null : Number(baseline), targetValue: Number(target), direction,
        startDate, endDate, priority, responsibleUser: responsibleUser.trim() || null, measurementMethod: "AUTO",
      }) });
      const json = await res.json();
      if (json.success) { setMsg({ ok: true, text: `Hedef oluşturuldu (#${json.data?.id}).` }); setShowCreate(false); setName(""); setTarget(""); setBaseline(""); onChanged(); }
      else setMsg({ ok: false, text: json?.error?.message || "Hedef oluşturulamadı." });
    } catch { setMsg({ ok: false, text: "Sunucuya ulaşılamadı." }); }
    finally { setSaving(false); }
  };
  const measure = async (id: number) => {
    setMeasuringId(id);
    try { await authFetch(`/api/intelligence/decision/goals/${id}/measure`, { method: "POST" }); } finally { setMeasuringId(null); onChanged(); }
  };
  const evaluate = async (id: number) => {
    await authFetch(`/api/intelligence/decision/goals/${id}/evaluate`, { method: "POST" });
    onChanged();
  };

  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;
  const goals: any[] = data?.goals ?? [];
  const conflicts: any[] = data?.conflicts ?? [];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={sub}>AUTO hedefler gerçek veriden ölçülür (fiyat/stok/sipariş kaydı değişmez). Forecast için en az 14 günlük seri gerekir — yoksa TAHMİN ÜRETİLMEZ.</p>
        <button onClick={() => setShowCreate((v) => !v)} className={btnPrimary}><Target className="w-4 h-4" /> Yeni Hedef</button>
      </div>
      {msg && <div className={`p-2.5 rounded-xl text-[11px] border ${msg.ok ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-rose-50 border-rose-200 text-rose-800"}`}>{msg.text}</div>}
      {showCreate && (
        <div className={`${cardPad} grid grid-cols-2 md:grid-cols-4 gap-2`}>
          <input className={`${inputCls} col-span-2 md:col-span-4`} placeholder="Hedef adı (örn. 'Ciro 2M TL')" value={name} onChange={(e) => setName(e.target.value)} />
          <select className={inputCls} value={category} onChange={(e) => { const c = e.target.value; setCategory(c); setKpi(CATEGORY_KPIS[c][0]); }}>{GOAL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          <select className={inputCls} value={kpi} onChange={(e) => setKpi(e.target.value)}>{(CATEGORY_KPIS[category] ?? []).map((k) => <option key={k} value={k}>{KPI_LABELS[k] ?? k}</option>)}</select>
          <input className={inputCls} placeholder="Birim (TL/%/adet/x)" value={unit} onChange={(e) => setUnit(e.target.value)} />
          <select className={inputCls} value={priority} onChange={(e) => setPriority(e.target.value)}><option value="LOW">Düşük</option><option value="MEDIUM">Orta</option><option value="HIGH">Yüksek</option></select>
          <input className={inputCls} type="number" placeholder="Baseline" value={baseline} onChange={(e) => setBaseline(e.target.value)} />
          <input className={inputCls} type="number" placeholder="Hedef" value={target} onChange={(e) => setTarget(e.target.value)} />
          <select className={inputCls} value={direction} onChange={(e) => setDirection(e.target.value as "HIGHER_BETTER" | "LOWER_BETTER")}><option value="HIGHER_BETTER">↑ Yüksek iyi</option><option value="LOWER_BETTER">↓ Düşük iyi</option></select>
          <input className={inputCls} placeholder="Sorumlu (opsiyonel)" value={responsibleUser} onChange={(e) => setResponsibleUser(e.target.value)} />
          <input className={inputCls} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <input className={inputCls} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          <div className="col-span-2 flex gap-2"><button onClick={create} disabled={saving || !name.trim() || !target} className={btnPrimary}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}Kaydet</button><button onClick={() => setShowCreate(false)} className={btnGhost}>Vazgeç</button></div>
        </div>
      )}
      {conflicts.length > 0 && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
          <div className="flex items-center gap-1.5 text-amber-900 text-[11px] font-black"><AlertTriangle className="w-4 h-4" /> Hedef Çelişkileri ({conflicts.length})</div>
          {conflicts.map((c, i) => <div key={i} className="text-[10px] text-amber-900 mt-1">• <b>{c.goalAName}</b> ↔ <b>{c.goalBName}</b>: {c.explanation}</div>)}
        </div>
      )}
      {goals.length === 0 && <Empty msg="Henüz hedef yok. 'Yeni Hedef' ile başlayın — en iyi pratik: ciro + marj + ölü stok üçlüsü." />}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {goals.map((g: any) => {
          const pctVal = g.progressPct != null ? Math.min(150, Math.max(0, g.progressPct)) : null;
          return (
            <div key={g.id} className={cardPad}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2"><span className="text-[9px] font-black uppercase text-violet-800">{g.category}</span><span className={g.status === "ACTIVE" ? badge("info") : g.status === "ACHIEVED" ? badge("ok") : badge("muted")}>{g.status}</span>{g.priority === "HIGH" && <span className={badge("warn")}>YÜKSEK</span>}</div>
                <div className="flex gap-1.5">
                  <button onClick={() => measure(g.id)} disabled={measuringId === g.id} className={btnGhost}>{measuringId === g.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Ölç</button>
                  <button onClick={() => evaluate(g.id)} className={btnGhost}>Değerlendir</button>
                </div>
              </div>
              <div className="text-xs font-bold text-stone-900 mt-1.5">{g.name}</div>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-stone-500 mt-1">
                <span>KPI: <b>{g.kpi}</b></span>
                <span>Hedef: <b>{g.targetValue} {g.unit}</b> ({g.direction === "HIGHER_BETTER" ? "↑" : "↓"})</span>
                <span>Mevcut: <b>{g.currentValue ?? "ölçülmedi"} {g.unit}</b></span>
                <span>Kalan: <b>{g.remaining ?? "—"}</b></span>
                <span>Bitiş: {g.endDate} ({g.daysRemaining}g)</span>
              </div>
              <div className="mt-2 h-2.5 rounded-full bg-stone-100 overflow-hidden"><div className={`h-full ${pctVal != null && pctVal >= 100 ? "bg-emerald-500" : pctVal != null && pctVal < 50 ? "bg-amber-500" : "bg-violet-500"}`} style={{ width: `${Math.min(100, pctVal ?? 0)}%` }} /></div>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-[10px] text-stone-500">
                <span>İlerleme: <b>{g.progressPct != null ? pct(g.progressPct, 0) : "—"}</b></span>
                <span>Tahmin: <b>{g.forecast?.projected != null ? `${Math.round(g.forecast.projected)} ${g.unit}` : (g.forecast?.note ? "yeterli veri yok" : "—")}</b></span>
                <span>Hedef olasılığı: <b>{g.forecast?.targetProbability != null ? pct(g.forecast.targetProbability * 100) : "—"}</b></span>
                <span className="text-stone-400">{g.measurementMethod}</span>
              </div>
              {g.measureNote && <p className="text-[9px] text-amber-700 mt-1">{g.measureNote}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- 7) KARAR GEÇMİŞİ ---------------- */
const HISTORY_STATUSES = ["ALL", "PENDING", "UNDER_REVIEW", "APPROVED", "IMPLEMENTED", "EVALUATED", "REJECTED", "COMPLETED", "ARCHIVED"];
function HistoryTab({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const [status, setStatus] = useState("ALL");
  const q = status === "ALL" || status === "PENDING" ? "" : `?status=${status}`; // PENDING istemci-filtresi: RECOMMENDED+UNDER_REVIEW birleşimi (sunucu durum filtresi tek değer alır)
  const { data, loading, error } = useApi<any>(`/api/intelligence/decision/recommendations${q}`, refreshKey);
  const [outcomeId, setOutcomeId] = useState<number | null>(null);
  const [outcomeSummary, setOutcomeSummary] = useState("");
  const [outcomeValue, setOutcomeValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const recordOutcome = async () => {
    if (outcomeId == null || outcomeValue === "") { setMsg({ ok: false, text: "Gerçekleşen kâr etkisi (TL) zorunludur." }); return; }
    const actualProfitImpact = Number(outcomeValue);
    if (!Number.isFinite(actualProfitImpact)) { setMsg({ ok: false, text: "Gerçekleşen etki sayı olmalı." }); return; }
    setSaving(true); setMsg(null);
    try {
      const res = await authFetch("/api/intelligence/decision/outcomes/record", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decisionId: outcomeId, actualProfitImpact, note: outcomeSummary.trim() || undefined }) });
      const json = await res.json();
      if (json.success) { setMsg({ ok: true, text: `Sonuç kaydedildi (gerçekleşme: ${json.data?.realizationRate != null ? pct(json.data.realizationRate, 0) : "hesaplanamadı"}).` }); setOutcomeId(null); setOutcomeSummary(""); setOutcomeValue(""); onChanged(); }
      else setMsg({ ok: false, text: json?.error?.message || "Sonuç kaydedilemedi." });
    } catch { setMsg({ ok: false, text: "Sunucuya ulaşılamadı." }); }
    finally { setSaving(false); }
  };
  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;
  const recs: any[] = (data?.recommendations ?? []).filter((r: any) => status === "ALL" || !status || r.status === status || (status === "PENDING" && ["RECOMMENDED", "UNDER_REVIEW"].includes(r.status)));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {HISTORY_STATUSES.map((s) => <button key={s} onClick={() => setStatus(s)} className={`px-2.5 py-1.5 rounded-xl text-[10px] font-bold border transition ${status === s ? "bg-violet-700 text-white border-violet-700" : "bg-white text-stone-600 border-stone-200 hover:border-stone-400"}`}>{s === "ALL" ? "Tümü" : s === "PENDING" ? "Bekleyen (REC/UR)" : s}</button>)}
      </div>
      {msg && <div className={`p-2.5 rounded-xl text-[11px] border ${msg.ok ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-rose-50 border-rose-200 text-rose-800"}`}>{msg.text}</div>}
      {outcomeId != null && (
        <div className={`${cardPad} space-y-2`}>
          <h4 className={h2}>Sonuç Kaydı — Öneri #{outcomeId}</h4>
          <p className={sub}>Yalnız UYGULANMIŞ (IMPLEMENTED/MONITORING/COMPLETED) kararlar için kayıt girilebilir. Kayıt sonrası karar COMPLETED/EVALUATED akışına girer; ticari kayıtlar değişmez.</p>
          <div className="flex flex-wrap items-center gap-2">
            <input className={inputCls} type="number" placeholder="Gerçekleşen kâr etkisi (TL) *" value={outcomeValue} onChange={(e) => setOutcomeValue(e.target.value)} />
          </div>
          <textarea className={`${inputCls} w-full`} rows={2} placeholder="Not (opsiyonel — örn. '%3 zam sonrası adet −%4, marj +%1.2 arttı')" value={outcomeSummary} onChange={(e) => setOutcomeSummary(e.target.value)} />
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={recordOutcome} disabled={saving || outcomeValue === ""} className={btnPrimary}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Kaydet</button>
            <button onClick={() => setOutcomeId(null)} className={btnGhost}>Vazgeç</button>
          </div>
        </div>
      )}
      {recs.length === 0 && <Empty msg="Bu durumda karar kaydı yok." />}
      <div className="space-y-1.5">
        {recs.map((r: any) => (
          <div key={r.id} className="border border-stone-200 rounded-xl px-3 py-2 text-[10px] flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2"><span className="text-stone-400">#{r.id}</span><span className="font-bold">{decisionTypeLabel(r.decisionType)}</span><span className={decisionStatusBadge(r.status)}>{r.status}</span><span className="text-stone-500 truncate max-w-[260px]">{r.title}</span></div>
            <div className="flex items-center gap-2 text-stone-500"><span>{String(r.createdAt).slice(0, 10)}</span><span>ort {sigma(r.expectedEffectValue, 0)}</span><button onClick={() => setOutcomeId(r.id)} className={btnGhost}>Sonuç Kaydı</button></div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- 8) ETKİLİLİK (ÖLÇÜLEN SONUÇLAR) ---------------- */
function EffectivenessTab({ refreshKey }: { refreshKey: number }) {
  const { data, loading, error } = useApi<any>("/api/intelligence/decision/outcomes", refreshKey);
  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;
  const eff = data ?? {};
  const byType: any[] = eff.byType ?? [];
  const stat = (label: string, value: React.ReactNode) => (
    <div className={`${cardPad} text-center`}><div className={sub}>{label}</div><div className="text-lg font-black text-stone-900 mt-1">{value ?? "—"}</div></div>
  );
  return (
    <div className="space-y-3">
      <p className={sub}>Tahmin edilen etki ile GERÇEKLEŞEN etkinin karşılaştırması. Yalnız kayıtlı sonuçlardan hesaplanır; sonuç girilmemiş öneriler dahil edilmez. Kâr odağı: yalnız ciro değil, beklenen/gerçekleşen kâr etkisi.</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {stat("Toplam Karar", eff.decisionsTotal ?? 0)}
        {stat("Onaylanan", eff.approved ?? 0)}
        {stat("Uygulanan", eff.implemented ?? 0)}
        {stat("Sonuç Girilen", eff.withOutcome ?? 0)}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {stat("Kabul Oranı", pct(eff.acceptanceRatePct))}
        {stat("Uygulama Oranı", pct(eff.implementationRatePct))}
        {stat("Başarı Oranı", pct(eff.successRatePct))}
        {stat("Ort. Gerçekleşme", pct(eff.avgRealizationPct))}
      </div>
      <div className={`${cardPad} grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px]`}>
        <div><div className={sub}>Tahmini toplam kâr etkisi</div><b>{tl(eff.totalExpectedProfit)}</b></div>
        <div><div className={sub}>Gerçekleşen toplam kâr etkisi</div><b>{tl(eff.totalActualProfit)}</b></div>
        <div><div className={sub}>Finansal gerçekleşme</div><b>{pct(eff.financialRealizationPct)}</b>{eff.avgCompletionDays != null && <span className={`${sub} ml-3`}>· Ort. {eff.avgCompletionDays} gün</span>}</div>
      </div>
      {byType.length > 0 ? (
        <div className={cardPad}><h4 className={h2}>Öneri Türüne Göre (sonuç girilenler)</h4>
          <div className="mt-2 overflow-x-auto"><table className="w-full text-[10px]"><thead><tr className="text-left text-stone-400"><th className="py-1">Tür</th><th>Adet</th><th>Başarı</th><th>Ort. Gerçekleşme</th></tr></thead><tbody>{byType.map((r: any, i: number) => <tr key={i} className="border-t border-stone-100"><td className="py-1.5">{decisionTypeLabel(r.decisionType ?? String(i))}</td><td>{r.count}</td><td>{pct(r.successRatePct)}</td><td>{pct(r.avgRealizationPct)}</td></tr>)}</tbody></table></div>
        </div>
      ) : (
        <Empty msg="Henüz sonuç kaydı yok. IMPLEMENTED bir kararın sonucunu 'Karar Geçmişi' sekmesinden girin; sistem beklenen/gerçekleşeni karşılaştırır." />
      )}
      {eff.note && <p className={sub}>{eff.note}</p>}
      <p className={sub}>Başarı tanımı: gerçekleşen ≥ beklenenin %50’si (beklenen ≠ 0 ise) veya gerçekleşen &gt; 0. “En yüksek skor” tek başına başarı sayılmaz; gerçekleşen kâr esastır.</p>
    </div>
  );
}

/* ---------------- 9) KARAR AYARLARI ---------------- */
function SettingsTab({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const { data, loading, error } = useApi<any>("/api/intelligence/decision/settings", refreshKey);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const hasRange = (it: any) => it?.min != null && it?.max != null && !(Number(it.min) === 0 && Number(it.max) === 0);
  const items: any[] = data?.items ?? [];
  const saveKey = async (key: string) => {
    setSavingKey(key); setMsg(null);
    try {
      const res = await authFetch("/api/intelligence/decision/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, value: draft[key] ?? String(items.find((it) => it.key === key)?.value ?? "") }) });
      const json = await res.json();
      if (json.success) setMsg({ ok: true, text: `${key} güncellendi.` });
      else setMsg({ ok: false, text: json?.error?.message || "Kaydedilemedi (yalnız SUPER_ADMIN + min/max sınırları dahilinde)." });
    } catch { setMsg({ ok: false, text: "Sunucuya ulaşılamadı." }); }
    finally { setSavingKey(null); onChanged(); }
  };
  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;
  return (
    <div className="space-y-3">
      <div className="p-3 rounded-xl bg-stone-100 border border-stone-200 text-[10px] text-stone-600"><b>Yalnız SUPER_ADMIN değiştirebilir.</b> Aralık dışı/uyumsuz değer REDDEDİLİR. Öneri eşiği yükseltmek daha az ama daha isabetli öneri; düşürme daha çok ama daha spekülatif öneri üretir. Her değişiklik audit log’a düşer. Boş bırakılan anahtar FAZ 3 varsayılanını kullanır.</div>
      {msg && <div className={`p-2.5 rounded-xl text-[11px] border ${msg.ok ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-rose-50 border-rose-200 text-rose-800"}`}>{msg.text}</div>}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        {items.map((it: any) => (
          <div key={it.key} className={`${cardPad} flex flex-col gap-1.5`}>
            <div className="flex items-center justify-between gap-2">
              <label className="text-[10px] font-black text-stone-800 break-all">{it.key}{it.overridden && <span className="ml-1.5 text-[8px] text-violet-700 align-middle">ÖZELLEŞTİRİLDİ</span>}</label>
              {hasRange(it) ? <span className="text-[9px] text-stone-400 whitespace-nowrap">min {it.min} · max {it.max}</span> : <span className="text-[9px] text-stone-400">sabit</span>}
            </div>
            {it.description && <p className="text-[9px] text-stone-500">{it.description}{it.defaultValue != null && <span className="text-stone-400"> · varsayılan: {String(it.defaultValue)}</span>}</p>}
            <div className="flex items-center gap-1.5">
              <input className={`${inputCls} flex-1 font-mono`} value={draft[it.key] ?? String(it.value ?? "")} onChange={(e) => setDraft((d) => ({ ...d, [it.key]: e.target.value }))} />
              <button onClick={() => saveKey(it.key)} disabled={savingKey === it.key} className={btnGhost}>{savingKey === it.key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Kaydet</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


export default DecisionIntelligence;
