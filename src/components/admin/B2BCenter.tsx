"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Building2,
  Wallet,
  Layers,
  Plus,
  X,
  RefreshCw,
  AlertTriangle,
  FileSpreadsheet,
  BadgeCheck,
  Ban,
  TrendingDown,
} from "lucide-react";

type SubTab = "accounts" | "pricelists" | "receivables";

const RISK_COLORS: Record<string, string> = {
  "İYİ": "bg-emerald-100 text-emerald-800",
  "İZLEMEDE": "bg-amber-100 text-amber-900",
  "LİMİT DOLU": "bg-orange-100 text-orange-800",
  "RİSKLİ": "bg-rose-100 text-rose-800",
  "KAPALI": "bg-stone-800 text-white",
};

export function B2BCenter() {
  const [subTab, setSubTab] = useState<SubTab>("accounts");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; isError?: boolean } | null>(null);

  const [accounts, setAccounts] = useState<any[]>([]);
  const [priceListsData, setPriceListsData] = useState<any[]>([]);
  const [prodOptions, setProdOptions] = useState<any[]>([]);
  const [statement, setStatement] = useState<any | null>(null);

  const [editAccount, setEditAccount] = useState<any | null>(null);
  const [paymentModal, setPaymentModal] = useState<any | null>(null);
  const [paymentForm, setPaymentForm] = useState({ amount: "", method: "HAVALE", description: "" });

  const [isListOpen, setIsListOpen] = useState(false);
  const [listForm, setListForm] = useState({ code: "", name: "", defaultDiscountRate: "10", description: "" });
  const [tierForm, setTierForm] = useState({ priceListId: "", productId: "", minQty: "10", maxQty: "49", discountRate: "10" });

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [b2b, pl] = await Promise.all([
        fetch("/api/b2b", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/price-lists", { cache: "no-store" }).then((r) => r.json()),
      ]);
      if (b2b?.success) setAccounts(b2b.data);
      if (pl?.success) {
        setPriceListsData(pl.data);
        setProdOptions(pl.products || []);
        if (pl.data[0] && !tierForm.priceListId) setTierForm((f) => ({ ...f, priceListId: String(pl.data[0].id) }));
      }
    } finally {
      setBusy(false);
    }
  }, [tierForm.priceListId]);

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const post = (url: string, body: unknown) =>
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

  const openStatement = async (id: number) => {
    const res = await fetch(`/api/b2b?statement=${id}`, { cache: "no-store" }).then((r) => r.json());
    if (res.success) setStatement(res);
  };

  const saveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await post("/api/b2b", { action: "UPDATE", id: editAccount.id, ...editAccount });
    if (res.success) {
      setFeedback({ text: "Cari kart güncellendi." });
      setEditAccount(null);
      void load();
    } else setFeedback({ text: res.error, isError: true });
  };

  const submitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await post("/api/b2b", { action: "PAYMENT", customerId: paymentModal.id, amount: Number(paymentForm.amount), method: paymentForm.method, description: paymentForm.description });
    if (res.success) {
      setFeedback({ text: `Tahsilat kaydedildi. Yeni bakiye: ${res.data.newBalance.toFixed(2)} TL` });
      setPaymentModal(null);
      setPaymentForm({ amount: "", method: "HAVALE", description: "" });
      void load();
    } else setFeedback({ text: res.error, isError: true });
  };

  const createList = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await post("/api/price-lists", { action: "CREATE_LIST", ...listForm });
    if (res.success) {
      setFeedback({ text: `Fiyat listesi oluşturuldu: ${res.data.code}` });
      setIsListOpen(false);
      void load();
    } else setFeedback({ text: res.error, isError: true });
  };

  const addTier = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await post("/api/price-lists", {
      action: "ADD_TIER",
      priceListId: Number(tierForm.priceListId),
      productId: tierForm.productId ? Number(tierForm.productId) : null,
      minQty: Number(tierForm.minQty),
      maxQty: tierForm.maxQty ? Number(tierForm.maxQty) : null,
      discountRate: tierForm.discountRate,
    });
    if (res.success) {
      setFeedback({ text: "Kademe baremi eklendi." });
      void load();
    } else setFeedback({ text: res.error, isError: true });
  };

  const totalReceivable = accounts.reduce((s, a) => s + Number(a.balance || 0), 0);
  const totalOverdue = accounts.reduce((s, a) => s + Number(a.overdueTotal || 0), 0);
  const inputCls = "w-full px-3 py-2 border border-stone-300 rounded-xl text-xs";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-sky-800">FAZ 9 — B2B</span>
          <h2 className="text-xl font-black text-stone-900">Toptan Cari, Fiyat Listeleri & Alacak Yönetimi</h2>
          <p className="text-xs text-stone-500">Kademeli fiyat baremleri, kredi limiti/vade kontrolü ve cari ekstre takibi.</p>
        </div>
        <button onClick={() => void load()} className="px-3 py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 text-xs font-bold rounded-xl flex items-center gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} /> Yenile
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-stone-200"><span className="text-[9px] font-bold uppercase text-stone-500 block">Toplam Alacak</span><div className="text-xl font-black text-stone-900">{totalReceivable.toFixed(2)} TL</div></div>
        <div className="bg-white p-4 rounded-2xl border border-rose-200"><span className="text-[9px] font-bold uppercase text-rose-700 block">Vadesi Geçen</span><div className="text-xl font-black text-rose-700">{totalOverdue.toFixed(2)} TL</div></div>
        <div className="bg-white p-4 rounded-2xl border border-stone-200"><span className="text-[9px] font-bold uppercase text-stone-500 block">Aktif Cari</span><div className="text-xl font-black text-sky-900">{accounts.filter((a) => !a.isBlocked).length}</div></div>
        <div className="bg-white p-4 rounded-2xl border border-stone-200"><span className="text-[9px] font-bold uppercase text-stone-500 block">Riskli / Kapalı</span><div className="text-xl font-black text-amber-800">{accounts.filter((a) => a.riskLevel === "RİSKLİ" || a.isBlocked).length}</div></div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {[
          { id: "accounts" as const, label: `Cari Hesaplar (${accounts.length})`, icon: Building2 },
          { id: "pricelists" as const, label: `Fiyat Listeleri (${priceListsData.length})`, icon: Layers },
          { id: "receivables" as const, label: "Alacak & Vade Takibi", icon: Wallet },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => { setSubTab(t.id); setFeedback(null); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${subTab === t.id ? "bg-sky-900 text-white" : "bg-white text-stone-600 border border-stone-200"}`}>
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {feedback && (
        <div className={`p-2.5 rounded-xl text-xs font-medium border ${feedback.isError ? "bg-rose-50 border-rose-200 text-rose-800" : "bg-emerald-50 border-emerald-200 text-emerald-800"}`}>{feedback.text}</div>
      )}

      {/* ---- CARİ HESAPLAR ---- */}
      {subTab === "accounts" && (
        <div className="bg-white rounded-2xl border border-stone-200 overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-stone-50 text-stone-500 uppercase border-b border-stone-200">
              <tr>
                <th className="py-2.5 px-3">Firma</th>
                <th className="py-2.5 px-3">Fiyat Listesi</th>
                <th className="py-2.5 px-3">Vade</th>
                <th className="py-2.5 px-3">Bakiye / Limit</th>
                <th className="py-2.5 px-3">Kullanım</th>
                <th className="py-2.5 px-3">Risk</th>
                <th className="py-2.5 px-3">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {accounts.map((a) => (
                <tr key={a.id} className="hover:bg-stone-50/50">
                  <td className="py-2.5 px-3">
                    <span className="font-bold text-stone-900 block">{a.companyName || a.name}</span>
                    <span className="text-[10px] text-stone-400">VKN {a.taxNumber || "—"} · %{Number(a.discountRate || 0)} iskonto</span>
                  </td>
                  <td className="py-2.5 px-3">{a.priceListName}</td>
                  <td className="py-2.5 px-3">{a.paymentTermDays} gün</td>
                  <td className="py-2.5 px-3 font-bold">{Number(a.balance || 0).toFixed(0)} / {Number(a.creditLimit || 0).toFixed(0)} TL</td>
                  <td className="py-2.5 px-3">
                    <div className="h-1.5 w-20 bg-stone-100 rounded-full overflow-hidden">
                      <div className={`h-full ${a.creditUsagePercent >= 90 ? "bg-rose-600" : a.creditUsagePercent >= 70 ? "bg-amber-500" : "bg-emerald-600"}`} style={{ width: `${Math.min(100, a.creditUsagePercent)}%` }} />
                    </div>
                    <span className="text-[10px] text-stone-400">%{a.creditUsagePercent}</span>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${RISK_COLORS[a.riskLevel] || ""}`}>{a.riskLevel}</span>
                    {a.overdueCount > 0 && <span className="block text-[9px] text-rose-700 font-bold mt-0.5">{a.overdueCount} gecikmiş</span>}
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex flex-wrap gap-1">
                      <button onClick={() => setEditAccount({ ...a })} className="px-2 py-1 bg-sky-900 text-white rounded-lg text-[10px] font-bold">Düzenle</button>
                      <button onClick={() => setPaymentModal(a)} className="px-2 py-1 bg-emerald-700 text-white rounded-lg text-[10px] font-bold">Tahsilat</button>
                      <button onClick={() => void openStatement(a.id)} className="px-2 py-1 bg-stone-200 text-stone-700 rounded-lg text-[10px] font-bold">Ekstre</button>
                    </div>
                  </td>
                </tr>
              ))}
              {accounts.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-stone-400">B2B cari yok.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ---- FİYAT LİSTELERİ ---- */}
      {subTab === "pricelists" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setIsListOpen(true)} className="px-3.5 py-2 bg-sky-900 text-white text-xs font-bold rounded-xl flex items-center gap-1.5"><Plus className="w-4 h-4" /> Yeni Fiyat Listesi</button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {priceListsData.map((l) => (
              <div key={l.id} className="bg-white p-4 rounded-2xl border border-stone-200 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-black text-sm text-stone-900">{l.name} <span className="font-mono text-[10px] text-sky-800 bg-sky-50 px-1.5 py-0.5 rounded">{l.code}</span></h4>
                    <p className="text-[11px] text-stone-500">{l.description || "—"}</p>
                  </div>
                  <div className="text-right">
                    {l.isDefault && <span className="text-[9px] font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">VARSAYILAN</span>}
                    <div className="text-xs font-bold text-stone-700 mt-0.5">%{Number(l.defaultDiscountRate)} liste iskontosu</div>
                    <div className="text-[10px] text-stone-400">{l.customerCount} cari</div>
                  </div>
                </div>
                {l.tiers.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1 border-t border-stone-100">
                    {l.tiers.map((t: any) => (
                      <span key={t.id} className="text-[10px] bg-stone-100 px-2 py-1 rounded-lg font-bold text-stone-700">
                        {t.maxQty ? `${t.minQty}–${t.maxQty}` : `${t.minQty}+`} → {t.discountRate ? `%${Number(t.discountRate)}` : `${Number(t.unitPrice).toFixed(2)}₺`}
                        {t.productId && <span className="text-sky-700"> ({t.productName.slice(0, 14)})</span>}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <form onSubmit={addTier} className="bg-white p-4 rounded-2xl border border-stone-200 grid grid-cols-1 md:grid-cols-6 gap-2 text-xs items-end">
            <div className="md:col-span-6 font-bold text-sm text-stone-900 flex items-center gap-1.5"><TrendingDown className="w-4 h-4 text-sky-800" /> Kademe (Hacim) Baremi Ekle</div>
            <select value={tierForm.priceListId} onChange={(e) => setTierForm({ ...tierForm, priceListId: e.target.value })} className={inputCls}>
              {priceListsData.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <select value={tierForm.productId} onChange={(e) => setTierForm({ ...tierForm, productId: e.target.value })} className={inputCls}>
              <option value="">Tüm ürünler</option>
              {prodOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input type="number" placeholder="Min adet" value={tierForm.minQty} onChange={(e) => setTierForm({ ...tierForm, minQty: e.target.value })} className={inputCls} />
            <input type="number" placeholder="Maks (boş=∞)" value={tierForm.maxQty} onChange={(e) => setTierForm({ ...tierForm, maxQty: e.target.value })} className={inputCls} />
            <input type="number" step="0.5" placeholder="İskonto %" value={tierForm.discountRate} onChange={(e) => setTierForm({ ...tierForm, discountRate: e.target.value })} className={inputCls} />
            <button type="submit" className="py-2 bg-sky-900 text-white font-bold rounded-xl">Barem Ekle</button>
          </form>
        </div>
      )}

      {/* ---- ALACAK TAKİBİ ---- */}
      {subTab === "receivables" && (
        <div className="bg-white rounded-2xl border border-stone-200 overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-stone-50 text-stone-500 uppercase border-b border-stone-200">
              <tr><th className="py-2.5 px-3">Firma</th><th className="py-2.5 px-3">Bakiye</th><th className="py-2.5 px-3">Vadesi Geçen</th><th className="py-2.5 px-3">Gecikmiş Fatura</th><th className="py-2.5 px-3">Durum</th><th className="py-2.5 px-3">Aksiyon</th></tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {accounts.filter((a) => Number(a.balance) > 0 || a.overdueCount > 0).map((a) => (
                <tr key={a.id} className={a.overdueCount > 0 ? "bg-rose-50/40" : ""}>
                  <td className="py-2.5 px-3 font-bold">{a.companyName || a.name}</td>
                  <td className="py-2.5 px-3 font-bold">{Number(a.balance).toFixed(2)} TL</td>
                  <td className="py-2.5 px-3 font-bold text-rose-700">{Number(a.overdueTotal).toFixed(2)} TL</td>
                  <td className="py-2.5 px-3">{a.overdueCount}</td>
                  <td className="py-2.5 px-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${RISK_COLORS[a.riskLevel] || ""}`}>{a.riskLevel}</span></td>
                  <td className="py-2.5 px-3 flex gap-1">
                    <button onClick={() => setPaymentModal(a)} className="px-2 py-1 bg-emerald-700 text-white rounded-lg text-[10px] font-bold">Tahsilat Gir</button>
                    <button onClick={() => void post("/api/b2b", { action: "UPDATE", id: a.id, isBlocked: !a.isBlocked }).then(load)} className={`px-2 py-1 rounded-lg text-[10px] font-bold ${a.isBlocked ? "bg-emerald-100 text-emerald-800" : "bg-stone-800 text-white"}`}>
                      {a.isBlocked ? "Aç" : "Cariyi Kapat"}
                    </button>
                  </td>
                </tr>
              ))}
              {accounts.filter((a) => Number(a.balance) > 0 || a.overdueCount > 0).length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-stone-400">Açık alacak yok.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL: cari düzenle */}
      {editAccount && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <h3 className="font-black text-base">{editAccount.companyName || editAccount.name}</h3>
              <button onClick={() => setEditAccount(null)}><X className="w-5 h-5 text-stone-400" /></button>
            </div>
            <form onSubmit={saveAccount} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div><label className="block font-bold mb-1">Kredi Limiti (TL)</label><input type="number" value={editAccount.creditLimit} onChange={(e) => setEditAccount({ ...editAccount, creditLimit: e.target.value })} className={inputCls} /></div>
                <div><label className="block font-bold mb-1">Vade (gün)</label><input type="number" value={editAccount.paymentTermDays} onChange={(e) => setEditAccount({ ...editAccount, paymentTermDays: e.target.value })} className={inputCls} /></div>
                <div><label className="block font-bold mb-1">Cari İskonto %</label><input type="number" step="0.5" value={editAccount.discountRate} onChange={(e) => setEditAccount({ ...editAccount, discountRate: e.target.value })} className={inputCls} /></div>
                <div><label className="block font-bold mb-1">Min. Sipariş (TL)</label><input type="number" value={editAccount.minOrderAmount || "0"} onChange={(e) => setEditAccount({ ...editAccount, minOrderAmount: e.target.value })} className={inputCls} /></div>
              </div>
              <div>
                <label className="block font-bold mb-1">Fiyat Listesi</label>
                <select value={editAccount.priceListId || ""} onChange={(e) => setEditAccount({ ...editAccount, priceListId: e.target.value })} className={inputCls}>
                  <option value="">Varsayılan liste</option>
                  {priceListsData.map((l) => <option key={l.id} value={l.id}>{l.name} (%{Number(l.defaultDiscountRate)})</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={!!editAccount.isBlocked} onChange={(e) => setEditAccount({ ...editAccount, isBlocked: e.target.checked })} /> Cariyi kapat (risk)</label>
                <select value={editAccount.approvalStatus || "APPROVED"} onChange={(e) => setEditAccount({ ...editAccount, approvalStatus: e.target.value })} className={inputCls}>
                  <option value="APPROVED">Onaylı</option>
                  <option value="PENDING">Onay bekliyor</option>
                  <option value="REJECTED">Reddedildi</option>
                </select>
              </div>
              <button type="submit" className="w-full py-3 bg-sky-900 text-white font-bold rounded-xl">Kaydet</button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: tahsilat */}
      {paymentModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <div><h3 className="font-black text-base">Tahsilat Gir</h3><p className="text-xs text-stone-500">{paymentModal.companyName || paymentModal.name}</p></div>
              <button onClick={() => setPaymentModal(null)}><X className="w-5 h-5 text-stone-400" /></button>
            </div>
            <p className="text-xs bg-stone-50 border border-stone-200 rounded-xl p-2.5">Mevcut bakiye: <strong>{Number(paymentModal.balance).toFixed(2)} TL</strong></p>
            <form onSubmit={submitPayment} className="space-y-3 text-xs">
              <div><label className="block font-bold mb-1">Tahsilat Tutarı (TL)</label><input required type="number" step="0.01" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} className={inputCls} /></div>
              <div><label className="block font-bold mb-1">Yöntem</label>
                <select value={paymentForm.method} onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })} className={inputCls}>
                  <option>HAVALE</option><option>EFT</option><option>NAKİT</option><option>ÇEK</option><option>KREDİ KARTI</option>
                </select>
              </div>
              <input placeholder="Açıklama (ops.)" value={paymentForm.description} onChange={(e) => setPaymentForm({ ...paymentForm, description: e.target.value })} className={inputCls} />
              <button type="submit" className="w-full py-3 bg-emerald-700 text-white font-bold rounded-xl">Tahsilatı Kaydet</button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: yeni fiyat listesi */}
      {isListOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <h3 className="font-black text-base">Yeni Fiyat Listesi</h3>
              <button onClick={() => setIsListOpen(false)}><X className="w-5 h-5 text-stone-400" /></button>
            </div>
            <form onSubmit={createList} className="space-y-3 text-xs">
              <input required placeholder="KOD (DEALER, VIP…)" value={listForm.code} onChange={(e) => setListForm({ ...listForm, code: e.target.value })} className={`${inputCls} font-mono uppercase`} />
              <input required placeholder="Liste adı (Bayi Fiyat Listesi)" value={listForm.name} onChange={(e) => setListForm({ ...listForm, name: e.target.value })} className={inputCls} />
              <div><label className="block font-bold mb-1">Liste geneli iskonto %</label><input type="number" step="0.5" value={listForm.defaultDiscountRate} onChange={(e) => setListForm({ ...listForm, defaultDiscountRate: e.target.value })} className={inputCls} /></div>
              <input placeholder="Açıklama" value={listForm.description} onChange={(e) => setListForm({ ...listForm, description: e.target.value })} className={inputCls} />
              <button type="submit" className="w-full py-3 bg-sky-900 text-white font-bold rounded-xl">Listeyi Oluştur</button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ekstre */}
      {statement && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-3 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <div><h3 className="font-black text-base">Cari Ekstre</h3><p className="text-xs text-stone-500">{statement.customer.companyName || statement.customer.name}</p></div>
              <button onClick={() => setStatement(null)}><X className="w-5 h-5 text-stone-400" /></button>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center text-[10px]">
              {[
                { l: "Vadesi Gelmemiş", v: statement.summary.aging.current, c: "bg-emerald-50 text-emerald-800" },
                { l: "1–30 gün", v: statement.summary.aging.d30, c: "bg-amber-50 text-amber-800" },
                { l: "31–60 gün", v: statement.summary.aging.d60, c: "bg-orange-50 text-orange-800" },
                { l: "60+ gün", v: statement.summary.aging.d90plus, c: "bg-rose-50 text-rose-800" },
              ].map((b) => (
                <div key={b.l} className={`p-2 rounded-xl font-bold ${b.c}`}><span className="block">{b.l}</span><span>{Number(b.v).toFixed(0)} TL</span></div>
              ))}
            </div>
            <table className="w-full text-[11px] text-left">
              <thead className="bg-stone-50 text-stone-500 uppercase border-b border-stone-200">
                <tr><th className="py-2 px-2">Tarih</th><th className="py-2 px-2">Açıklama</th><th className="py-2 px-2">Vade</th><th className="py-2 px-2 text-right">Borç</th><th className="py-2 px-2 text-right">Alacak</th><th className="py-2 px-2 text-right">Bakiye</th></tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {statement.transactions.map((t: any) => (
                  <tr key={t.id} className={t.isOverdue ? "bg-rose-50/60" : ""}>
                    <td className="py-2 px-2">{new Date(t.createdAt).toLocaleDateString("tr-TR")}</td>
                    <td className="py-2 px-2">{t.description}</td>
                    <td className="py-2 px-2">{t.dueDate ? new Date(t.dueDate).toLocaleDateString("tr-TR") : "—"}</td>
                    <td className="py-2 px-2 text-right text-rose-700 font-bold">{t.type === "DEBIT" ? Number(t.amount).toFixed(2) : ""}</td>
                    <td className="py-2 px-2 text-right text-emerald-700 font-bold">{t.type === "CREDIT" ? Number(t.amount).toFixed(2) : ""}</td>
                    <td className="py-2 px-2 text-right font-black">{Number(t.balanceAfter).toFixed(2)}</td>
                  </tr>
                ))}
                {statement.transactions.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-stone-400">Hareket yok.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
