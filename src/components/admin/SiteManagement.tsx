"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  PanelTop,
  PanelBottom,
  Database,
  Save,
  RefreshCw,
  Archive,
  Download,
  ShieldCheck,
  HardDrive,
  Server,
  Table2,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { DEFAULT_SITE_SETTINGS } from "@/lib/site-settings-shared";

type SiteTab = "header" | "footer" | "database";

const inputCls =
  "w-full px-3 py-2 border border-stone-300 rounded-xl text-xs focus:outline-none focus:border-amber-700 bg-white";
const labelCls = "block text-[10px] font-bold text-stone-500 uppercase mb-1";

function PanelShell({
  title,
  desc,
  icon: Icon,
  children,
}: {
  title: string;
  desc: string;
  icon: any;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div>
        <span className="text-[10px] font-black uppercase tracking-widest text-amber-800">SİTE YÖNETİMİ</span>
        <h2 className="text-xl font-black text-stone-900 flex items-center gap-2">
          <Icon className="w-5 h-5 text-amber-800" /> {title}
        </h2>
        <p className="text-xs text-stone-500">{desc}</p>
      </div>
      {children}
    </div>
  );
}

function useSiteSettings() {
  const [form, setForm] = useState<Record<string, string>>(DEFAULT_SITE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; isError: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/site-settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.success && d.data) setForm({ ...DEFAULT_SITE_SETTINGS, ...d.data });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async (keys: string[]) => {
    setSaving(true);
    setFeedback(null);
    try {
      const patch: Record<string, string> = {};
      for (const k of keys) patch[k] = form[k] ?? "";
      const res = await fetch("/api/site-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patch }),
      });
      const data = await res.json();
      if (!data.success) {
        setFeedback({ text: data?.error?.message || "Kaydedilemedi.", isError: true });
        return;
      }
      if (data.data) setForm({ ...DEFAULT_SITE_SETTINGS, ...data.data });
      window.dispatchEvent(new Event("site-settings-updated"));
      setFeedback({ text: "Kaydedildi. Vitrindeki başlık/altbilgiyi yenilediğinizde görünür.", isError: false });
    } catch {
      setFeedback({ text: "Sunucuya ulaşılamadı.", isError: true });
    } finally {
      setSaving(false);
    }
  };

  return { form, setForm, loading, saving, feedback, save };
}

function Feedback({ feedback }: { feedback: { text: string; isError: boolean } | null }) {
  if (!feedback) return null;
  return (
    <div
      className={`p-2.5 rounded-xl text-xs font-medium border ${
        feedback.isError ? "bg-rose-50 border-rose-200 text-rose-800" : "bg-emerald-50 border-emerald-200 text-emerald-800"
      }`}
    >
      {feedback.text}
    </div>
  );
}

const HEADER_KEYS = [
  "site.header.announcement_enabled",
  "site.header.announcement_text",
  "site.header.support_phone",
  "site.brand_name",
  "site.brand_tagline",
];

const FOOTER_KEYS = [
  "site.footer.description",
  "site.footer.store_address",
  "site.footer.warehouse_address",
  "site.footer.phone_line",
  "site.footer.email",
  "site.footer.copyright",
];

function HeaderSettingsPanel() {
  const { form, setForm, loading, saving, feedback, save } = useSiteSettings();
  return (
    <PanelShell icon={PanelTop} title="Header Ayarı" desc="Vitrin üst duyuru bandı, marka adı/sloganı ve destek hattını buradan yönetin.">
      {loading ? (
        <p className="text-xs text-stone-400">Yükleniyor…</p>
      ) : (
        <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4 max-w-3xl">
          <Feedback feedback={feedback} />
          <label className="flex items-center gap-3 p-3 rounded-xl border border-stone-200 bg-stone-50 cursor-pointer select-none">
            <input
              type="checkbox"
              className="w-4 h-4 accent-amber-800"
              checked={form["site.header.announcement_enabled"] === "true"}
              onChange={(e) => setForm({ ...form, "site.header.announcement_enabled": e.target.checked ? "true" : "false" })}
            />
            <span className="text-xs font-bold text-stone-800">Üst duyuru bandını göster</span>
          </label>
          <div>
            <label className={labelCls}>Duyuru Metni</label>
            <input className={inputCls} value={form["site.header.announcement_text"]} onChange={(e) => setForm({ ...form, "site.header.announcement_text": e.target.value })} placeholder="1.000 TL ve Üzeri Ücretsiz Kargo…" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Marka Adı</label>
              <input className={inputCls} value={form["site.brand_name"]} onChange={(e) => setForm({ ...form, "site.brand_name": e.target.value })} placeholder="İPEK TUHAFİYE" />
              <p className="text-[10px] text-stone-400 mt-1">Son kelime vurgu renginde gösterilir.</p>
            </div>
            <div>
              <label className={labelCls}>Slogan / Alt Metin</label>
              <input className={inputCls} value={form["site.brand_tagline"]} onChange={(e) => setForm({ ...form, "site.brand_tagline": e.target.value })} placeholder="Dikiş, Nakış, Fermuar & Hobi" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Destek Hattı (üst navigasyonda görünür)</label>
            <input className={inputCls} value={form["site.header.support_phone"]} onChange={(e) => setForm({ ...form, "site.header.support_phone": e.target.value })} placeholder="0850 888 20 26" />
          </div>
          <div className="flex justify-end">
            <button onClick={() => save(HEADER_KEYS)} disabled={saving} className="flex items-center gap-1.5 px-5 py-2.5 bg-amber-800 hover:bg-amber-900 disabled:opacity-60 text-white text-xs font-bold rounded-xl transition">
              <Save className="w-4 h-4" />
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </div>
        </div>
      )}
    </PanelShell>
  );
}

