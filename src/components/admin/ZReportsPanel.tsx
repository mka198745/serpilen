"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/client-auth";
import {
  Banknote,
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

function diffOf(s: ShiftRow): number {
  if (s.closingAmount === null) return 0;
  return n(s.closingAmount) - n(s.expectedAmount);
}

/**
 * Gün Sonu & Z-Raporları paneli.
 *
 * Web POS Terminalindeki "Vardiyayı Kapat & Gün Sonu Z Raporu" akışıyla oluşan
 * kayıtları (pos_shifts.zReportNumber) arşiv olarak listeler; aynı Z raporu
 * fişi görünümünü burada da açar. Veri kaynağı: GET /api/pos/shift.
 */
export function ZReportsPanel() {
  const [shifts, setShifts] = useState<ShiftRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [onlyZ, setOnlyZ] = useState(true);
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
  const rows = useMemo(() => (onlyZ ? zRows : shifts || []), [onlyZ, zRows, shifts]);

  const totals = useMemo(() => {
    return zRows.reduce(
      (acc, s) => {
        acc.revenue += n(s.totalSalesCash) + n(s.totalSalesCard) + n(s.totalSalesSplit);
        acc.cash += n(s.totalSalesCash);
        acc.card += n(s.totalSalesCard) + n(s.totalSalesSplit);
        acc.diff += diffOf(s);
        acc.opening += n(s.openingAmount);
        acc.closing += n(s.closingAmount);
        return acc;
      },
      { revenue: 0, cash: 0, card: 0, diff: 0, opening: 0, closing: 0 }
    );
  }, [zRows]);

  const openShifts = (shifts || []).filter((s) => s.status === "OPEN");

  const kpis = [
    { label: "Z Raporu", value: String(zRows.length), icon: Receipt, cls: "text-stone-900" },
    { label: "Toplam Ciro (Z)", value: money(totals.revenue), icon: Banknote, cls: "text-emerald-700" },
    { label: "Nakit Tahsilat", value: money(totals.cash), icon: Banknote, cls: "text-emerald-700" },
    { label: "Kart Tahsilat", value: money(totals.card), icon: CreditCard, cls: "text-sky-700" },
    { label: "Kasa Açılış", value: money(totals.opening), icon: Wallet, cls: "text-stone-900" },
    { label: "Kasa Kapanış", value: money(totals.closing), icon: Landmark, cls: "text-stone-900" },
    {
      label: `Kasa Farkı · ${openShifts.length} açık vardiya`,
      value: `${totals.diff > 0 ? "+" : ""}${money(totals.diff)}`,
      icon: Scale,
      cls: Math.abs(totals.diff) < 0.005 ? "text-emerald-700" : totals.diff > 0 ? "text-amber-700" : "text-rose-700",
    },
  ];

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

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="bg-white rounded-2xl border border-stone-200 p-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 flex items-center gap-1">
                <Icon className="w-3 h-3" /> {k.label}
              </span>
              <p className={`text-lg font-black mt-1 ${k.cls}`}>{k.value}</p>
            </div>
          );
        })}
      </div>

      {/* Filtre */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOnlyZ(true)}
          className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition ${
            onlyZ ? "bg-amber-800 text-white border-amber-800" : "bg-white text-stone-600 border-stone-200 hover:border-amber-300"
          }`}
        >
          Yalnızca Z raporları ({zRows.length})
        </button>
        <button
          type="button"
          onClick={() => setOnlyZ(false)}
          className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition ${
            !onlyZ ? "bg-amber-800 text-white border-amber-800" : "bg-white text-stone-600 border-stone-200 hover:border-amber-300"
          }`}
        >
          Tüm vardiyalar ({(shifts || []).length})
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">{error}</div>
      )}

      {/* Tablo */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-10 text-center text-xs text-stone-400">
          Z raporları yükleniyor…
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-stone-300 p-10 text-center space-y-2">
          <Receipt className="w-7 h-7 text-stone-300 mx-auto" />
          <p className="text-sm font-bold text-stone-500">Henüz Z raporu yok</p>
          <p className="text-xs text-stone-400">
            Web POS Terminalinde vardiya kapatılıp &quot;Gün Sonu Z Raporu&quot; alındığında kayıtlar burada listelenir.
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
