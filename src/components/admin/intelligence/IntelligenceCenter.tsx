"use client";

/**
 * Commerce Intelligence Center (FAZ 1) — 9 bölüm.
 * Tümü `/api/intelligence/*` uçlarından beslenir; sunucu taraflı hesaplama.
 * Guardrail: salt okuma + "Analizi Çalıştır" (kalıcı kayıt) dışında hiçbir
 * tablo değiştirilmez. Fiyat/stok/sipariş kayıtlarına yazılmaz.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  Brain, LayoutDashboard, Coins, LineChart, Siren, Users, Grid3X3, Boxes, Gauge, Settings,
  Loader2, RefreshCw, Sparkles, AlertTriangle, CheckCircle2, X, ShieldAlert, ChevronRight,
} from "lucide-react";
import { authFetch } from "@/lib/client-auth";

const tl = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(n);
const num = (n: number | null | undefined, digits = 1) => (n == null ? "—" : n.toFixed(digits));
const pct = (n: number | null | undefined, digits = 1) => (n == null ? "—" : `%${n.toFixed(digits)}`);

type ApiState<T> = { data: T | null; loading: boolean; error: string | null };

function useApi<T>(url: string | null, refreshKey: number): ApiState<T> {
  const [state, setState] = useState<ApiState<T>>({ data: null, loading: true, error: null });
  useEffect(() => {
    if (!url) return;
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    (async () => {
      try {
        const res = await authFetch(url, { cache: "no-store" });
        const json = await res.json();
        if (!alive) return;
        if (json.success) setState({ data: json.data as T, loading: false, error: null });
        else setState({ data: null, loading: false, error: json?.error?.message || "Veri alınamadı." });
      } catch {
        if (alive) setState({ data: null, loading: false, error: "Sunucuya ulaşılamadı." });
      }
    })();
    return () => { alive = false; };
  }, [url, refreshKey]);
  return state;
}

const card = "rounded-2xl border border-stone-200 bg-white";
const cardPad = `${card} p-4 sm:p-5`;
const h2 = "text-sm font-black text-stone-900";
const sub = "text-[11px] text-stone-500";
const chip = "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold";
const badgeCls = (tone: "ok" | "warn" | "bad" | "info" | "muted") =>
  ({
    ok: `${chip} bg-emerald-100 text-emerald-800`,
    warn: `${chip} bg-amber-100 text-amber-800`,
    bad: `${chip} bg-rose-100 text-rose-800`,
    info: `${chip} bg-sky-100 text-sky-800`,
    muted: `${chip} bg-stone-100 text-stone-600`,
  }[tone]);
const severityCls = (s: string) =>
  ({ CRITICAL: badgeCls("bad"), HIGH: badgeCls("warn"), MEDIUM: badgeCls("info"), LOW: badgeCls("muted") }[s] ?? badgeCls("muted"));
const statusBadge = (s: string) =>
  ({ VERIFIED: badgeCls("ok"), PARTIAL: badgeCls("warn"), INSUFFICIENT_DATA: badgeCls("bad") }[s] ?? badgeCls("muted"));
const inputCls = "px-3 py-2 border border-stone-300 rounded-xl text-xs bg-white";

const TABS = [
  { id: "overview", label: "Genel Bakış", icon: LayoutDashboard },
  { id: "profit", label: "Kârlılık", icon: Coins },
  { id: "forecast", label: "Tahmin", icon: LineChart },
  { id: "anomalies", label: "Anomali Merkezi", icon: Siren },
  { id: "rfm", label: "RFM", icon: Users },
  { id: "cohort", label: "Cohort", icon: Grid3X3 },
  { id: "abcxyz", label: "ABC-XYZ", icon: Boxes },
  { id: "accuracy", label: "Tahmin Doğruluğu", icon: Gauge },
  { id: "settings", label: "Ayarlar", icon: Settings },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function IntelligenceCenter() {
  const [tab, setTab] = useState<TabId>("overview");
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-violet-800 flex items-center gap-1.5">
            <Brain className="w-3.5 h-3.5" /> COMMERCE INTELLIGENCE ENGINE — FAZ 1
          </span>
          <h2 className="text-xl font-black text-stone-900 mt-1">Intelligence Center</h2>
          <p className={sub}>Deterministik, açıklanabilir analiz. LLM yok; her sayı kendi verinizden hesaplanır. Hiçbir fiyat / stok / sipariş kaydı değiştirilmez.</p>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-stone-300 text-xs font-bold text-stone-700 hover:bg-stone-50 transition"
        >
          <RefreshCw className="w-4 h-4" /> Yenile
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5 p-1.5 rounded-2xl bg-stone-100 border border-stone-200">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition ${
                active ? "bg-white shadow-xs text-violet-900" : "text-stone-500 hover:text-stone-800"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          );
        })}
      </div>

      {tab === "overview" && <OverviewTab refreshKey={refreshKey} onAnalyzed={refresh} />}
      {tab === "profit" && <ProfitTab refreshKey={refreshKey} />}
      {tab === "forecast" && <ForecastTab refreshKey={refreshKey} />}
      {tab === "anomalies" && <AnomaliesTab refreshKey={refreshKey} onChanged={refresh} />}
      {tab === "rfm" && <RfmTab refreshKey={refreshKey} />}
      {tab === "cohort" && <CohortTab refreshKey={refreshKey} />}
      {tab === "abcxyz" && <AbcXyzTab refreshKey={refreshKey} />}
      {tab === "accuracy" && <AccuracyTab refreshKey={refreshKey} />}
      {tab === "settings" && <SettingsTab refreshKey={refreshKey} />}
    </div>
  );
}

function SectionNote({ notes }: { notes?: string[] }) {
  if (!notes?.length) return null;
  return (
    <details className="text-[10px] text-stone-500">
      <summary className="cursor-pointer font-bold text-stone-600 select-none">Metodoloji & notlar</summary>
      <ul className="list-disc pl-4 mt-1 space-y-0.5">
        {notes.map((n, i) => <li key={i}>{n}</li>)}
      </ul>
    </details>
  );
}
function Loading() { return <div className="py-10 flex items-center justify-center gap-2 text-stone-500 text-xs"><Loader2 className="w-4 h-4 animate-spin" /> Hesaplanıyor…</div>; }
function ErrorBox({ msg }: { msg: string }) {
  return <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />{msg}</div>;
}
function Empty({ msg }: { msg: string }) { return <div className="py-10 text-center text-xs text-stone-400">{msg}</div>; }

/* ---------------- 1) GENEL BAKIŞ ---------------- */
function OverviewTab({ refreshKey, onAnalyzed }: { refreshKey: number; onAnalyzed: () => void }) {
  const { data, loading, error } = useApi<any>("/api/intelligence/overview", refreshKey);
  const [running, setRunning] = useState(false);
  const [analyzeMsg, setAnalyzeMsg] = useState<{ ok: boolean; text: string; steps?: string[] } | null>(null);

  const runAnalyze = async () => {
    setRunning(true);
    setAnalyzeMsg(null);
    try {
      const res = await authFetch("/api/intelligence/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const json = await res.json();
      if (json.success) setAnalyzeMsg({ ok: true, text: "Analiz tamamlandı.", steps: json.data?.steps });
      else setAnalyzeMsg({ ok: false, text: json?.error?.message || "Analiz çalıştırılamadı." });
      onAnalyzed();
    } catch {
      setAnalyzeMsg({ ok: false, text: "Sunucuya ulaşılamadı." });
    } finally {
      setRunning(false);
    }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return <Empty msg="Veri yok." />;
  const k = data.kpis;
  const cards: Array<{ label: string; value: string; tone?: string }> = [
    { label: "Geçerli Sipariş", value: String(k.validOrders) },
    { label: "Toplam Net Ciro", value: tl(k.totalRevenue) },
    { label: "Kayıtlı Tahmin (nokta)", value: String(k.persistedForecastAnalyses) },
    { label: "Açık Anomali", value: String(k.openAnomalies) },
    { label: "RFM Skorlanan Müşteri", value: String(k.rfmCustomers) },
    { label: "Riskli Müşteri (RFM)", value: String(k.rfmAtRisk) },
    { label: "Ort. Backtest WAPE", value: k.avgBacktestWape != null ? pct(k.avgBacktestWape) : "—" },
    { label: "A Sınıfı Ürün (son analiz)", value: String(k.abcAClassCount) },
    { label: "Z Sınıfı Ürün (son analiz)", value: String(k.xyzZClassCount) },
  ];

  return (
    <div className="space-y-4">
      <div className={cardPad}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className={h2}>Analiz Motoru</h3>
            <p className={sub}>Tahminler, backtest, ABC-XYZ, RFM ve anomali taramasını hesaplar; sonuçları kalıcı tablolara yazar (tek yazma noktası).</p>
          </div>
          <button
            onClick={runAnalyze}
            disabled={running}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-800 hover:bg-violet-900 disabled:opacity-60 text-white text-xs font-bold transition"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {running ? "Analiz çalışıyor…" : "Analizi Çalıştır"}
          </button>
        </div>
        {analyzeMsg && (
          <div className={`mt-3 p-3 rounded-xl border text-xs ${analyzeMsg.ok ? "bg-emerald-50 border-emerald-200 text-emerald-900" : "bg-rose-50 border-rose-200 text-rose-900"}`}>
            <p className="font-bold flex items-center gap-1.5">{analyzeMsg.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}{analyzeMsg.text}</p>
            {analyzeMsg.steps && (
              <ul className="list-disc pl-5 mt-1.5 space-y-0.5">
                {analyzeMsg.steps.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-9 gap-2">
        {cards.map((c) => (
          <div key={c.label} className={`${card} p-3 flex flex-col gap-1`}>
            <span className="text-[9px] uppercase tracking-wider text-stone-400 font-bold leading-tight">{c.label}</span>
            <span className="text-base font-black text-stone-900">{c.value}</span>
          </div>
        ))}
      </div>

      {data.dataNotes?.length > 0 && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-black">Veri Kalitesi Uyarısı</p>
            <ul className="list-disc pl-4 mt-1 space-y-0.5">{data.dataNotes.map((n: string, i: number) => <li key={i}>{n}</li>)}</ul>
          </div>
        </div>
      )}
      <SectionNote notes={["Tüm hesaplamalar deterministiktir; aynı veriye aynı sonuç.", "İptal/iade siparişler cirodan düşülür; gerçekleşmemiş iadeler (REQUESTED/REJECTED) hariçtir."]} />
    </div>
  );
}

/* ---------------- 2) KÂRLILIK ---------------- */
function ProfitRowTable({ rows, title }: { rows: any[]; title: string }) {
  if (!rows?.length) return <div className="text-[11px] text-stone-400">{title}: veri yok.</div>;
  return (
    <div>
      <p className="text-[11px] font-black text-stone-700 mb-1.5">{title}</p>
      <div className="overflow-x-auto -mx-2">
        <table className="min-w-full text-[10px]">
          <thead>
            <tr className="text-left text-stone-400">
              <th className="px-2 py-1">Ürün</th><th className="px-2 py-1 text-right">Net Satış</th><th className="px-2 py-1 text-right">COGS</th><th className="px-2 py-1 text-right">Katkı Kârı</th><th className="px-2 py-1 text-right">Marj</th><th className="px-2 py-1">Durum</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 12).map((r) => (
              <tr key={r.key} className="border-t border-stone-100">
                <td className="px-2 py-1 max-w-[220px] truncate font-medium text-stone-800" title={r.label}>{r.label}</td>
                <td className="px-2 py-1 text-right tabular-nums">{tl(r.netSales)}</td>
                <td className="px-2 py-1 text-right tabular-nums">{tl(r.cogs)}</td>
                <td className={`px-2 py-1 text-right tabular-nums font-bold ${r.contributionProfit < 0 ? "text-rose-700" : "text-emerald-700"}`}>{tl(r.contributionProfit)}</td>
                <td className="px-2 py-1 text-right tabular-nums">{pct(r.contributionMargin)}</td>
                <td className="px-2 py-1"><span className={statusBadge(r.status)}>{r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProfitTab({ refreshKey }: { refreshKey: number }) {
  const { data, loading, error } = useApi<any>("/api/intelligence/profitability", refreshKey);
  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return <Empty msg="Veri yok." />;
  return (
    <div className="space-y-4">
      <div className={cardPad}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className={h2}>Profit Intelligence</h3>
            <p className={sub}>Net satış = merch ciro − indirim (pro-rata) − iade. COGS = adet × cari alış fiyatı. Komisyon/kargo/paket/reklam şemada yok → katkı kârı değişken maliyetsiz.</p>
          </div>
          <div className="flex items-center gap-2">
            {data.degraded && <span className={badgeCls("warn")}>Maliyet eksikleri var</span>}
            <span className={badgeCls(data.costCoverageOverall >= 0.95 ? "ok" : data.costCoverageOverall > 0 ? "warn" : "bad")}>Maliyet kapsamı {pct(data.costCoverageOverall * 100)}</span>
          </div>
        </div>
        {data.missingCostProducts?.length > 0 && (
          <p className="mt-2 text-[10px] text-amber-800">Maliyeti eksik {data.missingCostProducts.length} ürün: {data.missingCostProducts.slice(0, 5).map((m: any) => m.name).join(", ")}{data.missingCostProducts.length > 5 ? "…" : ""}</p>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className={cardPad}><ProfitRowTable rows={data.levels?.product} title="Ürün Kârlılığı (Net satışa göre)" /></div>
        <div className={cardPad}>
          <div className="grid grid-cols-1 gap-4">
            <ProfitRowTable rows={data.levels?.category} title="Kategori Kârlılığı" />
            <ProfitRowTable rows={data.levels?.brand} title="Marka Kârlılığı" />
            <div className="overflow-x-auto -mx-2">
              <table className="min-w-full text-[10px]">
                <thead><tr className="text-left text-stone-400"><th className="px-2 py-1">Kanal</th><th className="px-2 py-1 text-right">Net Satış</th><th className="px-2 py-1 text-right">Katkı Kârı</th><th className="px-2 py-1 text-right">Marj</th></tr></thead>
                <tbody>
                  {data.levels?.channel?.map((r: any) => (
                    <tr key={r.key} className="border-t border-stone-100"><td className="px-2 py-1 font-medium">{r.label}</td><td className="px-2 py-1 text-right tabular-nums">{tl(r.netSales)}</td><td className="px-2 py-1 text-right tabular-nums font-bold">{tl(r.contributionProfit)}</td><td className="px-2 py-1 text-right">{pct(r.contributionMargin)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div className={cardPad}>
        <h3 className={h2}>Tespitler</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2 text-[11px]">
          <div>
            <p className="font-black text-rose-800 text-[10px] uppercase tracking-wider">Negatif Katkı ({data.detections?.negativeContribution?.length ?? 0})</p>
            <ul className="mt-1 space-y-0.5">{data.detections?.negativeContribution?.slice(0, 5).map((r: any) => <li key={r.key} className="flex justify-between gap-2"><span className="truncate">{r.label}</span><span className="tabular-nums text-rose-700 font-bold">{tl(r.contributionProfit)}</span></li>)}</ul>
          </div>
          <div>
            <p className="font-black text-amber-800 text-[10px] uppercase tracking-wider">Yüksek Ciro · Düşük Marj ({data.detections?.highRevenueLowMargin?.length ?? 0})</p>
            <ul className="mt-1 space-y-0.5">{data.detections?.highRevenueLowMargin?.slice(0, 5).map((r: any) => <li key={r.key} className="flex justify-between gap-2"><span className="truncate">{r.label}</span><span className="tabular-nums">{pct(r.contributionMargin)}</span></li>)}</ul>
          </div>
          <div>
            <p className="font-black text-emerald-800 text-[10px] uppercase tracking-wider">Düşük Ciro · Yüksek Marj ({data.detections?.lowRevenueHighMargin?.length ?? 0})</p>
            <ul className="mt-1 space-y-0.5">{data.detections?.lowRevenueHighMargin?.slice(0, 5).map((r: any) => <li key={r.key} className="flex justify-between gap-2"><span className="truncate">{r.label}</span><span className="tabular-nums">{pct(r.contributionMargin)}</span></li>)}</ul>
          </div>
        </div>
        <div className="mt-3"><SectionNote notes={data.notes} /></div>
      </div>
    </div>
  );
}

/* ---------------- 3) TAHMİN ---------------- */
const HORIZONS = [7, 14, 30, 60, 90];

function MiniBars({ points, valueOf, color, height = 64 }: { points: any[]; valueOf: (p: any) => number; color: string; height?: number }) {
  if (!points.length) return null;
  const max = Math.max(...points.map(valueOf), 1);
  return (
    <div className="flex items-end gap-[2px]" style={{ height }}>
      {points.map((p, i) => {
        const v = valueOf(p);
        return <div key={i} title={`${p.date}: ${num(v, 2)}`} className={`flex-1 rounded-sm ${color}`} style={{ height: `${Math.max(2, (v / max) * 100)}%`, opacity: 0.55 + 0.45 * (v / max) }} />;
      })}
    </div>
  );
}

function ForecastTab({ refreshKey }: { refreshKey: number }) {
  const [scope, setScope] = useState<"STORE" | "CATEGORY" | "PRODUCT">("STORE");
  const [scopeId, setScopeId] = useState("");
  const [horizon, setHorizon] = useState(7);
  const [applied, setApplied] = useState<{ scope: "STORE" | "CATEGORY" | "PRODUCT"; scopeId: number | null; horizon: number }>({ scope: "STORE", scopeId: null, horizon: 7 });

  const qs = new URLSearchParams({ scope: applied.scope, horizon: String(applied.horizon) });
  if (applied.scopeId != null) qs.set("scopeId", String(applied.scopeId));
  const { data, loading, error } = useApi<any>(`/api/intelligence/forecast?${qs.toString()}`, refreshKey);

  const apply = () => {
    if (scope === "STORE") setApplied({ scope, scopeId: null, horizon });
    else {
      const id = Number(scopeId);
      if (!Number.isFinite(id) || id < 1) return;
      setApplied({ scope, scopeId: id, horizon });
    }
  };

  return (
    <div className="space-y-4">
      <div className={cardPad}>
        <h3 className={h2}>Forecast Engine</h3>
        <p className={sub}>9 model (SMA, WMA, SES, Holt, Holt-Winters, Lineer Regresyon, Sezonsal Naive, Croston, SBA) walk-forward backtest ile WAPE'e göre seçilir. Aralık aralıklarda Croston/SBA tercih edilir.</p>
        <div className="flex flex-wrap items-end gap-2 mt-3">
          <label className="text-[10px] font-bold text-stone-500">Kapsam<br />
            <select className={`${inputCls} mt-1`} value={scope} onChange={(e) => setScope(e.target.value as any)}>
              <option value="STORE">Mağaza Geneli</option>
              <option value="CATEGORY">Kategori (ID)</option>
              <option value="PRODUCT">Ürün (ID)</option>
            </select>
          </label>
          {scope !== "STORE" && (
            <label className="text-[10px] font-bold text-stone-500">{scope === "CATEGORY" ? "Kategori ID" : "Ürün ID"}<br />
              <input className={`${inputCls} mt-1 w-32`} type="number" min={1} value={scopeId} onChange={(e) => setScopeId(e.target.value)} placeholder="ör. 12" />
            </label>
          )}
          <label className="text-[10px] font-bold text-stone-500">Ufuk<br />
            <div className="flex gap-1 mt-1">
              {HORIZONS.map((h) => (
                <button key={h} onClick={() => setHorizon(h)} className={`px-2.5 py-2 rounded-xl text-[11px] font-bold border transition ${horizon === h ? "bg-violet-800 text-white border-violet-800" : "border-stone-300 text-stone-600 hover:bg-stone-50"}`}>{h}g</button>
              ))}
            </div>
          </label>
          <button onClick={apply} className="px-4 py-2 rounded-xl bg-stone-900 text-white text-xs font-bold hover:bg-stone-800 transition">Hesapla</button>
        </div>
      </div>

      {loading && <Loading />}
      {error && <ErrorBox msg={error} />}
      {data && (
        <>
          <div className={cardPad}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-black text-stone-900">{data.scopeLabel} — önümüzdeki {data.horizonDays} gün</p>
                <p className={sub}>Model: <b>{data.modelLabel ?? "seçilemedi"}</b>{data.modelWape != null && <> · Backtest WAPE %{num(data.modelWape, 2)}</>} · Örneklem {data.sampleSize} gün · Sıfır-satış oranı {pct(data.zeroFraction * 100, 0)}</p>
              </div>
              <div className="flex items-center gap-2">
                {data.dataQuality === "INSUFFICIENT_DATA" ? <span className={badgeCls("bad")}>INSUFFICIENT_DATA</span> : data.dataQuality === "LOW_DATA" ? <span className={badgeCls("warn")}>LOW_DATA</span> : <span className={badgeCls("ok")}>OK</span>}
              </div>
            </div>
            <p className="mt-2 text-[10px] text-stone-500">{data.note}</p>
            {data.history?.length > 1 && (
              <div className="mt-3">
                <p className="text-[9px] font-bold text-stone-400 uppercase tracking-wider mb-1">Son {data.history.length} gün (gerçekleşen adet)</p>
                <MiniBars points={data.history} valueOf={(p) => p.quantity} color="bg-stone-400" />
              </div>
            )}
            {data.forecast?.length > 0 && (
              <div className="mt-3">
                <p className="text-[9px] font-bold text-violet-700 uppercase tracking-wider mb-1">Tahmin (adet) — CI: %95 bandı</p>
                <MiniBars points={data.forecast} valueOf={(p) => p.quantity} color="bg-violet-500" />
              </div>
            )}
          </div>

          {data.forecast?.length > 0 && (
            <div className={cardPad}>
              <div className="overflow-x-auto -mx-2">
                <table className="min-w-full text-[10px]">
                  <thead><tr className="text-left text-stone-400"><th className="px-2 py-1">Tarih</th><th className="px-2 py-1 text-right">Tahmin (adet)</th><th className="px-2 py-1 text-right">%95 Alt</th><th className="px-2 py-1 text-right">%95 Üst</th><th className="px-2 py-1 text-right">Tahmini Ciro</th></tr></thead>
                  <tbody>
                    {data.forecast.map((f: any) => (
                      <tr key={f.date} className="border-t border-stone-100"><td className="px-2 py-1 font-medium">{f.date}</td><td className="px-2 py-1 text-right tabular-nums font-bold">{num(f.quantity, 2)}</td><td className="px-2 py-1 text-right tabular-nums text-stone-500">{num(f.ciLower, 2)}</td><td className="px-2 py-1 text-right tabular-nums text-stone-500">{num(f.ciUpper, 2)}</td><td className="px-2 py-1 text-right tabular-nums">{tl(f.revenue)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[9px] text-stone-400">{data.priceAssumption}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ---------------- 4) ANOMALİ MERKEZİ ---------------- */
function AnomaliesTab({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const { data, loading, error } = useApi<any>("/api/intelligence/anomalies", refreshKey);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const setStatus = async (id: number | null, status: string) => {
    if (id == null) return;
    setBusyId(id);
    setActionErr(null);
    try {
      const res = await authFetch(`/api/intelligence/anomalies/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const json = await res.json();
      if (!json.success) setActionErr(json?.error?.message || "Güncellenemedi.");
      onChanged();
    } catch {
      setActionErr("Sunucuya ulaşılamadı.");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return <Empty msg="Veri yok." />;
  const list: any[] = data.anomalies ?? [];
  return (
    <div className="space-y-4">
      <div className={cardPad}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className={h2}>Anomaly Center</h3>
            <p className={sub}>Modified Z (MAD) + IQR + EWMA teyidi. Eşik ürünün/mağazanın kendi geçmişinden çıkar; sabit eşik yoktur.</p>
          </div>
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className={badgeCls("bad")}>{data.summary?.critical ?? 0} CRITICAL</span>
            <span className={badgeCls("warn")}>{data.summary?.high ?? 0} HIGH</span>
            <span className={badgeCls("muted")}>{data.summary?.lowData ?? 0} DÜŞÜK VERİ</span>
          </div>
        </div>
        {actionErr && <p className="mt-2 text-[10px] text-rose-700 font-bold">{actionErr}</p>}
      </div>

      {list.length === 0 ? (
        <Empty msg="Açık anomali yok — ya da veri henüz yeterli değil. Geçmişiniz büyüdükçe bu liste dolacaktır." />
      ) : (
        <div className="space-y-2">
          {list.map((a) => (
            <div key={a.anomalyKey} className={`${card} p-3 sm:p-4`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={severityCls(a.severity)}>{a.severity}</span>
                    <span className={badgeCls(a.status === "RESOLVED" ? "ok" : a.status === "ACKNOWLEDGED" ? "info" : "warn")}>{a.status}</span>
                    {a.confidence === "LOW_DATA_CONFIDENCE" && <span className={badgeCls("muted")}>LOW_DATA_CONFIDENCE</span>}
                    <span className="text-[9px] text-stone-400 font-mono">{a.metric} · {a.method}</span>
                  </div>
                  <p className="text-xs font-black text-stone-900 mt-1.5">{a.entityLabel} — {a.direction === "UP" ? "beklenenden yüksek" : "beklenenden düşük"} ({a.direction === "UP" ? "+" : ""}{num(a.deviationPct, 1)}%)</p>
                  <p className="text-[10px] text-stone-500 mt-0.5">Gözlemlenen: <b>{num(a.observedValue, 2)}</b> · Beklenen: {num(a.expectedValue, 2)} · Tekrar: {a.occurrences} · {a.anomalyKey.split("|")[2]}</p>
                  {a.possibleCauses?.length > 0 && (
                    <p className="text-[9px] text-stone-400 mt-1"><span className="font-bold">Olası açıklamalar (kesin neden değildir):</span> {a.possibleCauses.join(" · ")}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  {a.id == null ? (
                    <span className="text-[9px] text-stone-400 max-w-[140px]">Kalıcı kayıt yok — önce “Analizi Çalıştır”.</span>
                  ) : (
                    <>
                      <button disabled={busyId === a.id || a.status === "ACKNOWLEDGED"} onClick={() => setStatus(a.id, "ACKNOWLEDGED")} className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-sky-100 text-sky-900 hover:bg-sky-200 disabled:opacity-40 transition">İncelendi</button>
                      <button disabled={busyId === a.id || a.status === "RESOLVED"} onClick={() => setStatus(a.id, "RESOLVED")} className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-emerald-100 text-emerald-900 hover:bg-emerald-200 disabled:opacity-40 transition">Çözüldü</button>
                      {a.status !== "OPEN" && <button disabled={busyId === a.id} onClick={() => setStatus(a.id, "OPEN")} className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-stone-500 hover:bg-stone-100 transition">Geri Aç</button>}
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <SectionNote notes={data.notes} />
    </div>
  );
}

/* ---------------- 5) RFM ---------------- */
function RfmTab({ refreshKey }: { refreshKey: number }) {
  const { data, loading, error } = useApi<any>("/api/intelligence/customers/rfm", refreshKey);
  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return <Empty msg="Veri yok." />;
  const maxSegMonetary = Math.max(...(data.segments ?? []).map((s: any) => s.monetary), 1);
  return (
    <div className="space-y-4">
      <div className={cardPad}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className={h2}>RFM Customer Intelligence</h3>
            <p className={sub}>Recency (gün, küçük=iyi), Frequency, Monetary — 1–5 quantile skor. İptal/iade hariç; parasal değer iade düşülmüş net cirondur. Misafir satışlar hariç. Son {data.periodDays} gün.</p>
          </div>
          <div className="flex gap-2 text-[10px]">
            <span className={badgeCls("info")}>Tekrar oranı %{data.kpis?.repeatPurchaseRate ?? "—"}</span>
            <span className={badgeCls("muted")}>Ort. sipariş aralığı {num(data.kpis?.avgPurchaseIntervalDays, 1)} g</span>
          </div>
        </div>
        {data.sampleWarning && <p className="mt-2 text-[10px] text-amber-800 font-bold">⚠️ {data.sampleWarning}</p>}
      </div>

      <div className={cardPad}>
        <h3 className={h2}>Segment Dağılımı</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 mt-2">
          {(data.segments ?? []).map((s: any) => (
            <div key={s.segment} className="rounded-xl border border-stone-200 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-black text-stone-800">{s.segment}</span>
                <span className="text-[10px] tabular-nums text-stone-500">{s.count} müşteri</span>
              </div>
              <div className="h-1.5 rounded bg-stone-100 mt-1.5 overflow-hidden"><div className="h-full bg-violet-500" style={{ width: `${(s.monetary / maxSegMonetary) * 100}%` }} /></div>
              <p className="text-[10px] text-stone-500 mt-1 tabular-nums">{tl(s.monetary)}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className={cardPad}>
          <h3 className={h2}>En Değerli Müşteriler</h3>
          <div className="overflow-x-auto -mx-2 mt-1">
            <table className="min-w-full text-[10px]">
              <thead><tr className="text-left text-stone-400"><th className="px-2 py-1">Müşteri</th><th className="px-2 py-1 text-center">R·F·M</th><th className="px-2 py-1">Segment</th><th className="px-2 py-1 text-right">Net Harcama</th></tr></thead>
              <tbody>
                {(data.rows ?? []).slice(0, 15).map((r: any) => (
                  <tr key={r.customerId} className="border-t border-stone-100">
                    <td className="px-2 py-1 max-w-[160px] truncate font-medium" title={r.customerName}>{r.customerName}<span className="block text-[8px] text-stone-400">son sipariş {r.recencyDays} g önce · {r.frequency} sip.</span></td>
                    <td className="px-2 py-1 text-center tabular-nums font-bold text-violet-800">{r.rScore}·{r.fScore}·{r.mScore}</td>
                    <td className="px-2 py-1">{r.segment}</td>
                    <td className="px-2 py-1 text-right tabular-nums font-bold">{tl(r.monetary)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className={cardPad}>
          <h3 className={h2}>Churn Riski (&gt; {data.churnDays} gün sessiz)</h3>
          {(data.churnRisk ?? []).length === 0 ? (
            <p className="text-[11px] text-stone-400 mt-2">Churn sınırını aşan kayıtlı müşteri yok.</p>
          ) : (
            <ul className="mt-1 divide-y divide-stone-100">
              {data.churnRisk.slice(0, 10).map((r: any) => (
                <li key={r.customerId} className="py-1.5 flex items-center justify-between gap-2 text-[10px]">
                  <div className="min-w-0"><p className="font-bold text-stone-800 truncate">{r.customerName}</p><p className="text-stone-400">{r.segment} · son {r.recencyDays} gün · {r.frequency} sipariş</p></div>
                  <span className="tabular-nums font-bold text-stone-600">{tl(r.monetary)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[9px] text-stone-400">Gerçek churn olasılığı yerine recency tabanlı erişim listesidir; aksiyon önerisi CRM’deki kampanya modülünden uygulanabilir.</p>
        </div>
      </div>
      <SectionNote notes={data.notes} />
    </div>
  );
}

/* ---------------- 6) COHORT ---------------- */
function CohortTab({ refreshKey }: { refreshKey: number }) {
  const { data, loading, error } = useApi<any>("/api/intelligence/customers/cohorts", refreshKey);
  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return <Empty msg="Veri yok." />;
  const cohorts: any[] = data.cohorts ?? [];
  const cell = (v: number | null) => {
    if (v == null) return { cls: "bg-stone-50 text-stone-300", txt: "·" };
    if (v >= 50) return { cls: "bg-emerald-600 text-white", txt: `${v}` };
    if (v >= 30) return { cls: "bg-emerald-300 text-emerald-950", txt: `${v}` };
    if (v >= 15) return { cls: "bg-amber-200 text-amber-900", txt: `${v}` };
    if (v > 0) return { cls: "bg-rose-100 text-rose-800", txt: `${v}` };
    return { cls: "bg-rose-50 text-rose-400", txt: "0" };
  };
  return (
    <div className="space-y-4">
      <div className={cardPad}>
        <h3 className={h2}>Cohort Retention Analizi</h3>
        <p className={sub}>İlk geçerli (iptal/iade hariç) satın alma ayına göre gruplanır. Hücre = o ay geri dönen müşteri %’si. Henüz tamamlanmamış aylar boş gösterilir, 0 yazılmaz.</p>
      </div>
      {cohorts.length === 0 ? (
        <Empty msg="Henüz cohort oluşturacak yeterli kayıtlı müşteri verisi yok." />
      ) : (
        <div className={`${card} overflow-x-auto`}>
          <table className="min-w-full text-[10px]">
            <thead>
              <tr className="text-stone-400 text-left">
                <th className="px-3 py-2 sticky left-0 bg-white">Cohort</th>
                <th className="px-2 py-2 text-right">Boyut</th>
                {Array.from({ length: 13 }, (_, i) => <th key={i} className="px-2 py-2 text-center">Ay {i}</th>)}
              </tr>
            </thead>
            <tbody>
              {cohorts.map((c) => (
                <tr key={c.cohort} className="border-t border-stone-100">
                  <td className="px-3 py-1.5 font-black text-stone-800 sticky left-0 bg-white">{c.cohort}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{c.size}</td>
                  {c.retention.map((v: number | null, i: number) => {
                    const { cls, txt } = cell(v);
                    return <td key={i} className="p-0.5 text-center"><span className={`inline-block w-9 rounded ${cls} py-1 font-bold tabular-nums`}>{txt}</span></td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className={cardPad}>
        <h3 className={h2}>Genel Ortalama Eğrisi</h3>
        <div className="flex items-end gap-1 mt-2 h-24">
          {(data.overall ?? []).map((o: any) => (
            <div key={o.month} className="flex-1 flex flex-col items-center gap-1" title={o.retentionRate != null ? `Ay ${o.month}: %${o.retentionRate} (${o.cohorts} cohort)` : `Ay ${o.month}: veri yok`}>
              <div className="w-full rounded-t bg-violet-400" style={{ height: `${Math.max(2, (o.retentionRate ?? 0)) * 0.9}%`, opacity: o.retentionRate == null ? 0.15 : 0.35 + 0.65 * (o.retentionRate / 100) }} />
              <span className="text-[8px] text-stone-400">{o.month}</span>
            </div>
          ))}
        </div>
      </div>
      <SectionNote notes={data.notes} />
    </div>
  );
}

/* ---------------- 7) ABC-XYZ ---------------- */
function AbcXyzTab({ refreshKey }: { refreshKey: number }) {
  const { data, loading, error } = useApi<any>("/api/intelligence/inventory/abc-xyz", refreshKey);
  const [filter, setFilter] = useState<string>("ALL");
  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return <Empty msg="Veri yok." />;
  const rows: any[] = data.rows ?? [];
  const shown = filter === "ALL" ? rows : filter.length === 2 ? rows.filter((r) => r.composite === filter) : rows.filter((r) => r.risk === filter);
  const classes = ["AX","AY","AZ","BX","BY","BZ","CX","CY","CZ"];
  const riskBadge = (risk: string) =>
    ({ STOCKOUT: badgeCls("bad"), OVERSTOCK: badgeCls("warn"), DEAD_STOCK: badgeCls("muted"), NONE: badgeCls("ok") }[risk] ?? badgeCls("muted"));
  return (
    <div className="space-y-4">
      <div className={cardPad}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className={h2}>ABC-XYZ Inventory Intelligence</h3>
            <p className={sub}>ABC = yıllık tüketim değeri (adet × cari maliyet), kümülatif %{Math.round((data.thresholds?.aPercent ?? 0.8) * 100)}/%{Math.round((data.thresholds?.bPercent ?? 0.95) * 100)}. XYZ = aylık talep CV (≤{data.thresholds?.xMaxCv} X, ≤{data.thresholds?.yMaxCv} Y). Maliyeti eksik ürünlerde ABC=“N/A”.</p>
          </div>
          <span className={badgeCls(data.costCoverage >= 0.95 ? "ok" : "warn")}>Maliyet kapsamı {pct((data.costCoverage ?? 0) * 100)}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-9 gap-1.5">
        {classes.map((cls) => {
          const m = data.matrix?.[cls] ?? { count: 0, value: 0, qty: 0 };
          const isAz = cls === "AZ" || cls === "CZ";
          return (
            <button key={cls} onClick={() => setFilter(filter === cls ? "ALL" : cls)} className={`rounded-xl border p-2 text-center transition ${filter === cls ? "border-violet-700 bg-violet-50 ring-1 ring-violet-300" : "border-stone-200 bg-white hover:border-stone-300"}`}>
              <p className={`text-sm font-black ${isAz ? "text-rose-700" : "text-stone-800"}`}>{cls}</p>
              <p className="text-[13px] font-black text-stone-900">{m.count}</p>
              <p className="text-[8px] text-stone-400 tabular-nums">{tl(m.value)}</p>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-1.5 items-center text-[10px]">
        <span className="text-stone-400 font-bold">Risk filtresi:</span>
        {["ALL", "STOCKOUT", "OVERSTOCK", "DEAD_STOCK"].map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`px-2 py-1 rounded-lg border font-bold ${filter === f ? "bg-stone-900 text-white border-stone-900" : "border-stone-300 text-stone-600"}`}>{f === "ALL" ? "Tümü" : f}</button>
        ))}
        <span className="text-stone-400 ml-2">{shown.length} ürün listeleniyor</span>
      </div>

      <div className={`${card} overflow-x-auto`}>
        <table className="min-w-full text-[10px]">
          <thead><tr className="text-left text-stone-400"><th className="px-3 py-2">Ürün</th><th className="px-2 py-2 text-center">ABC</th><th className="px-2 py-2 text-center">XYZ</th><th className="px-2 py-2 text-center">Sınıf</th><th className="px-2 py-2 text-right">Yıl Ciro-Değeri</th><th className="px-2 py-2 text-right">Gün Stok</th><th className="px-2 py-2 text-right">Turnover</th><th className="px-2 py-2">Risk</th></tr></thead>
          <tbody>
            {shown.slice(0, 60).map((r) => (
              <tr key={r.productId} className="border-t border-stone-100">
                <td className="px-3 py-1.5 max-w-[240px]"><p className="font-bold text-stone-800 truncate" title={r.productName}>{r.productName}</p><p className="text-[8px] text-stone-400 font-mono">{r.sku}</p></td>
                <td className="px-2 py-1.5 text-center font-black">{r.abcClass}</td>
                <td className="px-2 py-1.5 text-center font-black">{r.xyzClass}</td>
                <td className="px-2 py-1.5 text-center"><span className="px-1.5 py-0.5 rounded bg-stone-100 font-black text-stone-800">{r.composite}</span></td>
                <td className="px-2 py-1.5 text-right tabular-nums">{tl(r.annualValue)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{r.daysOfCover ?? "—"}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{r.turnover ?? "—"}</td>
                <td className="px-2 py-1.5"><span className={riskBadge(r.risk)}>{r.risk}</span></td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-stone-400">Bu filtrede ürün yok.</td></tr>}
          </tbody>
        </table>
      </div>
      <SectionNote notes={data.notes} />
    </div>
  );
}

/* ---------------- 8) TAHMİN DOĞRULUĞU ---------------- */
function AccuracyTab({ refreshKey }: { refreshKey: number }) {
  const { data, loading, error } = useApi<any>("/api/intelligence/accuracy", refreshKey);
  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return <Empty msg="Veri yok." />;
  const eligible = (data.models ?? []).filter((m: any) => m.eligible);
  const skipped = (data.models ?? []).filter((m: any) => !m.eligible);
  return (
    <div className="space-y-4">
      <div className={cardPad}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className={h2}>Forecast Accuracy / Backtesting</h3>
            <p className={sub}>{data.method}</p>
          </div>
          <div className="flex items-center gap-2">
            {data.dataQuality === "INSUFFICIENT_DATA" && <span className={badgeCls("bad")}>INSUFFICIENT_DATA</span>}
            {data.bestModel && <span className={badgeCls("ok")}>En iyi: {data.bestModel.label} (WAPE %{num(data.bestModel.wape, 2)})</span>}
          </div>
        </div>
        <p className="mt-2 text-[10px] text-stone-500">Mağaza geneli seri — {data.storeSampleSize} gün örneklem. MAPE, gerçekleşen=0 günlerde hesaplanmaz; WAPE paydası 0 ise null. Backtest ≠ gelecek garantisi.</p>
      </div>

      <div className={`${card} overflow-x-auto`}>
        <table className="min-w-full text-[10px]">
          <thead><tr className="text-left text-stone-400"><th className="px-3 py-2">Model</th><th className="px-2 py-2 text-right">MAE</th><th className="px-2 py-2 text-right">RMSE</th><th className="px-2 py-2 text-right">MAPE</th><th className="px-2 py-2 text-right">WAPE</th><th className="px-2 py-2 text-right">MASE</th><th className="px-2 py-2 text-right">Bias</th><th className="px-2 py-2 text-right">Örneklem</th></tr></thead>
          <tbody>
            {eligible.map((m: any) => {
              const isBest = data.bestModel?.model === m.model;
              return (
                <tr key={m.model} className={`border-t border-stone-100 ${isBest ? "bg-emerald-50/60" : ""}`}>
                  <td className="px-3 py-1.5 font-bold text-stone-800">{m.label}{isBest && <span className="ml-1 text-[8px] text-emerald-700">◀ EN İYİ</span>}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{num(m.mae, 3)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{num(m.rmse, 3)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{m.mape == null ? "—" : pct(m.mape, 2)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-black">{m.wape == null ? "—" : pct(m.wape, 2)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{m.mase == null ? "—" : num(m.mase, 3)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{num(m.bias, 3)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{m.sampleSize}</td>
                </tr>
              );
            })}
            {eligible.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-stone-400">Uygun model yok — daha fazla geçmiş veri gerekli.</td></tr>}
          </tbody>
        </table>
      </div>
      {skipped.length > 0 && (
        <p className="text-[9px] text-stone-400">Uygun olmayan modeller: {skipped.map((m: any) => `${m.label} (${m.skipReason})`).join(" · ")}</p>
      )}

      {data.persisted?.length > 0 && (
        <div className={cardPad}>
          <h3 className={h2}>Kayıtlı Tahmin Değerlendirmeleri (gerçekleşen vs tahmin)</h3>
          <div className="overflow-x-auto -mx-2 mt-1">
            <table className="min-w-full text-[10px]">
              <thead><tr className="text-left text-stone-400"><th className="px-2 py-1">Kapsam</th><th className="px-2 py-1">Model</th><th className="px-2 py-1 text-right">MAE</th><th className="px-2 py-1 text-right">WAPE</th><th className="px-2 py-1 text-right">Bias</th><th className="px-2 py-1">Tarih</th></tr></thead>
              <tbody>
                {data.persisted.map((p: any, i: number) => (
                  <tr key={i} className="border-t border-stone-100"><td className="px-2 py-1">{p.scopeLabel}</td><td className="px-2 py-1">{p.model}</td><td className="px-2 py-1 text-right tabular-nums">{num(p.mae, 3)}</td><td className="px-2 py-1 text-right tabular-nums">{p.wape == null ? "—" : pct(p.wape, 2)}</td><td className="px-2 py-1 text-right tabular-nums">{num(p.bias, 3)}</td><td className="px-2 py-1 text-stone-500">{p.evaluatedAt ? new Date(p.evaluatedAt).toLocaleDateString("tr-TR") : "—"}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <SectionNote notes={data.notes} />
    </div>
  );
}

/* ---------------- 9) AYARLAR ---------------- */
function SettingsTab({ refreshKey }: { refreshKey: number }) {
  const { data, loading, error } = useApi<{ items: Array<{ key: string; value: string; description: string; defaultValue: string }> }>("/api/intelligence/settings", refreshKey);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (data?.items) {
      const d: Record<string, string> = {};
      for (const it of data.items) d[it.key] = it.value;
      setDrafts(d);
    }
  }, [data]);

  const save = async (key: string) => {
    setBusy(key);
    setMsg(null);
    try {
      const res = await authFetch("/api/intelligence/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, value: drafts[key] }) });
      const json = await res.json();
      if (json.success) setMsg({ ok: true, text: `${key} kaydedildi.` });
      else setMsg({ ok: false, text: json?.error?.message || "Kaydedilemedi." });
    } catch {
      setMsg({ ok: false, text: "Sunucuya ulaşılamadı." });
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return <Empty msg="Veri yok." />;
  return (
    <div className="space-y-4">
      <div className={cardPad}>
        <div className="flex items-start gap-2">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h3 className={h2}>Intelligence Parametreleri</h3>
            <p className={sub}>Eşikleri yalnız <b>Süper Admin</b> değiştirebilir. Geçersiz/uç değerler sunucuda reddedilir. Değişiklikler audit log’a işlenir ve 5 dakikalık önbellek temizlenir. Sayısal olmayan / negatif değerler kabul edilmez.</p>
          </div>
        </div>
        {msg && <p className={`mt-2 text-[10px] font-bold ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</p>}
      </div>
      <div className={`${card} divide-y divide-stone-100`}>
        {data.items.map((it) => (
          <div key={it.key} className="p-3 flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-black text-stone-800 font-mono">{it.key}</p>
              <p className="text-[10px] text-stone-500">{it.description}</p>
              <p className="text-[9px] text-stone-400">Varsayılan: {it.defaultValue}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <input className={`${inputCls} w-24 text-right tabular-nums`} value={drafts[it.key] ?? ""} onChange={(e) => setDrafts((d) => ({ ...d, [it.key]: e.target.value }))} />
              <button onClick={() => save(it.key)} disabled={busy === it.key} className="px-3 py-2 rounded-xl bg-stone-900 text-white text-[10px] font-bold hover:bg-stone-800 disabled:opacity-50 transition">Kaydet</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
