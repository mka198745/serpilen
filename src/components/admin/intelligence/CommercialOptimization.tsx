"use client";

/**
 * Ticari Optimizasyon (FAZ 2) — Fırsat havuzu + modül analizleri + manuel reklam girişi.
 * Tümü /api/intelligence/commercial/* uçlarından beslenir. Hiçbir FAZ 1 ucu değişmedi;
 * öneriler yönetici onayı olmadan uygulanmaz (bu ekran yalnız öneri/kayıt yönetir).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard, Boxes, Settings, Loader2, RefreshCw, Sparkles,
  AlertTriangle, CheckCircle2, X, ChevronRight, Tag, ShoppingCart, Truck, ShieldAlert, ClipboardList,
} from "lucide-react";
import { authFetch } from "@/lib/client-auth";

const tl = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(n);
const tl2 = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(n);
const pct = (n: number | null | undefined, digits = 1) => (n == null ? "—" : `%${n.toFixed(digits)}`);
const num1 = (n: number | null | undefined, digits = 1) => (n == null ? "—" : n.toFixed(digits));

type ApiState<T> = { data: T | null; loading: boolean; error: string | null };

function useApi<T>(url: string | null, refreshKey: number | string): ApiState<T> {
  // effect içinde SENKRON setState yok; loading, "hangi anahtarın yüklendiği"nden türetilir
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
const chip = "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold";
const badgeCls = (tone: "ok" | "warn" | "bad" | "info" | "muted" | "violet") =>
  ({
    ok: `${chip} bg-emerald-100 text-emerald-800`,
    warn: `${chip} bg-amber-100 text-amber-800`,
    bad: `${chip} bg-rose-100 text-rose-800`,
    info: `${chip} bg-sky-100 text-sky-800`,
    muted: `${chip} bg-stone-100 text-stone-600`,
    violet: `${chip} bg-violet-100 text-violet-900`,
  }[tone]);
const severityCls = (s: string) =>
  ({ CRITICAL: badgeCls("bad"), HIGH: badgeCls("warn"), MEDIUM: badgeCls("info"), LOW: badgeCls("muted") } as Record<string, string>)[s] ?? badgeCls("muted");
const statusCls = (s: string) =>
  ({ NEW: badgeCls("info"), UNDER_REVIEW: badgeCls("warn"), APPROVED: badgeCls("violet"), IN_PROGRESS: badgeCls("violet"), COMPLETED: badgeCls("ok"), REJECTED: badgeCls("muted"), EXPIRED: badgeCls("muted"), CANCELLED: badgeCls("muted") } as Record<string, string>)[s] ?? badgeCls("muted");
const qualityGate = (s?: string) =>
  ({ VERIFIED: badgeCls("ok"), PARTIAL: badgeCls("warn"), INSUFFICIENT_DATA: badgeCls("bad") } as Record<string, string>)[s ?? ""] ?? badgeCls("muted");
const inputCls = "px-3 py-2 border border-stone-300 rounded-xl text-xs bg-white w-full";

function Loading() { return <div className="py-10 flex items-center justify-center gap-2 text-stone-500 text-xs"><Loader2 className="w-4 h-4 animate-spin" /> Hesaplanıyor…</div>; }
function ErrorBox({ msg }: { msg: string }) { return <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />{msg}</div>; }
function Empty({ msg }: { msg: string }) { return <div className="py-10 text-center text-xs text-stone-400">{msg}</div>; }
function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className={`${card} p-3 flex flex-col gap-1`}>
      <span className="text-[9px] uppercase tracking-wider text-stone-400 font-bold leading-tight">{label}</span>
      <span className={`text-base font-black ${tone ?? "text-stone-900"}`}>{value}</span>
    </div>
  );
}
function SectionNote({ notes }: { notes?: string[] }) {
  if (!notes?.length) return null;
  return (
    <details className="text-[10px] text-stone-500">
      <summary className="cursor-pointer font-bold text-stone-600 select-none">Metodoloji & notlar</summary>
      <ul className="list-disc pl-4 mt-1 space-y-0.5">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
    </details>
  );
}
const TH = ({ children, right }: { children?: React.ReactNode; right?: boolean }) => (
  <th className={`px-2 py-1 ${right ? "text-right" : "text-left"}`}>{children}</th>
);
const thRow = "text-stone-400 text-[10px]";
const QUALITY_STATUS_NOTE = "Durum yoksa/yetersizse motor 'INSUFFICIENT_DATA' döner ve fırsat ÜRETİLMEZ — uydurma sonuç yoktur.";

const SUB_TABS = [
  { id: "overview", label: "Özet & Fırsatlar", icon: LayoutDashboard },
  { id: "pricing", label: "Akıllı Fiyatlama", icon: Tag },
  { id: "campaigns", label: "Kampanya & Reklam", icon: ShoppingCart },
  { id: "basket", label: "Sepet Analizi", icon: Boxes },
  { id: "suppliers", label: "Tedarikçi Performansı", icon: Truck },
  { id: "quality", label: "İade & Kalite", icon: ShieldAlert },
  { id: "procurement", label: "Satınalma & Stok", icon: ClipboardList },
  { id: "settings", label: "FAZ 2 Ayarları", icon: Settings },
] as const;
type SubTabId = (typeof SUB_TABS)[number]["id"];

/* ---------------- Fırsat Detay Modalı ---------------- */
function OpportunityDetailModal({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const { data, loading, error } = useApi<any>(`/api/intelligence/commercial/opportunities/${id}`, refreshKey);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [actual, setActual] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const item = data?.item;
  const act = async (action: string) => {
    setBusy(true); setMsg(null);
    try {
      const body: Record<string, unknown> = { action, note: note || undefined };
      if (action === "complete") body.actualProfitImpact = Number(actual);
      const res = await authFetch(`/api/intelligence/commercial/opportunities/${id}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        setMsg({ ok: true, text: action === "complete" ? "Gerçekleşen etki kaydedildi; fırsat tamamlandı." : "Aksiyon uygulandı." });
        setRefreshKey((k) => k + 1);
        onChanged();
      } else setMsg({ ok: false, text: json?.error?.message || "Aksiyon başarısız." });
    } catch {
      setMsg({ ok: false, text: "Sunucuya ulaşılamadı." });
    } finally { setBusy(false); }
  };

  const status: string = item?.status ?? "";
  const canComplete = status === "APPROVED" || status === "IN_PROGRESS";
  const buttons: Array<{ action: string; label: string; show: boolean; tone: "primary" | "danger" | "neutral" }> = [
    { action: "review", label: "İncelemeye Al", show: status === "NEW", tone: "neutral" },
    { action: "approve", label: "Onayla", show: status === "NEW" || status === "UNDER_REVIEW", tone: "primary" },
    { action: "start", label: "Uygulamaya Başla", show: status === "APPROVED", tone: "primary" },
    { action: "reject", label: "Reddet", show: status !== "REJECTED" && status !== "COMPLETED", tone: "danger" },
    { action: "cancel", label: "İptal Et", show: ["NEW", "UNDER_REVIEW", "APPROVED", "IN_PROGRESS"].includes(status), tone: "danger" },
    { action: "reopen", label: "Yeniden Aç", show: ["REJECTED", "CANCELLED", "EXPIRED"].includes(status), tone: "neutral" },
  ];

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-stone-900/50 p-2 sm:p-6" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white border border-stone-200 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-stone-100 px-5 py-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-black text-stone-900 truncate">{item?.title ?? "Fırsat Detayı"}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-500"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4 text-xs">
          {loading && <Loading />}
          {error && <ErrorBox msg={error} />}
          {item && (
            <>
              <div className="flex flex-wrap gap-1.5">
                <span className={statusCls(status)}>{status}</span>
                <span className={severityCls(item.severity)}>{item.severity}</span>
                <span className={badgeCls("muted")}>{item.opportunityType}</span>
                <span className={badgeCls("muted")}>Kaynak: {item.sourceModule}</span>
                {item.ownerName && <span className={badgeCls("info")}>Sahip: {item.ownerName}</span>}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Kpi label="Öncelik" value={num1(item.priorityScore, 0)} />
                <Kpi label="Güven" value={pct(item.confidenceScore, 0)} />
                <Kpi label="Veri Kapsamı" value={pct(item.dataCoverage, 0)} />
                <Kpi label="Tahmini Kâr" value={tl(item.estimatedProfitImpact)} />
              </div>
              <p className="text-stone-700 leading-snug">{item.description}</p>

              <div>
                <p className="font-black text-stone-600 uppercase text-[9px] tracking-wider mb-1">Tahmini Finansal Etki</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                  <div className="rounded-xl bg-stone-50 p-2"><p className="text-stone-400 text-[9px] uppercase">Gelir</p><p className="font-bold tabular-nums">{tl(item.estimatedRevenueImpact)}</p></div>
                  <div className="rounded-xl bg-stone-50 p-2"><p className="text-stone-400 text-[9px] uppercase">Kâr</p><p className="font-bold tabular-nums text-emerald-700">{tl(item.estimatedProfitImpact)}</p></div>
                  <div className="rounded-xl bg-stone-50 p-2"><p className="text-stone-400 text-[9px] uppercase">Maliyet Tasarrufu</p><p className="font-bold tabular-nums">{tl(item.estimatedCostSaving)}</p></div>
                  <div className="rounded-xl bg-stone-50 p-2"><p className="text-stone-400 text-[9px] uppercase">Nakit</p><p className="font-bold tabular-nums">{tl(item.estimatedCashImpact)}</p></div>
                </div>
              </div>

              {Array.isArray(data?.evidence) && data.evidence.length > 0 && (
                <div>
                  <p className="font-black text-stone-600 uppercase text-[9px] tracking-wider mb-1">Kanıtlar</p>
                  <ul className="list-disc pl-5 space-y-0.5 text-stone-700">{data.evidence.map((e: string, i: number) => <li key={i}>{e}</li>)}</ul>
                </div>
              )}
              {Array.isArray(data?.assumptions) && data.assumptions.length > 0 && (
                <div>
                  <p className="font-black text-amber-700 uppercase text-[9px] tracking-wider mb-1">Varsayımlar (ölçülmüş etki değildir)</p>
                  <ul className="list-disc pl-5 space-y-0.5 text-amber-900">{data.assumptions.map((e: string, i: number) => <li key={i}>{e}</li>)}</ul>
                </div>
              )}
              <p className="text-[10px] text-stone-500"><span className="font-bold text-stone-700">Hesaplama yöntemi:</span> {data?.calculationMethod}</p>
              <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
                <p className="font-black text-violet-900 uppercase text-[9px] tracking-wider">Önerilen Aksiyon</p>
                <p className="text-violet-900 mt-0.5 leading-snug">{data?.recommendedAction}</p>
              </div>

              <div className="space-y-1.5">
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Not (opsiyonel — geçmişe ve audit log'a yazılır)" className={inputCls} />
                <div className="flex flex-wrap gap-1.5">
                  {buttons.filter((b) => b.show).map((b) => (
                    <button
                      key={b.action}
                      disabled={busy}
                      onClick={() => act(b.action)}
                      className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition ${
                        b.tone === "primary" ? "bg-violet-800 text-white hover:bg-violet-900"
                        : b.tone === "danger" ? "bg-rose-100 text-rose-800 hover:bg-rose-200"
                        : "bg-stone-100 text-stone-700 hover:bg-stone-200"
                      } disabled:opacity-50`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
                {canComplete && (
                  <div className="flex flex-col sm:flex-row gap-1.5 items-stretch sm:items-center rounded-xl border border-emerald-200 bg-emerald-50 p-2">
                    <input type="number" value={actual} onChange={(e) => setActual(e.target.value)} placeholder="Gerçekleşen kâr etkisi (TL)" className={`${inputCls} sm:max-w-56`} />
                    <button disabled={busy || actual === "" || !Number.isFinite(Number(actual))} onClick={() => act("complete")} className="px-3 py-2 rounded-xl bg-emerald-700 text-white text-[11px] font-bold hover:bg-emerald-800 disabled:opacity-50">
                      Gerçekleşen Etkiyi Kaydet & Tamamla
                    </button>
                  </div>
                )}
                {msg && <p className={`text-[11px] font-bold ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</p>}
              </div>

              {Array.isArray(data?.impacts) && data.impacts.length > 0 && (
                <div>
                  <p className="font-black text-stone-600 uppercase text-[9px] tracking-wider mb-1">Gerçekleşen Etki Ölçümleri</p>
                  <ul className="space-y-1">{data.impacts.map((i: any) => (
                    <li key={i.id} className="flex flex-wrap justify-between gap-2 rounded-xl bg-stone-50 p-2">
                      <span>Beklenen {tl(i.expectedProfitImpact)} → gerçekleşen <b>{tl(i.actualProfitImpact)}</b></span>
                      <span className="text-stone-500">Gerçekleşme: <b>{i.realizationRate != null ? pct(i.realizationRate, 0) : "—"}</b> · {i.measuredBy} · {new Date(i.measuredAt).toLocaleDateString("tr-TR")}</span>
                    </li>
                  ))}</ul>
                </div>
              )}

              {Array.isArray(data?.history) && data.history.length > 0 && (
                <div>
                  <p className="font-black text-stone-600 uppercase text-[9px] tracking-wider mb-1">Geçmiş ({data.history.length})</p>
                  <ol className="space-y-1 max-h-48 overflow-y-auto">{data.history.map((h: any) => (
                    <li key={h.id} className="flex items-start gap-2 text-[10px]">
                      <span className={badgeCls("muted")}>{h.action}</span>
                      <span className="text-stone-600 flex-1">{h.fromStatus ? `${h.fromStatus} → ${h.toStatus}` : "—"} · {h.details}</span>
                      <span className="text-stone-400 whitespace-nowrap">{h.actorName} · {new Date(h.createdAt).toLocaleDateString("tr-TR")}</span>
                    </li>
                  ))}</ol>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Fırsat Havuzu Tablosu ---------------- */
function OpportunitiesTable({ items, onSelect }: { items: any[]; onSelect: (id: number) => void }) {
  if (!items?.length) return <Empty msg="Filtreye uygun fırsat yok. 'Ticari Analizi Çalıştır' ile üretimi tetikleyin." />;
  return (
    <div className="overflow-x-auto -mx-2">
      <table className="min-w-full text-[10px]">
        <thead>
          <tr className={thRow}>
            <TH>Öncelik</TH><TH>Ciddiyet</TH><TH>Tür</TH><TH>Başlık</TH><TH>Kaynak</TH>
            <TH right>Güven</TH><TH right>Kapsam</TH><TH right>Tahmini Kâr</TH><TH>Durum</TH><TH></TH>
          </tr>
        </thead>
        <tbody>
          {items.map((o: any) => (
            <tr key={o.id} className="border-t border-stone-100 hover:bg-stone-50 cursor-pointer" onClick={() => onSelect(o.id)}>
              <td className="px-2 py-1.5 tabular-nums font-black text-stone-900">{num1(o.priorityScore, 0)}</td>
              <td className="px-2 py-1.5"><span className={severityCls(o.severity)}>{o.severity}</span></td>
              <td className="px-2 py-1.5 text-stone-500 max-w-[140px] truncate" title={o.opportunityType}>{o.opportunityType}</td>
              <td className="px-2 py-1.5 max-w-[320px]"><span className="font-bold text-stone-800 line-clamp-2 leading-snug">{o.title}</span></td>
              <td className="px-2 py-1.5 text-stone-500">{o.sourceModule}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{pct(o.confidenceScore, 0)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{pct(o.dataCoverage, 0)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums font-bold text-emerald-800">{tl(o.estimatedProfitImpact)}</td>
              <td className="px-2 py-1.5"><span className={statusCls(o.status)}>{o.status}</span></td>
              <td className="px-2 py-1.5 text-stone-400"><ChevronRight className="w-4 h-4" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- 1) ÖZET & FIRSATLAR ---------------- */
function OverviewView({ refreshKey, onChanged, onOpenOpportunity }: { refreshKey: number | string; onChanged: () => void; onOpenOpportunity: (id: number) => void }) {
  const { data, loading, error } = useApi<any>("/api/intelligence/commercial/summary", refreshKey);
  const [running, setRunning] = useState(false);
  const [analyzeMsg, setAnalyzeMsg] = useState<{ ok: boolean; text: string; modules?: Array<{ module: string; status: string; opportunitiesGenerated: number }> } | null>(null);

  const runAnalyze = async () => {
    setRunning(true); setAnalyzeMsg(null);
    try {
      const res = await authFetch("/api/intelligence/commercial/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const json = await res.json();
      if (json.success) {
        setAnalyzeMsg({ ok: true, text: `Analiz tamamlandı — ${json.data?.upserted?.created ?? 0} yeni, ${json.data?.upserted?.updated ?? 0} güncellenen fırsat; ${json.data?.expired ?? 0} süresi doldu.`, modules: json.data?.modules });
      } else setAnalyzeMsg({ ok: false, text: json?.error?.message || "Analiz çalıştırılamadı." });
      onChanged();
    } catch {
      setAnalyzeMsg({ ok: false, text: "Sunucuya ulaşılamadı." });
    } finally { setRunning(false); }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return <Empty msg="Özet alınamadı." />;

  const counts = data.countsByStatus ?? {};
  const openCount = data.openCount ?? 0;
  return (
    <div className="space-y-4">
      <div className={cardPad}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className={h2}>Ticari Optimizasyon Motoru</h3>
            <p className={sub}>6 modül (fiyatlama, kampanya/reklam, sepet, tedarikçi, kalite/iade, satınalma) fırsat üretir; kayıtlar fırsat havuzuna düşer. Hiçbir ürün fiyatı/siparişi/stok kaydı otomatik DEĞİŞTİRİLMEZ — uygulama yönetici onayıyla.</p>
          </div>
          <button
            onClick={runAnalyze}
            disabled={running}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-800 hover:bg-violet-900 disabled:opacity-60 text-white text-xs font-bold transition self-start"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {running ? "Analiz çalışıyor…" : "Ticari Analizi Çalıştır"}
          </button>
        </div>
        {analyzeMsg && (
          <div className={`mt-3 p-3 rounded-xl border text-xs ${analyzeMsg.ok ? "bg-emerald-50 border-emerald-200 text-emerald-900" : "bg-rose-50 border-rose-200 text-rose-900"}`}>
            <p className="font-bold flex items-center gap-1.5">{analyzeMsg.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}{analyzeMsg.text}</p>
            {Array.isArray(analyzeMsg.modules) && (
              <ul className="list-disc pl-5 mt-1.5 space-y-0.5">
                {analyzeMsg.modules.map((m) => <li key={m.module}>{m.module}: {m.opportunitiesGenerated} fırsat · veri: {m.status}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-2">
        <Kpi label="Açık Fırsat" value={String(openCount)} tone={openCount > 0 ? "text-violet-900" : undefined} />
        <Kpi label="Açık Tahmini Kâr" value={tl(data.openEstimatedProfitImpact)} tone="text-emerald-700" />
        <Kpi label="Açık Nakit Etkisi" value={tl(data.openEstimatedCashImpact)} />
        <Kpi label="Onay Bekleyen" value={String((counts.NEW ?? 0) + (counts.UNDER_REVIEW ?? 0))} />
        <Kpi label="Uygulamada" value={String(counts.IN_PROGRESS ?? 0)} />
        <Kpi label="Tamamlanan" value={String(counts.COMPLETED ?? 0)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={cardPad}>
          <h3 className={h2}>Önceliği En Yüksek Fırsatlar</h3>
          {!data.topPriorities?.length ? <Empty msg="Açık fırsat yok — analiz çalıştırın." /> : (
            <ul className="mt-2 divide-y divide-stone-100">
              {data.topPriorities.map((o: any) => (
                <li key={o.id}>
                  <button onClick={() => onOpenOpportunity(o.id)} className="w-full text-left py-2 flex items-start gap-2 hover:bg-stone-50 rounded-lg px-1">
                    <span className="tabular-nums font-black text-stone-900 w-7 shrink-0">{num1(o.priorityScore, 0)}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[11px] font-bold text-stone-800 line-clamp-2 leading-snug">{o.title}</span>
                      <span className="flex flex-wrap gap-1 mt-1"><span className={severityCls(o.severity)}>{o.severity}</span><span className={badgeCls("muted")}>{o.sourceModule}</span><span className="text-[9px] text-stone-400 self-center">{tl(o.estimatedProfitImpact)} kâr</span></span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-4">
          <div className={cardPad}>
            <h3 className={h2}>Açık Fırsatlar (Modül Bazında)</h3>
            {!Object.keys(data.openByModule ?? {}).length ? <Empty msg="Açık fırsat yok." /> : (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {Object.entries(data.openByModule as Record<string, number>).map(([m, c]) => <span key={m} className={badgeCls("violet")}>{m}: {c}</span>)}
              </div>
            )}
          </div>
          <div className={cardPad}>
            <h3 className={h2}>Son Tamamlananlar (Gerçekleşme)</h3>
            {!data.recentCompleted?.length ? <Empty msg="Henüz tamamlanan fırsat yok." /> : (
              <ul className="mt-2 space-y-1.5 text-[11px]">
                {data.recentCompleted.map((c: any) => (
                  <li key={c.opportunityId} className="flex items-center justify-between gap-2 rounded-xl bg-stone-50 px-2 py-1.5">
                    <span className="text-stone-600">Fırsat #{c.opportunityId} · gerçekleşen {tl(c.actualProfitImpact)}</span>
                    <span className={badgeCls(c.realizationRate != null && c.realizationRate >= 70 ? "ok" : c.realizationRate != null && c.realizationRate >= 0 ? "warn" : "muted")}>{c.realizationRate != null ? `gerçekleşme ${pct(c.realizationRate, 0)}` : "ölçüldü"}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <SectionNote notes={[
        "Fırsat rekabetçi zekâ DEĞİLDİR: rakip fiyat/veri yoktur; varsayımlar her fırsatta açıkça yazar.",
        "Öneriler otomatik UYGULANMAZ; onay akışı NEW → UNDER_REVIEW → APPROVED → IN_PROGRESS → COMPLETED.",
        "Gerçekleşme oranı = gerçekleşen / beklenen kâr; beklenen sıfırsa tanımsız gösterilir.",
        QUALITY_STATUS_NOTE,
      ]} />
    </div>
  );
}

/* ---------------- 2) FIRSAT HAVUZU ---------------- */
function OpportunitiesView({ refreshKey, onChanged, onOpenOpportunity }: { refreshKey: number | string; onChanged: () => void; onOpenOpportunity: (id: number) => void }) {
  const [status, setStatus] = useState("OPEN");
  const [module, setModule] = useState("ALL");
  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (status === "OPEN") p.set("status", "NEW,UNDER_REVIEW,APPROVED,IN_PROGRESS");
    else if (status !== "ALL") p.set("status", status);
    if (module !== "ALL") p.set("module", module);
    p.set("limit", "100");
    return `?${p.toString()}`;
  }, [status, module]);
  const { data, loading, error } = useApi<any>(`/api/intelligence/commercial/opportunities${params}`, refreshKey);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[10px] font-bold text-stone-500 uppercase">Durum
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputCls} mt-1`}>
            {["OPEN", "ALL", "NEW", "UNDER_REVIEW", "APPROVED", "IN_PROGRESS", "COMPLETED", "REJECTED", "EXPIRED", "CANCELLED"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="text-[10px] font-bold text-stone-500 uppercase">Modül
          <select value={module} onChange={(e) => setModule(e.target.value)} className={`${inputCls} mt-1`}>
            {["ALL", "pricing", "campaigns", "basket", "suppliers", "quality", "procurement"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <span className="text-[10px] text-stone-400 self-end pb-2">{data?.total ?? 0} kayıt · satıra tıklayın</span>
        <button onClick={onChanged} className="ml-auto self-end pb-1.5 flex items-center gap-1 text-[11px] font-bold text-violet-800 hover:underline"><RefreshCw className="w-3.5 h-3.5" /> Yenile</button>
      </div>
      <div className={cardPad}>
        {loading ? <Loading /> : error ? <ErrorBox msg={error} /> : <OpportunitiesTable items={data?.items ?? []} onSelect={onOpenOpportunity} />}
      </div>
    </div>
  );
}

/* ---------------- 3) SMART PRICING ---------------- */
const pricingFlagLabel: Record<string, string> = {
  NEGATIVE_CONTRIBUTION: "Maliyet altı",
  LOW_MARGIN_HIGH_VOLUME: "Düşük marj",
  CAMPAIGN_BELOW_COST: "Kampanya < maliyet",
  DISCOUNT_MARGIN_LEAK: "İndirim kaçağı",
  COST_UNKNOWN: "Maliyet yok",
};

function PricingView({ refreshKey }: { refreshKey: number | string }) {
  const { data, loading, error } = useApi<any>("/api/intelligence/commercial/pricing", refreshKey);
  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return <Empty msg="Fiyat analizi alınamadı." />;
  const s = data.summary;
  const flagged = (data.rows ?? []).filter((r: any) => r.flags?.length);
  return (
    <div className="space-y-4">
      <div className={cardPad}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className={h2}>Smart Pricing</h3>
            <p className={sub}>Katkı marjı, hedef marj fiyatı, kampanya-altı-maliyet ve indirim kaçağı tespiti. Rakip fiyat verisi yoktur — simülasyonlar düz talep varsayar (her öneride yazar).</p>
          </div>
          <span className={qualityGate(data.dataQuality?.status)}>{data.dataQuality?.status}</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
          <Kpi label="Ürün" value={String(s?.productCount ?? 0)} />
          <Kpi label="Maliyet Kapsamı" value={pct(s?.costCoveragePct, 0)} />
          <Kpi label="Maliyet Altı Satış" value={String(s?.negativeContributionCount ?? 0)} tone="text-rose-700" />
          <Kpi label="Düşük Marjlı Hacim" value={String(s?.lowMarginCount ?? 0)} tone="text-amber-700" />
        </div>
      </div>
      <div className={cardPad}>
        <h3 className={h2}>İşaretlenen Ürünler ({flagged.length})</h3>
        {flagged.length === 0 ? <Empty msg="İşaretlenen ürün yok — maliyeti bilinen kalemlerde sorun tespit edilmedi." /> : (
          <div className="overflow-x-auto -mx-2">
            <table className="min-w-full text-[10px]">
              <thead><tr className={thRow}><TH>Ürün</TH><TH right>Fiyat</TH><TH right>Maliyet</TH><TH right>Katkı %</TH><TH right>Satış Adet</TH><TH right>Gerçek Ort.</TH><TH right>Önerilen</TH><TH>Bayraklar</TH></tr></thead>
              <tbody>
                {flagged.slice(0, 50).map((r: any) => (
                  <tr key={r.productId} className="border-t border-stone-100">
                    <td className="px-2 py-1.5 max-w-[220px] truncate font-medium text-stone-800" title={r.name}>{r.name}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{tl2(r.effectivePrice)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{tl2(r.unitCost)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{pct(r.contributionMarginPct)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{r.unitsSold}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{tl2(r.realizedPrice)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-bold text-violet-800">{r.suggestedPrice != null ? tl2(r.suggestedPrice) : "—"}</td>
                    <td className="px-2 py-1.5"><span className="flex flex-wrap gap-1">{r.flags.map((f: string) => <span key={f} className={f === "NEGATIVE_CONTRIBUTION" ? badgeCls("bad") : badgeCls("warn")}>{pricingFlagLabel[f] ?? f}</span>)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <SectionNote notes={[
        ...(data.dataQuality?.notes ?? []),
        `Hedef marj %${data.settings?.targetMarginPct}; asgari marj %${data.settings?.minMarginPct}; artış tavanı %${data.settings?.maxSuggestedIncreasePct} — FAZ 2 Ayarları'ndan değiştirilebilir.`,
        `Dönem: son ${data.periodDays} gün. Komisyon/kargo/paket maliyetleri şemada yok — katkı brüt katkıdır.`,
      ]} />
    </div>
  );
}

/* ---------------- 4) KAMPANYA & REKLAM ---------------- */
function AdvertisingManager({ refreshKey, onChanged }: { refreshKey: number | string; onChanged: () => void }) {
  const { data, loading, error } = useApi<any>("/api/intelligence/commercial/advertising", refreshKey);
  const [form, setForm] = useState({ name: "", channel: "GOOGLE_ADS", spend: "", impressions: "", clicks: "", conversions: "", revenueAttributed: "", startsOn: new Date().toISOString().slice(0, 10), endsOn: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async () => {
    setBusy(true); setMsg(null);
    try {
      const res = await authFetch("/api/intelligence/commercial/advertising", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name, channel: form.channel,
          spend: Number(form.spend) || 0,
          impressions: Number(form.impressions) || 0,
          clicks: Number(form.clicks) || 0,
          conversions: Number(form.conversions) || 0,
          revenueAttributed: Number(form.revenueAttributed) || 0,
          startsOn: form.startsOn,
          endsOn: form.endsOn || null,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setMsg({ ok: true, text: "Reklam kaydı eklendi." });
        setForm({ ...form, name: "", spend: "", impressions: "", clicks: "", conversions: "", revenueAttributed: "", endsOn: "" });
        onChanged();
      } else setMsg({ ok: false, text: json?.error?.message || "Eklenemedi." });
    } catch { setMsg({ ok: false, text: "Sunucuya ulaşılamadı." }); } finally { setBusy(false); }
  };
  const remove = async (id: number) => {
    setBusy(true);
    try {
      const res = await authFetch(`/api/intelligence/commercial/advertising?id=${id}`, { method: "DELETE" });
      const json = await res.json();
      setMsg(json.success ? { ok: true, text: "Kayıt silindi." } : { ok: false, text: json?.error?.message || "Silinemedi." });
      onChanged();
    } catch { setMsg({ ok: false, text: "Sunucuya ulaşılamadı." }); } finally { setBusy(false); }
  };

  return (
    <div className={cardPad}>
      <h3 className={h2}>Reklam Verisi (Manuel Giriş)</h3>
      <p className={sub}>Platform entegrasyonu yoktur; ROAS/ROI/CAC yalnızca girilen kayıtlarla hesaplanır. Girilmezse ilgili bölümler boş döner — tahmin üretilmez.</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
        <input className={`${inputCls} col-span-2`} placeholder="Reklam/kampanya adı" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <select className={inputCls} value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
          {["GOOGLE_ADS", "META_ADS", "INSTAGRAM", "TIKTOK", "E_MAIL", "FLYER", "OTHER"].map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input className={inputCls} type="number" min="0" placeholder="Harcama (TL)" value={form.spend} onChange={(e) => setForm({ ...form, spend: e.target.value })} />
        <input className={inputCls} type="number" min="0" placeholder="Gösterim" value={form.impressions} onChange={(e) => setForm({ ...form, impressions: e.target.value })} />
        <input className={inputCls} type="number" min="0" placeholder="Tıklama" value={form.clicks} onChange={(e) => setForm({ ...form, clicks: e.target.value })} />
        <input className={inputCls} type="number" min="0" placeholder="Dönüşüm" value={form.conversions} onChange={(e) => setForm({ ...form, conversions: e.target.value })} />
        <input className={inputCls} type="number" min="0" placeholder="Atfedilen ciro (TL)" value={form.revenueAttributed} onChange={(e) => setForm({ ...form, revenueAttributed: e.target.value })} />
        <input className={inputCls} type="date" value={form.startsOn} onChange={(e) => setForm({ ...form, startsOn: e.target.value })} />
        <input className={inputCls} type="date" value={form.endsOn} onChange={(e) => setForm({ ...form, endsOn: e.target.value })} />
        <button disabled={busy || !form.name.trim()} onClick={submit} className="px-3 py-2 rounded-xl bg-violet-800 text-white text-[11px] font-bold hover:bg-violet-900 disabled:opacity-50">Kaydı Ekle</button>
      </div>
      {msg && <p className={`mt-2 text-[11px] font-bold ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</p>}
      {loading ? <Loading /> : error ? <ErrorBox msg={error} /> : (
        <div className="overflow-x-auto -mx-2 mt-2">
          <table className="min-w-full text-[10px]">
            <thead><tr className={thRow}><TH>Ad</TH><TH>Kanal</TH><TH right>Harcama</TH><TH right>Tıklama</TH><TH right>Dönüşüm</TH><TH right>Atfedilen Ciro</TH><TH>Dönem</TH><TH></TH></tr></thead>
            <tbody>
              {data?.items?.length ? data.items.map((a: any) => (
                <tr key={a.id} className="border-t border-stone-100">
                  <td className="px-2 py-1.5 font-medium max-w-[180px] truncate" title={a.name}>{a.name}</td>
                  <td className="px-2 py-1.5 text-stone-500">{a.channel}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{tl2(a.spend)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{a.clicks}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{a.conversions}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{tl2(a.revenueAttributed)}</td>
                  <td className="px-2 py-1.5 text-stone-500 whitespace-nowrap">{a.startsOn}{a.endsOn ? ` → ${a.endsOn}` : " → …"}</td>
                  <td className="px-2 py-1.5 text-right"><button disabled={busy} onClick={() => remove(a.id)} className="text-rose-600 hover:text-rose-800 disabled:opacity-40"><X className="w-4 h-4" /></button></td>
                </tr>
              )) : <tr><td colSpan={8} className="px-2 py-3 text-center text-stone-400">Henüz reklam kaydı yok — ROAS hesaplanmaz.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CampaignsView({ refreshKey, onChanged }: { refreshKey: number | string; onChanged: () => void }) {
  const innerKey = refreshKey;
  const { data, loading, error } = useApi<any>("/api/intelligence/commercial/campaigns", innerKey);
  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return <Empty msg="Kampanya analizi alınamadı." />;
  const t = data.totals;
  return (
    <div className="space-y-4">
      <div className={cardPad}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className={h2}>Kampanya & Reklam Performansı</h3>
            <p className={sub}>İndirim bütçesi, kupon kullanımı, ROI/ROAS/CAC (manuel reklam girdisiyle). Kampanya atfı sipariş bazında YOKTUR; pencere × hedef eşleştirmesi tahminidir ve öyle etiketlenir.</p>
          </div>
          <span className={qualityGate(data.dataQuality?.status)}>{data.dataQuality?.status}</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 mt-3">
          <Kpi label="Geçerli Sipariş" value={String(t?.validOrders ?? 0)} />
          <Kpi label="İndirim Toplamı" value={tl(t?.discountTotal)} />
          <Kpi label="İndirim Oranı" value={pct(t?.discountRatioPct)} />
          <Kpi label="Aktif Kampanya / Kupon" value={`${t?.activePromotions ?? 0} / ${t?.activeCoupons ?? 0}`} />
          <Kpi label="Reklam Harcaması" value={tl(t?.adSpend)} />
          <Kpi label="Reklam ROAS" value={t?.adRoas != null ? num1(t.adRoas, 2) : "—"} tone={t?.adRoas != null && t.adRoas < 1 ? "text-rose-700" : "text-emerald-700"} />
        </div>
        {data.storeAvgContributionPct != null && <p className="mt-2 text-[10px] text-stone-500">Mağaza katkı oranı varsayımı: %{num1(data.storeAvgContributionPct, 1)} (maliyeti bilinen geçerli satırlar).</p>}
      </div>

      <div className={cardPad}>
        <h3 className={h2}>Kampanyalar ({data.promotions?.length ?? 0})</h3>
        {!data.promotions?.length ? <Empty msg="Kampanya kaydı yok." /> : (
          <div className="overflow-x-auto -mx-2">
            <table className="min-w-full text-[10px]">
              <thead><tr className={thRow}><TH>Ad</TH><TH>Kapsam</TH><TH>Kural</TH><TH right>Kullanım</TH><TH right>Gün</TH><TH right>Tahmini İndirim Maliyeti</TH><TH>Durum</TH></tr></thead>
              <tbody>
                {data.promotions.map((p: any) => (
                  <tr key={p.id} className="border-t border-stone-100">
                    <td className="px-2 py-1.5 max-w-[220px] truncate font-medium" title={p.name}>{p.name}</td>
                    <td className="px-2 py-1.5 text-stone-500">{p.scope}</td>
                    <td className="px-2 py-1.5 text-stone-500">{p.ruleType}{p.percentValue != null ? ` %${p.percentValue}` : p.fixedValue != null ? ` ${tl2(p.fixedValue)}` : ""}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{p.usedCount}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{p.daysRunning}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{p.estimatedDiscountCost != null ? tl(p.estimatedDiscountCost) : "—"}</td>
                    <td className="px-2 py-1.5"><span className={p.flag === "OK" ? badgeCls("ok") : p.flag === "EXPIRED_BUT_ACTIVE" ? badgeCls("bad") : badgeCls("warn")}>{p.flag}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AdvertisingManager refreshKey={innerKey} onChanged={onChanged} />

      {data.advertising?.length > 0 && (
        <div className={cardPad}>
          <h3 className={h2}>Reklam Performansı (ROI / ROAS / CAC)</h3>
          <div className="overflow-x-auto -mx-2">
            <table className="min-w-full text-[10px]">
              <thead><tr className={thRow}><TH>Ad</TH><TH>Kanal</TH><TH right>Harcama</TH><TH right>ROAS</TH><TH right>CAC</TH><TH right>ROI %</TH><TH right>CTR</TH><TH>Sinyal</TH></tr></thead>
              <tbody>
                {data.advertising.map((a: any) => (
                  <tr key={a.id} className="border-t border-stone-100">
                    <td className="px-2 py-1.5 max-w-[180px] truncate font-medium" title={a.name}>{a.name}</td>
                    <td className="px-2 py-1.5 text-stone-500">{a.channel}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{tl2(a.spend)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-bold">{a.roas != null ? num1(a.roas, 2) : "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{a.cac != null ? tl2(a.cac) : "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{a.roiPct != null ? pct(a.roiPct) : "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{a.ctr != null ? pct(a.ctr) : "—"}</td>
                    <td className="px-2 py-1.5"><span className={a.flag === "LOSING" ? badgeCls("bad") : a.flag === "SCALE_UP" ? badgeCls("ok") : a.flag === "LOW_SAMPLE" ? badgeCls("warn") : badgeCls("ok")}>{a.flag}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <SectionNote notes={[data.attributionNote ?? "", ...(data.dataQuality?.notes ?? [])]} />
    </div>
  );
}

/* ---------------- 5) MARKET BASKET ---------------- */
function BasketView({ refreshKey }: { refreshKey: number | string }) {
  const { data, loading, error } = useApi<any>("/api/intelligence/commercial/basket", refreshKey);
  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return <Empty msg="Sepet analizi alınamadı." />;
  const t = data.totals;
  return (
    <div className="space-y-4">
      <div className={cardPad}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className={h2}>Market Basket (Sayaçlı İlişki Madenciliği)</h3>
            <p className={sub}>Tamamlanan siparişlerden destek/güven/lift. Sepet terk/checkout verisi şemada yok — bu bölümde funnel iddiası yoktur.</p>
          </div>
          <span className={qualityGate(data.dataQuality?.status)}>{data.dataQuality?.status}</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
          <Kpi label="Geçerli Sepet" value={String(t?.validOrders ?? 0)} />
          <Kpi label="Ort. Sepet Tutarı" value={tl(t?.avgBasketValue)} />
          <Kpi label="Ort. Kalem / Sepet" value={num1(t?.avgItemsPerOrder)} />
          <Kpi label="Tek Ürün Sepet Payı" value={pct(t?.singleItemOrderPct)} />
        </div>
      </div>
      <div className={cardPad}>
        <h3 className={h2}>Birlikte Satılan Çiftler ({data.pairs?.length ?? 0})</h3>
        {!data.pairs?.length ? <Empty msg="Eşiği geçen birliktelik yok (asgari birliktelik ve lift — FAZ 2 Ayarları)." /> : (
          <div className="overflow-x-auto -mx-2">
            <table className="min-w-full text-[10px]">
              <thead><tr className={thRow}><TH>Ürün A</TH><TH>Ürün B</TH><TH right>Birlikte</TH><TH right>Destek</TH><TH right>Güven A→B</TH><TH right>Lift</TH></tr></thead>
              <tbody>
                {data.pairs.map((p: any, i: number) => (
                  <tr key={i} className="border-t border-stone-100">
                    <td className="px-2 py-1.5 max-w-[200px] truncate font-medium" title={p.productA.name}>{p.productA.name}</td>
                    <td className="px-2 py-1.5 max-w-[200px] truncate font-medium" title={p.productB.name}>{p.productB.name}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{p.pairOrders}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{pct(p.supportPct)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{pct(p.confidenceAtoB)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-black text-violet-800">{num1(p.lift, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <SectionNote notes={[...(data.dataQuality?.notes ?? []), "Lift > 1 birliktelik tesadüften güçlüdür; nedensellik DEĞİLDİR.", `Eşikler: asgari ${data.settings?.minPairOrders} birliktelik, lift ≥ ${data.settings?.minLift}.`]} />
    </div>
  );
}

/* ---------------- 6) SUPPLIER PERFORMANCE ---------------- */
function SuppliersView({ refreshKey }: { refreshKey: number | string }) {
  const { data, loading, error } = useApi<any>("/api/intelligence/commercial/suppliers", refreshKey);
  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return <Empty msg="Tedarikçi analizi alınamadı." />;
  return (
    <div className="space-y-4">
      <div className={cardPad}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className={h2}>Tedarikçi Performansı</h3>
            <p className={sub}>Zamanında teslim (expected_date vs ilk mal kabul), doluluk (received/ordered), termin uyumu, PO ürünlerinin iade değeri, birim maliyet trendi, kayıt puanı. Eksik kriterler skor dışı; kapsama % ayrıca verilir.</p>
          </div>
          <span className={qualityGate(data.dataQuality?.status)}>{data.dataQuality?.status}</span>
        </div>
      </div>
      <div className={cardPad}>
        <div className="overflow-x-auto -mx-2">
          <table className="min-w-full text-[10px]">
            <thead><tr className={thRow}><TH>#</TH><TH>Tedarikçi</TH><TH right>PO</TH><TH right>Harcama</TH><TH right>Doluluk</TH><TH right>Zamanında</TH><TH right>Gerçek Termin (gün)</TH><TH right>Skor</TH><TH right>Kapsama</TH></tr></thead>
            <tbody>
              {data.rows?.length ? data.rows.map((r: any) => (
                <tr key={r.supplierId} className="border-t border-stone-100">
                  <td className="px-2 py-1.5 tabular-nums text-stone-400">{r.rank}</td>
                  <td className="px-2 py-1.5 max-w-[220px] truncate font-medium" title={r.name}>{r.name}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{r.poCount}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{tl(r.totalSpend)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{pct(r.fillRatePct)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{pct(r.onTimePct)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{num1(r.avgActualLeadDays)} / taahhüt {r.promisedLeadDays}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-black text-stone-900">{r.score != null ? num1(r.score, 0) : "—"}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{pct(r.coverage, 0)}</td>
                </tr>
              )) : <tr><td colSpan={9} className="px-2 py-3 text-center text-stone-400">Tedarikçi/PO kaydı yok.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {data.categoryConcentration?.length > 0 && (
        <div className={cardPad}>
          <h3 className={h2}>Kategori Yoğunlaşma Riskleri</h3>
          <ul className="mt-2 space-y-1.5 text-[11px]">
            {data.categoryConcentration.map((c: any, i: number) => (
              <li key={i} className="flex flex-wrap items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2">
                <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                <span className="font-bold text-rose-900">{c.categoryName}</span>
                <span className="text-rose-800">{c.supplierName} · %{num1(c.sharePct, 0)} pay</span>
                <span className={badgeCls(c.risk === "SINGLE_SOURCE" ? "bad" : "warn")}>{c.risk}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <SectionNote notes={[...(data.dataQuality?.notes ?? []), "Ürün↔tedarikçi bağı PO geçmişinden türetilir (ayrı şeması yoktur).", "Zamanında teslim yalnızca expected_date girilmiş PO'larda ölçülür."]} />
    </div>
  );
}

/* ---------------- 7) RETURNS & QUALITY ---------------- */
function QualityView({ refreshKey }: { refreshKey: number | string }) {
  const { data, loading, error } = useApi<any>("/api/intelligence/commercial/quality", refreshKey);
  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return <Empty msg="İade/kalite analizi alınamadı." />;
  const t = data.totals;
  const maxBucket = Math.max(1, ...(data.reasonPareto ?? []).map((b: any) => b.count));
  return (
    <div className="space-y-4">
      <div className={cardPad}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className={h2}>İade & Kalite</h3>
            <p className={sub}>İade oranı, iade tutarı, neden Pareto&apos;su (anahtar kelime kümeleme), onaylı yorum ortalaması. Ürün kalite olay tablosu yoktur — sinyaller bunlarla sınırlıdır.</p>
          </div>
          <span className={qualityGate(data.dataQuality?.status)}>{data.dataQuality?.status}</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
          <Kpi label="Gerçekleşen İade" value={String(t?.realizedRefunds ?? 0)} />
          <Kpi label="İade Tutarı" value={tl(t?.realizedRefundAmount)} />
          <Kpi label="Stoka Geri Giren Pay" value={pct(t?.restockedSharePct)} />
          <Kpi label="Toplam İade Kaydı" value={String(t?.totalReturnRows ?? 0)} />
        </div>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className={cardPad}>
          <h3 className={h2}>İade Nedenleri Pareto&apos;su</h3>
          {!data.reasonPareto?.length ? <Empty msg="İade kaydı yok." /> : (
            <div className="space-y-1.5 mt-2">
              {data.reasonPareto.map((b: any) => (
                <div key={b.bucket}>
                  <div className="flex items-center justify-between text-[10px] gap-2">
                    <span className="font-bold text-stone-700">{b.bucket}</span>
                    <span className="text-stone-500 tabular-nums">{b.count} adet · {pct(b.pct, 0)} · {tl(b.refundAmount)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-stone-100 overflow-hidden mt-0.5"><div className="h-full bg-violet-500" style={{ width: `${(b.count / maxBucket) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className={cardPad}>
          <h3 className={h2}>En Çok İade Edilen Ürünler</h3>
          {!data.products?.length ? <Empty msg="Satış/iade kaydı yok." /> : (
            <div className="overflow-x-auto -mx-2">
              <table className="min-w-full text-[10px]">
                <thead><tr className={thRow}><TH>Ürün</TH><TH right>İade %</TH><TH right>Adet</TH><TH right>Tutar</TH><TH right>Yorum</TH></tr></thead>
                <tbody>
                  {data.products.filter((r: any) => r.unitsReturned > 0).slice(0, 12).map((r: any) => (
                    <tr key={r.productId} className="border-t border-stone-100">
                      <td className="px-2 py-1.5 max-w-[200px] truncate font-medium" title={r.name}>{r.name}</td>
                      <td className={`px-2 py-1.5 text-right tabular-nums font-bold ${r.returnRatePct >= 8 ? "text-rose-700" : "text-stone-800"}`}>{pct(r.returnRatePct)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{r.unitsReturned}/{r.unitsSold}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{tl(r.refundValue)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{r.avgRating != null ? `${num1(r.avgRating, 1)}★ (${r.reviewCount})` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <SectionNote notes={[...(data.dataQuality?.notes ?? []), "İade nedeni serbest metindir; kümeleme otomatiktir, hata payı taşır."]} />
    </div>
  );
}

/* ---------------- 8) PROCUREMENT / STOK ---------------- */
function ProcurementView({ refreshKey }: { refreshKey: number | string }) {
  const { data, loading, error } = useApi<any>("/api/intelligence/commercial/procurement", refreshKey);
  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return <Empty msg="Satınalma/stok analizi alınamadı." />;
  const t = data.totals;
  return (
    <div className="space-y-4">
      <div className={cardPad}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className={h2}>Satınalma Optimizasyonu</h3>
            <p className={sub}>Satış hızı + stok + tedarikçi termini: reorder adayları, ölü stok ve fazla stok. Öneriler yönetici onayı olmadan satınalmaya İŞLENMEZ.</p>
          </div>
          <span className={qualityGate(data.dataQuality?.status)}>{data.dataQuality?.status}</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-3">
          <Kpi label="Ölü Stok Değeri" value={tl(t?.deadStockValue)} tone="text-rose-700" />
          <Kpi label="Fazla Stok Değeri" value={tl(t?.overstockExcessValue)} tone="text-amber-700" />
          <Kpi label="Stokta Ürün" value={String(t?.productsWithStock ?? 0)} />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className={cardPad}>
          <h3 className={h2}>Yeniden Sipariş Adayları ({data.reorderCandidates?.length ?? 0})</h3>
          {!data.reorderCandidates?.length ? <Empty msg="Reorder adayı yok." /> : (
            <div className="overflow-x-auto -mx-2">
              <table className="min-w-full text-[10px]">
                <thead><tr className={thRow}><TH>Ürün</TH><TH right>Stok</TH><TH right>Hız/Gün</TH><TH right>Cover</TH><TH right>Önerilen Adet</TH><TH right>Stoksuz Kayıp</TH></tr></thead>
                <tbody>
                  {data.reorderCandidates.map((r: any) => (
                    <tr key={r.productId} className="border-t border-stone-100">
                      <td className="px-2 py-1.5 max-w-[200px] truncate font-medium" title={r.name}>{r.name}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{r.availableQty}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{num1(r.velocityPerDay, 2)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{r.daysCover != null ? `${num1(r.daysCover, 0)}g` : "—"}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-bold text-violet-800">{r.suggestedQty}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{r.estimatedStockoutLoss != null ? tl(r.estimatedStockoutLoss) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="space-y-4">
          <div className={cardPad}>
            <h3 className={h2}>Ölü Stok ({data.deadStock?.length ?? 0})</h3>
            {!data.deadStock?.length ? <Empty msg="Ölü stok tespit edilmedi." /> : (
              <div className="overflow-x-auto -mx-2">
                <table className="min-w-full text-[10px]">
                  <thead><tr className={thRow}><TH>Ürün</TH><TH right>Adet</TH><TH right>Bağlanan Nakit</TH><TH right>Son Satış</TH></tr></thead>
                  <tbody>
                    {data.deadStock.slice(0, 10).map((r: any) => (
                      <tr key={r.productId} className="border-t border-stone-100">
                        <td className="px-2 py-1.5 max-w-[220px] truncate font-medium" title={r.name}>{r.name}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{r.qty}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-rose-700 font-bold">{tl(r.value)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{r.daysSinceLastSale != null ? `${r.daysSinceLastSale}g` : "kayıt yok"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className={cardPad}>
            <h3 className={h2}>Fazla Stok ({data.overstock?.length ?? 0})</h3>
            {!data.overstock?.length ? <Empty msg="Fazla stok tespit edilmedi." /> : (
              <div className="overflow-x-auto -mx-2">
                <table className="min-w-full text-[10px]">
                  <thead><tr className={thRow}><TH>Ürün</TH><TH right>Cover</TH><TH right>Fazla Adet</TH><TH right>Fazla Değer</TH></tr></thead>
                  <tbody>
                    {data.overstock.slice(0, 10).map((r: any) => (
                      <tr key={r.productId} className="border-t border-stone-100">
                        <td className="px-2 py-1.5 max-w-[220px] truncate font-medium" title={r.name}>{r.name}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{num1(r.daysCover, 0)}g</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{r.excessQty}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-amber-800 font-bold">{tl(r.excessValue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
      <SectionNote notes={[...(data.dataQuality?.notes ?? []), "Ölü stok = dönemde sıfır satış + stokta mevcut + maliyeti bilinen SKU.", "Reorder önerileri hız×(termin+hedef kapsam) formülüyledir; satınalmaya otomatik işlenmez."]} />
    </div>
  );
}

/* ---------------- 9) FAZ 2 AYARLARI ---------------- */
function Faz2SettingsView({ refreshKey, onChanged }: { refreshKey: number | string; onChanged: () => void }) {
  const { data, loading, error } = useApi<any>("/api/intelligence/commercial/settings", refreshKey);
  const [edited, setEdited] = useState<Record<string, string> | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const base: Record<string, string> = data?.settings ?? {};
  const drafts = { ...base, ...(edited ?? {}) };

  const save = async (key: string) => {
    setSavingKey(key); setMsg(null);
    try {
      const res = await authFetch("/api/intelligence/commercial/settings", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: drafts[key] }),
      });
      const json = await res.json();
      setMsg(json.success ? { ok: true, text: `${key} kaydedildi.` } : { ok: false, text: json?.error?.message || "Kaydedilemedi." });
      if (json.success) setEdited(null);
      onChanged();
    } catch { setMsg({ ok: false, text: "Sunucuya ulaşılamadı." }); } finally { setSavingKey(null); }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;
  const entries = Object.entries(drafts);
  return (
    <div className={cardPad}>
      <h3 className={h2}>FAZ 2 Ayarları</h3>
      <p className={sub}>Eşikler ve ağırlıklar. Kaydedilen değerler intelligence_settings tablosunda faz2.* anahtarlarıyla saklanır; FAZ 1 ayarları bundan etkilenmez.</p>
      {msg && <p className={`mt-2 text-[11px] font-bold ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</p>}
      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
        {entries.map(([key, value]) => (
          <div key={key} className="flex items-center gap-2 rounded-xl border border-stone-200 p-2">
            <code className="text-[9px] text-stone-500 flex-1 min-w-0 break-all">{key}</code>
            <input value={value} onChange={(e) => setEdited((d) => ({ ...(d ?? base), [key]: e.target.value }))} className="w-24 px-2 py-1.5 border border-stone-300 rounded-lg text-[11px] tabular-nums" />
            <button disabled={savingKey === key} onClick={() => save(key)} className="px-2 py-1.5 rounded-lg bg-violet-800 text-white text-[10px] font-bold hover:bg-violet-900 disabled:opacity-50">{savingKey === key ? "…" : "Kaydet"}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Ana bileşen ---------------- */
export function CommercialOptimization({ refreshKey }: { refreshKey: number | string }) {
  const [tab, setTab] = useState<SubTabId>("overview");
  const [innerKey, setInnerKey] = useState(0);
  const [detailId, setDetailId] = useState<number | null>(null);
  const key = `${refreshKey}:${innerKey}`;
  const changed = useCallback(() => setInnerKey((k) => k + 1), []);
  const openOpportunity = useCallback((id: number) => setDetailId(id), []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5 p-1.5 rounded-2xl bg-violet-50 border border-violet-200">
        {SUB_TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[10px] font-bold transition ${
                active ? "bg-white shadow-xs text-violet-900" : "text-violet-700/70 hover:text-violet-900"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">{t.label}</span>
            </button>
          );
        })}
      </div>

      {tab === "overview" && (
        <>
          <OverviewView refreshKey={key} onChanged={changed} onOpenOpportunity={openOpportunity} />
          <div className={cardPad}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className={h2}>Fırsat Havuzu (Önceliğe Göre)</h3>
              <button onClick={() => setTab("overview")} className="hidden" aria-hidden>—</button>
            </div>
            <div className="mt-2"><OpportunitiesView refreshKey={key} onChanged={changed} onOpenOpportunity={openOpportunity} /></div>
          </div>
        </>
      )}
      {tab === "pricing" && <PricingView refreshKey={key} />}
      {tab === "campaigns" && <CampaignsView refreshKey={key} onChanged={changed} />}
      {tab === "basket" && <BasketView refreshKey={key} />}
      {tab === "suppliers" && <SuppliersView refreshKey={key} />}
      {tab === "quality" && <QualityView refreshKey={key} />}
      {tab === "procurement" && <ProcurementView refreshKey={key} />}
      {tab === "settings" && <Faz2SettingsView refreshKey={key} onChanged={changed} />}

      {detailId != null && <OpportunityDetailModal id={detailId} onClose={() => setDetailId(null)} onChanged={changed} />}
    </div>
  );
}