function FooterSettingsPanel() {
  const { form, setForm, loading, saving, feedback, save } = useSiteSettings();
  return (
    <PanelShell icon={PanelBottom} title="Footer Ayarı" desc="Alt bilgi: firma tanıtımı, adresler, telefon/e-posta ve telif metni.">
      {loading ? (
        <p className="text-xs text-stone-400">Yükleniyor…</p>
      ) : (
        <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4 max-w-3xl">
          <Feedback feedback={feedback} />
          <div>
            <label className={labelCls}>Firma Tanıtım Yazısı</label>
            <textarea className={inputCls} rows={3} value={form["site.footer.description"]} onChange={(e) => setForm({ ...form, "site.footer.description": e.target.value })} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Mağaza Adresi</label>
              <input className={inputCls} value={form["site.footer.store_address"]} onChange={(e) => setForm({ ...form, "site.footer.store_address": e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Merkez Depo Adresi</label>
              <input className={inputCls} value={form["site.footer.warehouse_address"]} onChange={(e) => setForm({ ...form, "site.footer.warehouse_address": e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Telefon Hattı</label>
              <input className={inputCls} value={form["site.footer.phone_line"]} onChange={(e) => setForm({ ...form, "site.footer.phone_line": e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>E-posta</label>
              <input className={inputCls} value={form["site.footer.email"]} onChange={(e) => setForm({ ...form, "site.footer.email": e.target.value })} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Telif (Copyright) Metni</label>
            <input className={inputCls} value={form["site.footer.copyright"]} onChange={(e) => setForm({ ...form, "site.footer.copyright": e.target.value })} />
          </div>
          <div className="flex justify-end">
            <button onClick={() => save(FOOTER_KEYS)} disabled={saving} className="flex items-center gap-1.5 px-5 py-2.5 bg-amber-800 hover:bg-amber-900 disabled:opacity-60 text-white text-xs font-bold rounded-xl transition">
              <Save className="w-4 h-4" />
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </div>
        </div>
      )}
    </PanelShell>
  );
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

interface DbInfo {
  engine: string;
  driver: string;
  orm: string;
  journalMode: string;
  integrity: string;
  path: string;
  sizeBytes: number;
  tableCount: number;
  totalRows: number;
  tables: { name: string; rows: number }[];
  backups: { name: string; sizeBytes: number; createdAt: string }[];
}

function DatabaseSettingsPanel() {
  const [info, setInfo] = useState<DbInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [backingUp, setBackingUp] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; isError: boolean } | null>(null);
  const [tableFilter, setTableFilter] = useState("");

  const load = () => {
    setLoading(true);
    fetch("/api/database", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.success) setInfo(d.data);
        else setFeedback({ text: d?.error?.message || "Bilgi alınamadı.", isError: true });
      })
      .catch(() => setFeedback({ text: "Sunucuya ulaşılamadı.", isError: true }))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const backup = async () => {
    setBackingUp(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/database", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "backup" }),
      });
      const d = await res.json();
      if (!d.success) {
        setFeedback({ text: d?.error?.message || "Yedek oluşturulamadı.", isError: true });
        return;
      }
      load();
      setFeedback({ text: "Yedek oluşturuldu (VACUUM INTO — tutarlı kopya).", isError: false });
    } catch {
      setFeedback({ text: "Sunucuya ulaşılamadı.", isError: true });
    } finally {
      setBackingUp(false);
    }
  };

  const filteredTables = useMemo(
    () => (info?.tables || []).filter((t) => t.name.toLowerCase().includes(tableFilter.trim().toLowerCase())),
    [info, tableFilter]
  );

  const integrityOk = info?.integrity === "ok";

  return (
    <PanelShell icon={Database} title="Veritabanı Ayarı" desc="SQLite veritabanının durumu, tablo istatistikleri ve tutarlı yedek alma.">
      <Feedback feedback={feedback} />
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-stone-400">{loading ? "Yükleniyor…" : info ? `Son güncelleme: ${new Date().toLocaleString("tr-TR")}` : ""}</p>
        <div className="flex items-center gap-2">
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-stone-200 hover:border-amber-300 text-stone-700 text-xs font-bold rounded-xl transition">
            <RefreshCw className="w-4 h-4" /> Yenile
          </button>
          <button onClick={backup} disabled={backingUp} className="flex items-center gap-1.5 px-3 py-2 bg-amber-800 hover:bg-amber-900 disabled:opacity-60 text-white text-xs font-bold rounded-xl transition">
            <Archive className="w-4 h-4" /> {backingUp ? "Yedekleniyor…" : "Yedek Oluştur"}
          </button>
        </div>
      </div>

      {info && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-stone-200 space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-stone-500 uppercase"><Server className="w-3.5 h-3.5" /> Motor</div>
              <p className="text-sm font-black text-stone-900">{info.engine}</p>
              <p className="text-[10px] text-stone-400">{info.driver} • {info.orm}</p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-stone-200 space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-stone-500 uppercase"><HardDrive className="w-3.5 h-3.5" /> Dosya</div>
              <p className="text-sm font-black text-stone-900">{formatBytes(info.sizeBytes)}</p>
              <p className="text-[10px] text-stone-400">journal: {info.journalMode || "-"}</p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-stone-200 space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-stone-500 uppercase"><Table2 className="w-3.5 h-3.5" /> Tablolar</div>
              <p className="text-sm font-black text-stone-900">{info.tableCount} tablo</p>
              <p className="text-[10px] text-stone-400">toplam {info.totalRows.toLocaleString("tr-TR")} satır</p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-stone-200 space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-stone-500 uppercase"><ShieldCheck className="w-3.5 h-3.5" /> Bütünlük</div>
              <p className={`text-sm font-black flex items-center gap-1.5 ${integrityOk ? "text-emerald-700" : "text-rose-700"}`}>
                {integrityOk ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                {integrityOk ? "Sağlam" : info.integrity}
              </p>
              <p className="text-[10px] text-stone-400">PRAGMA integrity_check</p>
            </div>
          </div>

          <div className="bg-stone-950 text-stone-200 rounded-2xl px-4 py-3 font-mono text-[11px] break-all">
            <span className="text-amber-400">DATABASE_URL</span> → {info.path}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Yedekler */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-stone-200 overflow-hidden h-max">
              <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
                <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wide">Yedekler ({info.backups.length})</h3>
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-stone-100">
                {info.backups.length === 0 && <p className="px-4 py-6 text-xs text-stone-400 text-center">Henüz yedek yok. “Yedek Oluştur” ile ilk kopyayı alın.</p>}
                {info.backups.map((b) => (
                  <div key={b.name} className="px-4 py-2.5 flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <p className="font-mono font-bold text-stone-800 truncate">{b.name}</p>
                      <p className="text-[10px] text-stone-400">{new Date(b.createdAt).toLocaleString("tr-TR")} • {formatBytes(b.sizeBytes)}</p>
                    </div>
                    <a href={`/api/database?download=${encodeURIComponent(b.name)}`} className="shrink-0 p-2 rounded-lg bg-stone-100 hover:bg-amber-100 text-stone-700 hover:text-amber-900 transition" title="Yedeği indir">
                      <Download className="w-4 h-4" />
                    </a>
                  </div>
                ))}
              </div>
            </div>

            {/* Tablo istatistikleri */}
            <div className="lg:col-span-3 bg-white rounded-2xl border border-stone-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between gap-2">
                <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wide">Tablo İstatistikleri</h3>
                <input value={tableFilter} onChange={(e) => setTableFilter(e.target.value)} placeholder="Tablo filtrele…" className="px-2.5 py-1.5 border border-stone-200 rounded-lg text-[11px] w-40" />
              </div>
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-stone-50 text-stone-500 uppercase sticky top-0">
                    <tr>
                      <th className="py-2 px-4">Tablo</th>
                      <th className="py-2 px-4 text-right">Satır</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {filteredTables.map((t) => (
                      <tr key={t.name} className="hover:bg-stone-50/50">
                        <td className="py-1.5 px-4 font-mono text-[11px] text-stone-800">{t.name}</td>
                        <td className="py-1.5 px-4 text-right font-bold text-stone-900">{t.rows.toLocaleString("tr-TR")}</td>
                      </tr>
                    ))}
                    {filteredTables.length === 0 && (
                      <tr><td colSpan={2} className="py-6 text-center text-stone-400">Eşleşen tablo yok.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </PanelShell>
  );
}

/** SİTE YÖNETİMİ bölümü — tab'a göre paneli seçer. */
export function SiteManagement({ tab }: { tab: SiteTab }) {
  if (tab === "header") return <HeaderSettingsPanel />;
  if (tab === "footer") return <FooterSettingsPanel />;
  return <DatabaseSettingsPanel />;
}
