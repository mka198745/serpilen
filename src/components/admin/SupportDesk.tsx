"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/client-auth";
import {
  ArrowUpRight,
  CheckCheck,
  Inbox,
  Mail,
  MailOpen,
  MessageSquare,
  Phone,
  RefreshCw,
  User,
} from "lucide-react";

interface ContactMessage {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  subject: string | null;
  message: string;
  status: string; // NEW | READ | ANSWERED
  source: string;
  createdBy: string | null;
  createdAt: string | number;
  readAt: string | number | null;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  NEW: { label: "Yeni", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  READ: { label: "Okundu", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  ANSWERED: { label: "Yanıtlandı", cls: "bg-emerald-50 text-emerald-800 border-emerald-200" },
};

function fmt(d: string | number | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "number" ? new Date(d * 1000) : new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
}

/**
 * Destek Masası — "İletişim & Destek Masası" sayfasındaki "Bize Mesaj Gönderin"
 * formundan gelen mesajları listeler (GET /api/contact) ve durum güncellemesi yapar.
 */
export function SupportDesk() {
  // rows === null → yükleniyor durumu (efekt içinde senkron setState yapılmaz)
  const [rows, setRows] = useState<ContactMessage[] | null>(null);
  const [counts, setCounts] = useState<{ total: number; NEW: number; READ: number; ANSWERED: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"" | "NEW" | "READ" | "ANSWERED">("");
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const requestSeq = useRef(0);
  const loading = rows === null;

  /** Yenile / filtre değişimi: listeyi boşaltıp yeniden yükler. */
  const refresh = useCallback(() => {
    requestSeq.current++;
    setError(null);
    setRows(null);
    setCounts(null);
    setOpenId(null);
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let alive = true;
    const seq = ++requestSeq.current;
    const url = `/api/contact${filter ? `?status=${filter}` : ""}`;
    void (async () => {
      try {
        const res = await authFetch(url, { cache: "no-store" });
        const data = await res.json();
        if (!alive || seq !== requestSeq.current) return;
        if (res.ok && data?.success) {
          setRows(Array.isArray(data.data) ? data.data : []);
          setCounts(data.counts || { total: 0, NEW: 0, READ: 0, ANSWERED: 0 });
        } else {
          setRows([]);
          setCounts(null);
          setError(data?.error?.message || "Mesajlar yüklenemedi.");
        }
      } catch {
        if (!alive || seq !== requestSeq.current) return;
        setRows([]);
        setCounts(null);
        setError("Bağlantı hatası: mesajlar yüklenemedi.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [filter, reloadKey]);

  const setStatus = async (id: number, status: "NEW" | "READ" | "ANSWERED") => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await authFetch("/api/contact", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) refresh();
      else {
        if (res.status === 401 || res.status === 403) { requestSeq.current++; setRows([]); setCounts(null); setOpenId(null); }
        setError(data?.error?.message || "Durum güncellenemedi.");
      }
    } catch {
      setError("Bağlantı hatası: durum güncellenemedi.");
    } finally { setSaving(false); }
  };

  const sorted = useMemo(
    () => [...(rows || [])].sort((a, b) => Number(a.status !== "NEW") - Number(b.status !== "NEW")),
    [rows]
  );

  const kpis = [
    { key: "total", label: "Toplam Mesaj", value: counts?.total ?? "—", cls: "text-stone-800" },
    { key: "NEW", label: "Yeni (okunmadı)", value: counts?.NEW ?? "—", cls: "text-rose-700" },
    { key: "READ", label: "Okundu", value: counts?.READ ?? "—", cls: "text-amber-700" },
    { key: "ANSWERED", label: "Yanıtlandı", value: counts?.ANSWERED ?? "—", cls: "text-emerald-700" },
  ];

  return (
    <div className="space-y-4">
      {/* Başlık + sayfa bağlantısı */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-stone-900 flex items-center gap-2">
            <Inbox className="w-5 h-5 text-amber-700" /> Destek Masası
          </h2>
          <p className="text-xs text-stone-500 mt-1">
            &quot;İletişim &amp; Destek Masası&quot; sayfasındaki <strong>Bize Mesaj Gönderin</strong> formundan gelen mesajlar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/iletisim"
            target="_blank"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold transition"
          >
            <ArrowUpRight className="w-3.5 h-3.5" /> İletişim &amp; Destek Masası sayfası
          </Link>
          <button
            type="button"
            onClick={refresh}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-800 hover:bg-amber-900 text-white text-xs font-bold transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Yenile
          </button>
        </div>
      </div>

      {/* KPI kartları */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <div key={k.key} className="bg-white rounded-2xl border border-stone-200 p-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">{k.label}</span>
            <p className={`text-2xl font-black ${k.cls}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Filtre */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { key: "", label: "Tümü" },
          { key: "NEW", label: "Yeni" },
          { key: "READ", label: "Okundu" },
          { key: "ANSWERED", label: "Yanıtlandı" },
        ].map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => { if (filter !== f.key) { requestSeq.current++; setRows(null); setCounts(null); setError(null); setOpenId(null); setFilter(f.key as "" | "NEW" | "READ" | "ANSWERED"); } }}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition ${
              filter === f.key
                ? "bg-amber-800 text-white border-amber-800"
                : "bg-white text-stone-600 border-stone-200 hover:border-amber-300"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Liste */}
      {error && (
        <div role="alert" className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">{error}</div>
      )}

      {loading ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-10 text-center text-xs text-stone-400">
          Mesajlar yükleniyor…
        </div>
      ) : error && sorted.length === 0 ? null : sorted.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-stone-300 p-10 text-center space-y-2">
          <MessageSquare className="w-7 h-7 text-stone-300 mx-auto" />
          <p className="text-sm font-bold text-stone-500">Henüz mesaj yok</p>
          <p className="text-xs text-stone-400">
            Ziyaretçiler &quot;Bize Mesaj Gönderin&quot; formunu doldurduğunda mesajlar burada listelenir.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((m) => {
            const meta = STATUS_META[m.status] || STATUS_META.NEW;
            const open = openId === m.id;
            return (
              <div key={m.id} className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
                <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${meta.cls}`}>
                        {meta.label}
                      </span>
                      <span className="text-[11px] font-bold text-stone-800 flex items-center gap-1">
                        <User className="w-3 h-3 text-stone-400" /> {m.name}
                      </span>
                      <span className="text-[11px] text-stone-500">{m.subject || "Diğer"}</span>
                      <span className="text-[10px] text-stone-400 ml-auto sm:ml-0">{fmt(m.createdAt)}</span>
                    </div>
                    <p className={`text-xs text-stone-600 mt-1.5 ${open ? "" : "line-clamp-1"}`}>{m.message}</p>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-stone-500 mt-1.5">
                      <span className="flex items-center gap-1"><Phone className="w-3 h-3 text-stone-400" /> {m.phone}</span>
                      {m.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3 text-stone-400" /> {m.email}</span>}
                      {m.createdBy && <span className="text-stone-400">üye: {m.createdBy}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : m.id)}
                      className="px-2.5 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-[11px] font-bold transition"
                    >
                      {open ? "Kapat" : "Oku"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void setStatus(m.id, "READ")}
                      disabled={saving || m.status === "READ"}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 disabled:opacity-40 text-amber-800 text-[11px] font-bold transition inline-flex items-center gap-1"
                    >
                      <MailOpen className="w-3 h-3" /> Okundu
                    </button>
                    <button
                      type="button"
                      onClick={() => void setStatus(m.id, "ANSWERED")}
                      disabled={saving || m.status === "ANSWERED"}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 disabled:opacity-40 text-emerald-800 text-[11px] font-bold transition inline-flex items-center gap-1"
                    >
                      <CheckCheck className="w-3 h-3" /> Yanıtlandı
                    </button>
                  </div>
                </div>
                {open && (
                  <div className="px-4 pb-4">
                    <div className="rounded-xl bg-stone-50 border border-stone-200 p-3 text-xs text-stone-700 whitespace-pre-wrap">
                      {m.message}
                    </div>
                    <div className="flex flex-wrap gap-3 text-[10px] text-stone-400 mt-2">
                      <span>Kaynak: {m.source}</span>
                      <span>Okunma: {fmt(m.readAt)}</span>
                      <span>Kayıt no: #{m.id}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
