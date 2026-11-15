"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/client-auth";
import {
  Banknote,
  CalendarDays,
  CreditCard,
  ExternalLink,
  Landmark,
  Printer,
  Receipt,
  RefreshCw,
  Scale,
  Wallet,
  X,
} from "lucide-react";

interface ShiftRow {
  id: number;
  shiftNumber: string | null;
  terminalCode: string;
  cashierName: string;
  warehouseId: number;
  warehouseName?: string;
  openingAmount: string;
  closingAmount: string | null;
  expectedAmount: string | null;
  totalSalesCash: string | null;
  totalSalesCard: string | null;
  totalSalesSplit: string | null;
  totalReturnsCash: string | null;
  totalReturnsCard: string | null;
  cashInTotal: string | null;
  cashOutTotal: string | null;
  status: string;
  zReportNumber: string | null;
  openedAt: string | number;
  closedAt: string | number | null;
  notes: string | null;
}

const n = (v: string | number | null | undefined) => Number(v ?? 0);
const money = (v: number) => `${v.toFixed(2)} TL`;

function fmt(d: string | number | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "number" ? new Date(d * 1000) : new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
}

/** Yerel saat dilimine göre YYYY-MM-DD anahtarı (tarih karşılaştırmaları için). */
function dayKey(d: string | number | Date | null | undefined): string {
  if (d === null || d === undefined || d === "") return "";
  const date = typeof d === "number" ? new Date(d * 1000) : new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const g = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${g}`;
}

function shiftDay(s: ShiftRow): string {
  return dayKey(s.closedAt) || dayKey(s.openedAt);
}

function prettyDay(key: string): string {
  if (!key) return "—";
  const d = new Date(`${key}T00:00:00`);
  if (Number.isNaN(d.getTime())) return key;
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric", weekday: "long" });
}

function diffOf(s: ShiftRow): number {
  if (s.closingAmount === null) return 0;
  return n(s.closingAmount) - n(s.expectedAmount);
}

/**
 * Gün Sonu & Z-Raporları paneli.
 *
 * Web POS Terminalindeki "Vardiyayı Kapat & Gün Sonu Z Raporu" akışıyla oluşan
 * kayıtları (pos_shifts.zReportNumber) arşiv olarak listeler.
 *
 * - Üstte seçilen tarihe göre günlük kasa özeti: Kasa Açılış, Nakit Tahsilat,
 *   Kasa Kapanış, Kasa Farkı/Fazlası.
 * - Altta tarih aralığı ile filtrelenen Z raporu/vardiya tablosu.
 * Veri kaynağı: GET /api/pos/shift (son 30 vardiya).
 */
export function ZReportsPanel() {
  const [shifts, setShifts] = useState<ShiftRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [day, setDay] = useState(""); // günlük kasa özeti için seçilen tarih (YYYY-MM-DD)
  const [from, setFrom] = useState(""); // tablo tarih aralığı başlangıcı
  const [to, setTo] = useState(""); // tablo tarih aralığı bitişi
  const [selected, setSelected] = useState<ShiftRow | null>(null);

  const loading = shifts === null;

  const refresh = useCallback(() => {
    setError(null);
    setShifts(null);
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await authFetch("/api/pos/shift", { cache: "no-store" });
        const data = await res.json();
        if (!alive) return;
        if (res.ok && data?.success) {
          setShifts(Array.isArray(data.history) ? data.history : []);
          // Varsayılan tarih: en son kapanan vardiyanın günü, yoksa bugün.
          const history: ShiftRow[] = Array.isArray(data.history) ? data.history : [];
          const lastClosed = history
            .filter((s) => !!s.zReportNumber)
            .map((s) => shiftDay(s))
            .filter(Boolean)
            .sort()
            .pop();
          setDay((d) => d || lastClosed || dayKey(new Date()));
        } else {
          setShifts([]);
          setError(data?.error || "Z raporları yüklenemedi.");
        }
      } catch {
        if (!alive) return;
        setShifts([]);
        setError("Bağlantı hatası: Z raporları yüklenemedi.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const zRows = useMemo(() => (shifts || []).filter((s) => !!s.zReportNumber), [shifts]);
  const openShifts = (shifts || []).filter((s) => s.status === "OPEN");

  /* ---------------- Günlük kasa özeti (seçilen tarih) ---------------- */
  const dayRows = useMemo(() => zRows.filter((s) => shiftDay(s) === day), [zRows, day]);

  const dayTotals = useMemo(() => {
    return dayRows.reduce(
      (acc, s) => {
        acc.opening += n(s.openingAmount);
        acc.cash += n(s.totalSalesCash);
        acc.closing += n(s.closingAmount);
        acc.diff += diffOf(s);
        return acc;
      },
      { opening: 0, cash: 0, closing: 0, diff: 0 }
    );
  }, [dayRows]);

  const dayKpis = [
    { label: "Kasa Açılış", value: money(dayTotals.opening), icon: Wallet, cls: "text-stone-900" },
    { label: "Nakit Tahsilat", value: money(dayTotals.cash), icon: Banknote, cls: "text-emerald-700" },
    { label: "Kasa Kapanış", value: money(dayTotals.closing), icon: Landmark, cls: "text-stone-900" },
    {
      label: "Kasa Farkı/Fazlası",
      value: `${dayTotals.diff > 0 ? "+" : ""}${money(dayTotals.diff)}`,
      icon: Scale,
      cls:
        Math.abs(dayTotals.diff) < 0.005
          ? "text-emerald-700"
          : dayTotals.diff > 0
            ? "text-amber-700"
            : "text-rose-700",
    },
  ];

  /* ---------------- Tablo: tarih aralığı filtresi ---------------- */
  const rows = useMemo(() => {
    return (shifts || []).filter((s) => {
      const k = shiftDay(s);
      if (!k) return !from && !to;
      if (from && k < from) return false;
      if (to && k > to) return false;
      return true;
    });
  }, [shifts, from, to]);

  const rangeActive = !!from || !!to;

  return (
    <div className="space-y-4">
      {/* Başlık */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-stone-900 flex items-center gap-2">
            <Receipt className="w-5 h-5 text-amber-700" /> Gün Sonu &amp; Z-Raporları
          </h3>
          <p className="text-xs text-stone-500 mt-1">
            Web POS Terminalindeki <strong>Gün Sonu &amp; Z-Raporu</strong> akışıyla kapatılan vardiyaların resmi Z raporları burada arşivlenir.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/pos"
            target="_blank"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-800 hover:bg-amber-900 text-white text-xs font-bold transition"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Web POS Terminali
          </Link>
          <button
            type="button"
            onClick={refresh}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Yenile
          </button>
        </div>
      </div>

      {/* Tarih + günlük kasa özeti */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <label htmlFor="zreport-day" className="text-[10px] font-bold uppercase tracking-wider text-stone-400 flex items-center gap-1">
              <CalendarDays className="w-3 h-3" /> Tarih Seçimi
            </label>
            <div className="flex items-center gap-2 mt-1.5">
              <input
                id="zreport-day"
                type="date"
                value={day}
                onChange={(e) => setDay(e.target.value)}
                className="px-3 py-2 rounded-xl border border-stone-300 bg-white text-xs font-bold text-stone-800 outline-none focus:border-amber-500"
              />
              <button
                type="button"
                onClick={() => setDay(dayKey(new Date()))}
                className="px-3 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-[11px] font-bold transition"
              >
                Bugün
              </button>
              <button
                type="button"
                onClick={() => setDay(dayKey(new Date(Date.now() - 86400000)))}
                className="px-3 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-[11px] font-bold transition"
              >
                Dün
              </button>
            </div>
            <p className="text-[11px] text-stone-500 mt-1.5">
              {day ? prettyDay(day) : "Tarih seçilmedi"} · {dayRows.length} Z raporu
              {openShifts.length > 0 && <span className="text-stone-400"> · {openShifts.length} açık vardiya</span>}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {dayKpis.map((k) => {
            const Icon = k.icon;
            return (
              <div key={k.label} className="bg-stone-50 rounded-2xl border border-stone-200 p-4">
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 flex items-center gap-1">
                  <Icon className="w-3 h-3" /> {k.label}
                </span>
                <p className={`text-lg font-black mt-1 ${k.cls}`}>{loading ? "…" : k.value}</p>
              </div>
            );
          })}
        </div>

        {!loading && day && dayRows.length === 0 && (
          <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            Seçilen tarihte kapatılmış Z raporu yok; tutarlar 0,00 TL görünür. Gün sonu kapatması Web POS Terminalinde yapılır.
          </p>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">{error}</div>
      )}

      {/* Tarih aralığı + tablo */}
      <div className="space-y-3">
        <div className="bg-white rounded-2xl border border-stone-200 p-4 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="zreport-from" className="text-[10px] font-bold uppercase tracking-wider text-stone-400 flex items-center gap-1">
                <CalendarDays className="w-3 h-3" /> Tarih Aralığı
              </label>
              <div className="flex items-center gap-2 mt-1.5">
                <input
                  id="zreport-from"
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  aria-label="Başlangıç tarihi"
                  className="px-3 py-2 rounded-xl border border-stone-300 bg-white text-xs font-bold text-stone-800 outline-none focus:border-amber-500"
                />
                <span className="text-xs font-bold text-stone-400">—</span>
                <input
                  id="zreport-to"
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  aria-label="Bitiş tarihi"
                  className="px-3 py-2 rounded-xl border border-stone-300 bg-white text-xs font-bold text-stone-800 outline-none focus:border-amber-500"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setFrom("");
                setTo("");
              }}
              disabled={!rangeActive}
              className="px-3 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 disabled:opacity-50 text-stone-700 text-[11px] font-bold transition"
            >
              Aralığı Temizle
            </button>
          </div>
          <p className="text-[11px] text-stone-500">
            {loading ? "Yükleniyor…" : `${rows.length} kayıt`}
            {rangeActive && <span className="text-amber-800 font-semibold"> · filtrelenmiş</span>}
          </p>
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl border border-stone-200 p-10 text-center text-xs text-stone-400">
            Z raporları yükleniyor…
          </div>
        ) : rows.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-stone-300 p-10 text-center space-y-2">
            <Receipt className="w-7 h-7 text-stone-300 mx-auto" />
            <p className="text-sm font-bold text-stone-500">
              {rangeActive ? "Seçilen tarih aralığında kayıt yok" : "Henüz Z raporu yok"}
            </p>
            <p className="text-xs text-stone-400">
              {rangeActive
                ? "Farklı bir tarih aralığı seçin veya aralığı temizleyin."
                : "Web POS Terminalinde vardiya kapatılıp \"Gün Sonu Z Raporu\" alındığında kayıtlar burada listelenir."}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-stone-50 text-stone-500 uppercase border-b border-stone-200">
                  <tr>
                    <th className="py-3 px-3">Z No</th>
                    <th className="py-3 px-3">Kasa / Mağaza</th>
                    <th className="py-3 px-3">Kasiyer</th>
                    <th className="py-3 px-3 text-right">Nakit</th>
                    <th className="py-3 px-3 text-right">Kart</th>
                    <th className="py-3 px-3 text-right">Kasa Açılış</th>
                    <th className="py-3 px-3 text-right">Kasa Kapanış</th>
                    <th className="py-3 px-3 text-right">Fark</th>
                    <th className="py-3 px-3">Kapanış Zamanı</th>
                    <th className="py-3 px-3 text-right">Detay</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {rows.map((s) => {
                    const diff = diffOf(s);
                    return (
                      <tr key={s.id} className="hover:bg-stone-50/70">
                        <td className="py-2.5 px-3 font-mono font-bold text-stone-800">
                          {s.zReportNumber || <span className="text-stone-400">—</span>}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-semibold text-stone-800">{s.terminalCode}</span>
                          <span className="block text-[10px] text-stone-400">{s.warehouseName || `Depo #${s.warehouseId}`}</span>
                        </td>
                        <td className="py-2.5 px-3 text-stone-600">{s.cashierName}</td>
                        <td className="py-2.5 px-3 text-right text-emerald-700 font-semibold">{money(n(s.totalSalesCash))}</td>
                        <td className="py-2.5 px-3 text-right text-sky-700 font-semibold">
                          {money(n(s.totalSalesCard) + n(s.totalSalesSplit))}
                        </td>
                        <td className="py-2.5 px-3 text-right text-stone-600">{money(n(s.openingAmount))}</td>
                        <td className="py-2.5 px-3 text-right text-stone-800 font-semibold">
                          {s.closingAmount === null ? <span className="text-stone-400">—</span> : money(n(s.closingAmount))}
                        </td>
                        <td
                          className={`py-2.5 px-3 text-right font-bold ${
                            !s.zReportNumber ? "text-stone-400" : diff === 0 ? "text-emerald-700" : diff > 0 ? "text-amber-700" : "text-rose-700"
                          }`}
                        >
                          {s.zReportNumber ? `${diff > 0 ? "+" : ""}${money(diff)}` : "—"}
                        </td>
                        <td className="py-2.5 px-3 text-stone-500">{fmt(s.closedAt)}</td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => setSelected(s)}
                            className="px-2.5 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-[11px] font-bold transition"
                          >
                            Z Fişi
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Z raporu fişi (POS terminalindeki görünümün aynısı) */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-stone-200 max-h-[90vh] overflow-y-auto">
            <div className="font-mono text-[11px] text-stone-900 border-2 border-stone-900 p-4 rounded-xl bg-stone-50 space-y-2">
              <div className="text-center border-b border-stone-400 pb-2">
                <h3 className="font-black text-base uppercase">GÜN SONU Z RAPORU</h3>
                <p className="font-bold text-sm text-amber-900">{selected.zReportNumber || `Z-${selected.id}`}</p>
                <p className="text-[10px]">SERPİLEN COLLECTION SAN. TİC. LTD. ŞTİ.</p>
                <p className="text-[10px]">
                  Kasa: {selected.terminalCode} · {selected.warehouseName || `Depo #${selected.warehouseId}`}
                </p>
              </div>

              <div className="space-y-0.5 text-[10px]">
                <p>
                  Kasiyer: <strong>{selected.cashierName}</strong>
                </p>
                <p>Açılış: {fmt(selected.openedAt)}</p>
                <p>Kapanış: {fmt(selected.closedAt)}</p>
                <p>Vardiya: {selected.shiftNumber || `VARD-${selected.id}`}</p>
              </div>

              <div className="border-t border-stone-400 pt-1 space-y-1">
                <div className="flex justify-between">
                  <span>KASA AÇILIŞ:</span>
                  <span>{money(n(selected.openingAmount))}</span>
                </div>
                <div className="flex justify-between font-bold text-emerald-800">
                  <span>Toplam Nakit Satış:</span>
                  <span>+{money(n(selected.totalSalesCash))}</span>
                </div>
                <div className="flex justify-between font-bold text-sky-800">
                  <span>Toplam Kredi Kartı:</span>
                  <span>+{money(n(selected.totalSalesCard))}</span>
                </div>
                {n(selected.totalSalesSplit) > 0 && (
                  <div className="flex justify-between">
                    <span>Parçalı Ödeme:</span>
                    <span>+{money(n(selected.totalSalesSplit))}</span>
                  </div>
                )}
                {n(selected.totalReturnsCash) > 0 && (
                  <div className="flex justify-between text-rose-700">
                    <span>Nakit İadeler:</span>
                    <span>-{money(n(selected.totalReturnsCash))}</span>
                  </div>
                )}
                {n(selected.cashInTotal) > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Nakit Girişler:</span>
                    <span>+{money(n(selected.cashInTotal))}</span>
                  </div>
                )}
                {n(selected.cashOutTotal) > 0 && (
                  <div className="flex justify-between text-rose-700">
                    <span>Nakit Çıkışlar (Gider):</span>
                    <span>-{money(n(selected.cashOutTotal))}</span>
                  </div>
                )}
              </div>

              <div className="border-t border-stone-400 pt-1 space-y-1 font-bold">
                <div className="flex justify-between">
                  <span>Olması Gereken Nakit:</span>
                  <span>{money(n(selected.expectedAmount))}</span>
                </div>
                <div className="flex justify-between">
                  <span>KASA KAPANIŞ (Sayılan):</span>
                  <span>{money(n(selected.closingAmount))}</span>
                </div>
                <div
                  className={`flex justify-between text-xs font-black ${
                    diffOf(selected) === 0 ? "text-emerald-700" : diffOf(selected) > 0 ? "text-amber-800" : "text-rose-700"
                  }`}
                >
                  <span>KASA FARKI:</span>
                  <span>
                    {diffOf(selected) === 0
                      ? "TAM (0.00 TL)"
                      : `${diffOf(selected) > 0 ? "+" : ""}${money(diffOf(selected))}`}
                  </span>
                </div>
              </div>

              {selected.notes && (
                <div className="border-t border-stone-400 pt-1 text-[10px] italic text-stone-600">{selected.notes}</div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-3 bg-stone-900 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4" />
                <span>Z Raporunu Yazdır</span>
              </button>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="py-3 px-4 bg-stone-200 text-stone-800 font-bold rounded-xl text-xs inline-flex items-center gap-1.5"
              >
                <X className="w-4 h-4" /> Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
