"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Product, Customer } from "@/lib/types";
import {
  Building2,
  Percent,
  Truck,
  ArrowRight,
  ShieldCheck,
  CreditCard,
  Plus,
  Minus,
  TrendingDown,
  AlertTriangle,
  Wallet,
  CalendarClock,
  FileSpreadsheet,
  Layers,
  CheckCircle2,
  X,
} from "lucide-react";

interface B2BPortalClientProps {
  products: Product[];
  b2bCustomers: Customer[];
}

interface CartLine {
  productId: number;
  name: string;
  sku: string;
  unit: string;
  quantity: number;
  listPrice: number;
  unitPrice: number;
  lineTotal: number;
  discountRate: number;
  tierLabel: string | null;
}

export function B2BPortalClient({ products, b2bCustomers }: B2BPortalClientProps) {
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(b2bCustomers[0] || null);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [quote, setQuote] = useState<{ quotes: any[]; subtotal: number; listTotal: number; totalSavings: number } | null>(null);
  const [credit, setCredit] = useState<any | null>(null);
  const [statement, setStatement] = useState<any | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<any | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [ladders, setLadders] = useState<Record<number, any[]>>({});
  const [showStatement, setShowStatement] = useState(false);

  const [appForm, setAppForm] = useState({ companyName: "", name: "", taxOffice: "", taxNumber: "", phone: "", email: "", city: "İstanbul" });
  const [appSubmitted, setAppSubmitted] = useState(false);

  const cartLines = useMemo(
    () => Object.entries(cart).filter(([, q]) => Number(q) > 0).map(([pid, q]) => ({ productId: Number(pid), quantity: Number(q) })),
    [cart]
  );

  // Canlı fiyat teklifi (kademeli fiyat + cari iskonto sunucuda hesaplanır)
  useEffect(() => {
    if (cartLines.length === 0 || !selectedCustomer) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/price-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "QUOTE", customerId: selectedCustomer.id, lines: cartLines }),
      }).then((r) => r.json());
      if (!cancelled && res.success) setQuote(res.data);
    })();
    return () => { cancelled = true; };
  }, [cartLines, selectedCustomer]);

  // Cari limit kontrolü
  useEffect(() => {
    if (!selectedCustomer) return;
    const total = (quote?.subtotal || 0) * 1.2;
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/b2b", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CHECK_CREDIT", customerId: selectedCustomer.id, orderTotal: total }),
      }).then((r) => r.json());
      if (!cancelled && res.success) setCredit(res.data);
    })();
    return () => { cancelled = true; };
  }, [selectedCustomer, quote]);

  const loadStatement = useCallback(async () => {
    if (!selectedCustomer) return;
    const res = await fetch(`/api/b2b?statement=${selectedCustomer.id}`, { cache: "no-store" }).then((r) => r.json());
    if (res.success) setStatement(res);
  }, [selectedCustomer]);

  useEffect(() => { void loadStatement(); }, [loadStatement]);

  const loadLadder = async (productId: number) => {
    if (ladders[productId]) return;
    const res = await fetch(`/api/price-lists?ladderProductId=${productId}${selectedCustomer ? `&customerId=${selectedCustomer.id}` : ""}`).then((r) => r.json());
    if (res.success) setLadders((prev) => ({ ...prev, [productId]: res.data }));
  };

  const setQty = (productId: number, qty: number) => {
    setCart((prev) => ({ ...prev, [productId]: Math.max(0, qty) }));
    void loadLadder(productId);
  };

  const lines: CartLine[] = (quote?.quotes || []).map((q: any) => {
    const p = products.find((x) => x.id === q.productId)!;
    return {
      productId: q.productId,
      name: p?.name || "?",
      sku: p?.sku || "",
      unit: p?.unit || "Adet",
      quantity: q.quantity,
      listPrice: q.listPrice,
      unitPrice: q.unitPrice,
      lineTotal: q.lineTotal,
      discountRate: q.discountRate,
      tierLabel: q.appliedTier?.label || null,
    };
  });

  const subtotal = quote?.subtotal || 0;
  const vat = subtotal * 0.2;
  const grandTotal = subtotal + vat;

  const handlePlaceB2BOrder = async () => {
    if (!selectedCustomer || lines.length === 0) return;
    setIsSubmitting(true);
    setOrderError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderType: "B2B",
          customerId: selectedCustomer.id,
          customerName: selectedCustomer.companyName || selectedCustomer.name,
          customerEmail: selectedCustomer.email,
          customerPhone: selectedCustomer.phone,
          paymentMethod: "B2B_CREDIT",
          warehouseId: 4,
          applyCampaigns: false, // B2B'de fiyat listesi/kademe geçerli
          subtotal,
          discountTotal: quote?.totalSavings || 0,
          taxTotal: vat.toFixed(2),
          grandTotal,
          shippingAddress: selectedCustomer.address || "Atölye Sevk Adresi",
          items: lines.map((l) => ({
            productId: l.productId,
            productName: l.name,
            sku: l.sku,
            unitPrice: l.unitPrice,
            quantity: l.quantity,
            taxRate: 20,
            totalPrice: l.lineTotal,
          })),
        }),
      }).then((r) => r.json());

      setIsSubmitting(false);
      if (res.success) {
        setOrderSuccess(res.data);
        setCart({});
        void loadStatement();
      } else {
        setOrderError(res.error || "Sipariş oluşturulamadı.");
      }
    } catch {
      setIsSubmitting(false);
      setOrderError("Sunucuya ulaşılamadı.");
    }
  };

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/b2b", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...appForm, approvalStatus: "PENDING", creditLimit: "0.00", discountRate: "0.00" }),
    }).then((r) => r.json());
    if (res.success) setAppSubmitted(true);
  };

  const creditUsage = credit && credit.creditLimit > 0 ? Math.min(100, Math.round((credit.balance / credit.creditLimit) * 100)) : 0;

  return (
    <div className="max-w-7xl mx-auto px-4 py-10 space-y-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-sky-950 via-stone-900 to-sky-900 text-white rounded-3xl p-8 md:p-10 shadow-xl">
        <div className="max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-500/20 text-sky-300 text-xs font-bold border border-sky-400/30">
            <Building2 className="w-3.5 h-3.5" />
            <span>Kurumsal Toptan Portalı · Kademeli Fiyat & Açık Hesap</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight leading-tight">
            Fiyat listenize özel <span className="text-sky-300">otomatik hacim indirimi</span>
          </h1>
          <p className="text-stone-300 text-sm">Miktarı artırdıkça birim fiyat otomatik düşer; cari limitiniz ve vadeniz anlık kontrol edilir.</p>
        </div>
      </div>

      {/* Cari seçimi & limit paneli */}
      {selectedCustomer && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-2 bg-white rounded-2xl border border-stone-200 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-black uppercase text-sky-800">Aktif Cari Hesap</span>
              {b2bCustomers.length > 1 && (
                <select
                  value={selectedCustomer.id}
                  onChange={(e) => setSelectedCustomer(b2bCustomers.find((c) => c.id === Number(e.target.value)) || null)}
                  className="text-[11px] border border-stone-200 rounded-lg px-2 py-1"
                >
                  {b2bCustomers.map((c) => <option key={c.id} value={c.id}>{c.companyName || c.name}</option>)}
                </select>
              )}
            </div>
            <h3 className="font-black text-stone-900">{selectedCustomer.companyName || selectedCustomer.name}</h3>
            <div className="grid grid-cols-2 gap-2 text-[11px] text-stone-600">
              <span>VKN: <strong>{selectedCustomer.taxNumber || "—"}</strong></span>
              <span>Vade: <strong>{(selectedCustomer as any).paymentTermDays || 30} gün</strong></span>
              <span>Fiyat Listesi: <strong>{(statement?.customer as any)?.priceListId ? "Özel liste" : "Toptan"}</strong></span>
              <span>Cari İskonto: <strong>%{Number(selectedCustomer.discountRate || 0)}</strong></span>
            </div>
            <button onClick={() => { setShowStatement(true); void loadStatement(); }} className="text-xs font-bold text-sky-800 hover:underline flex items-center gap-1">
              <FileSpreadsheet className="w-3.5 h-3.5" /> Cari Ekstre & Vade Takibi
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs">
            <span className="text-[10px] font-black uppercase text-stone-500">Kredi Limiti Kullanımı</span>
            <div className="text-2xl font-black text-stone-900 mt-1">{Number(credit?.balance || 0).toFixed(0)} <span className="text-sm text-stone-400">/ {Number(credit?.creditLimit || 0).toFixed(0)} TL</span></div>
            <div className="h-2 bg-stone-100 rounded-full overflow-hidden mt-2">
              <div className={`h-full rounded-full ${creditUsage >= 90 ? "bg-rose-600" : creditUsage >= 70 ? "bg-amber-500" : "bg-emerald-600"}`} style={{ width: `${creditUsage}%` }} />
            </div>
            <p className="text-[11px] text-stone-500 mt-1">Kullanılabilir: <strong className="text-emerald-700">{Number(credit?.availableCredit || 0).toFixed(2)} TL</strong></p>
          </div>

          <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs">
            <span className="text-[10px] font-black uppercase text-stone-500">Vadesi Geçen</span>
            <div className={`text-2xl font-black mt-1 ${(statement?.summary?.overdueTotal || 0) > 0 ? "text-rose-700" : "text-emerald-700"}`}>
              {Number(statement?.summary?.overdueTotal || 0).toFixed(2)} TL
            </div>
            <p className="text-[11px] text-stone-500 mt-1">{statement?.summary?.overdueCount || 0} adet gecikmiş fatura</p>
          </div>
        </div>
      )}

      {/* Kademeli fiyat tablosu */}
      <section className="bg-white rounded-3xl p-6 border border-stone-200 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-sky-800" />
          <h2 className="text-lg font-black text-stone-900">Kademeli Hacim İskontosu (Tier Pricing)</h2>
        </div>
        <p className="text-xs text-stone-500">Sepete eklediğiniz miktara göre birim fiyat otomatik düşer — aşağıdaki tabloda canlı görürsünüz.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          {[
            { r: "1 – 9 adet", d: "Liste fiyatı", c: "bg-stone-50 border-stone-200 text-stone-700" },
            { r: "10 – 49 adet", d: "%10 iskonto", c: "bg-sky-50 border-sky-200 text-sky-900" },
            { r: "50 – 99 adet", d: "%18 iskonto", c: "bg-sky-100 border-sky-300 text-sky-950" },
            { r: "100+ adet (koli)", d: "%25 iskonto", c: "bg-emerald-100 border-emerald-300 text-emerald-950" },
          ].map((t) => (
            <div key={t.r} className={`p-3 rounded-2xl border text-center ${t.c}`}>
              <span className="text-[11px] font-bold block">{t.r}</span>
              <span className="text-sm font-black block mt-0.5">{t.d}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Katalog + Sepet */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-3">
          <h3 className="text-base font-black text-stone-900">Toptan Katalog</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {products.map((p) => {
              const qty = cart[p.id] || 0;
              const q = quote?.quotes?.find((x: any) => x.productId === p.id);
              const ladder = ladders[p.id];
              return (
                <div key={p.id} className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-stone-400">
                    <span className="font-mono">{p.sku}</span>
                    <span className="bg-sky-50 text-sky-800 font-bold px-2 py-0.5 rounded">Koli: {p.packageQty}</span>
                  </div>
                  <h4 className="font-bold text-sm text-stone-900 line-clamp-2">{p.name}</h4>

                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-black text-sky-950">{(q?.unitPrice ?? Number(p.b2bPrice || p.retailPrice)).toFixed(2)} TL</span>
                    <span className="text-xs text-stone-400 line-through">{Number(p.retailPrice).toFixed(2)}</span>
                    {q?.discountRate > 0 && <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">%{q.discountRate} avantaj</span>}
                  </div>
                  {q?.appliedTier && (
                    <p className="text-[10px] font-bold text-sky-700 flex items-center gap-1">
                      <TrendingDown className="w-3 h-3" /> {q.appliedTier.label} baremi uygulandı
                    </p>
                  )}

                  {ladder && ladder.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {ladder.map((t: any, i: number) => (
                        <button
                          key={i}
                          onClick={() => setQty(p.id, t.minQty)}
                          className={`text-[10px] px-1.5 py-0.5 rounded border font-bold transition ${qty >= t.minQty && (!t.maxQty || qty <= t.maxQty) ? "bg-sky-900 text-white border-sky-900" : "bg-white border-stone-200 text-stone-600 hover:border-sky-400"}`}
                        >
                          {t.label}: {t.unitPrice.toFixed(2)}₺
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 pt-1">
                    <button onClick={() => setQty(p.id, qty - 10)} className="p-1.5 bg-stone-100 rounded-lg hover:bg-stone-200"><Minus className="w-3.5 h-3.5" /></button>
                    <input
                      type="number"
                      min="0"
                      value={qty || ""}
                      placeholder="0"
                      onChange={(e) => setQty(p.id, Number(e.target.value))}
                      className="w-16 text-center px-2 py-1.5 border border-stone-300 rounded-lg text-xs font-bold"
                    />
                    <button onClick={() => setQty(p.id, qty + 10)} className="p-1.5 bg-stone-100 rounded-lg hover:bg-stone-200"><Plus className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setQty(p.id, (qty || 0) + 50)} className="flex-1 py-1.5 bg-sky-900 hover:bg-sky-950 text-white font-bold text-xs rounded-lg">+50 Koli</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sepet & sipariş */}
        <div className="lg:col-span-4 space-y-3">
          <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-xs space-y-3 sticky top-24">
            <h3 className="font-black text-base text-stone-900">Toptan Sevk Sepeti</h3>

            <div className="max-h-56 overflow-y-auto divide-y divide-stone-100 text-xs">
              {lines.length === 0 && <p className="text-stone-400 py-4 text-center">Sepet boş.</p>}
              {lines.map((l) => (
                <div key={l.productId} className="py-2 flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <span className="font-bold text-stone-900 block truncate">{l.name}</span>
                    <span className="text-stone-400 text-[10px]">
                      {l.quantity} × {l.unitPrice.toFixed(2)} TL {l.tierLabel && <span className="text-sky-700 font-bold">· {l.tierLabel}</span>}
                    </span>
                  </div>
                  <span className="font-bold text-stone-900 shrink-0">{l.lineTotal.toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="border-t border-stone-200 pt-3 space-y-1.5 text-xs">
              {quote && quote.totalSavings > 0 && (
                <div className="flex justify-between text-emerald-700 font-bold">
                  <span>Toptan Avantajınız</span>
                  <span>-{quote.totalSavings.toFixed(2)} TL</span>
                </div>
              )}
              <div className="flex justify-between text-stone-600"><span>Ara Toplam (KDV Hariç)</span><span className="font-semibold text-stone-900">{subtotal.toFixed(2)} TL</span></div>
              <div className="flex justify-between text-stone-600"><span>KDV (%20)</span><span className="font-semibold">{vat.toFixed(2)} TL</span></div>
              <div className="flex justify-between text-base font-black text-stone-900 pt-1 border-t border-stone-200">
                <span>Genel Toplam</span><span className="text-sky-900">{grandTotal.toFixed(2)} TL</span>
              </div>
            </div>

            {/* Kredi uyarısı */}
            {credit && !credit.allowed && lines.length > 0 && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-[11px] text-rose-800 flex gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span className="font-semibold">{credit.reason}</span>
              </div>
            )}
            {credit?.allowed && lines.length > 0 && (
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-[11px] text-emerald-800 flex items-center gap-2">
                <CalendarClock className="w-4 h-4 shrink-0" />
                <span>Vade: <strong>{new Date(credit.dueDate).toLocaleDateString("tr-TR")}</strong> · Limit sonrası: {credit.newBalance.toFixed(2)} TL</span>
              </div>
            )}

            <button
              disabled={lines.length === 0 || isSubmitting || (credit ? !credit.allowed : false)}
              onClick={() => void handlePlaceB2BOrder()}
              className="w-full py-3.5 bg-sky-900 hover:bg-sky-950 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md transition"
            >
              {isSubmitting ? "Sipariş kaydediliyor…" : "Cari Hesaptan Siparişi Onayla"}
            </button>

            {orderError && <p className="text-[11px] text-rose-700 font-semibold">{orderError}</p>}

            {orderSuccess && (
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-900 space-y-1">
                <p className="font-bold flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Sipariş alındı!</p>
                <p>No: <strong>{orderSuccess.order.orderNumber}</strong></p>
                <p>e-Fatura: <strong>{orderSuccess.invoice.invoiceNumber}</strong></p>
              </div>
            )}
          </div>

          {/* Bayilik başvurusu */}
          <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-xs space-y-2">
            <h4 className="font-bold text-sm text-stone-900">Yeni Bayilik Başvurusu</h4>
            {appSubmitted ? (
              <p className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-900">✓ Başvurunuz alındı, onay sonrası cari limitiniz tanımlanacaktır.</p>
            ) : (
              <form onSubmit={handleApply} className="space-y-2 text-xs">
                <input required placeholder="Şirket Ünvanı" value={appForm.companyName} onChange={(e) => setAppForm({ ...appForm, companyName: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-xl" />
                <div className="grid grid-cols-2 gap-2">
                  <input required placeholder="Yetkili" value={appForm.name} onChange={(e) => setAppForm({ ...appForm, name: e.target.value })} className="px-3 py-2 border border-stone-300 rounded-xl" />
                  <input required maxLength={10} placeholder="VKN" value={appForm.taxNumber} onChange={(e) => setAppForm({ ...appForm, taxNumber: e.target.value })} className="px-3 py-2 border border-stone-300 rounded-xl font-mono" />
                </div>
                <input required placeholder="Telefon" value={appForm.phone} onChange={(e) => setAppForm({ ...appForm, phone: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-xl" />
                <button type="submit" className="w-full py-2.5 bg-stone-900 text-white font-bold rounded-xl">Başvuruyu Gönder</button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* Cari ekstre modalı */}
      {showStatement && statement && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <div>
                <h3 className="font-black text-base text-stone-900">Cari Ekstre & Vade Analizi</h3>
                <p className="text-xs text-stone-500">{statement.customer.companyName || statement.customer.name}</p>
              </div>
              <button onClick={() => setShowStatement(false)}><X className="w-5 h-5 text-stone-400" /></button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              {[
                { l: "Bakiye", v: statement.summary.balance, c: "text-stone-900" },
                { l: "Limit", v: statement.summary.creditLimit, c: "text-stone-600" },
                { l: "Kullanılabilir", v: statement.summary.availableCredit, c: "text-emerald-700" },
                { l: "Vadesi Geçen", v: statement.summary.overdueTotal, c: "text-rose-700" },
              ].map((k) => (
                <div key={k.l} className="p-3 bg-stone-50 rounded-xl border border-stone-200">
                  <span className="text-[9px] font-bold uppercase text-stone-500 block">{k.l}</span>
                  <span className={`text-sm font-black ${k.c}`}>{Number(k.v).toFixed(2)}</span>
                </div>
              ))}
            </div>

            {/* Yaşlandırma */}
            <div>
              <h4 className="text-xs font-bold text-stone-800 mb-1.5">Alacak Yaşlandırma (Aging)</h4>
              <div className="grid grid-cols-4 gap-2 text-center text-[10px]">
                {[
                  { l: "Vadesi Gelmemiş", v: statement.summary.aging.current, c: "bg-emerald-50 text-emerald-800" },
                  { l: "1–30 gün", v: statement.summary.aging.d30, c: "bg-amber-50 text-amber-800" },
                  { l: "31–60 gün", v: statement.summary.aging.d60, c: "bg-orange-50 text-orange-800" },
                  { l: "60+ gün", v: statement.summary.aging.d90plus, c: "bg-rose-50 text-rose-800" },
                ].map((b) => (
                  <div key={b.l} className={`p-2 rounded-xl font-bold ${b.c}`}>
                    <span className="block">{b.l}</span>
                    <span className="text-xs">{Number(b.v).toFixed(0)} TL</span>
                  </div>
                ))}
              </div>
            </div>

            <table className="w-full text-[11px] text-left">
              <thead className="bg-stone-50 text-stone-500 uppercase border-b border-stone-200">
                <tr><th className="py-2 px-2">Tarih</th><th className="py-2 px-2">Açıklama</th><th className="py-2 px-2">Vade</th><th className="py-2 px-2 text-right">Borç</th><th className="py-2 px-2 text-right">Alacak</th><th className="py-2 px-2 text-right">Bakiye</th></tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {statement.transactions.map((t: any) => (
                  <tr key={t.id} className={t.isOverdue ? "bg-rose-50/60" : ""}>
                    <td className="py-2 px-2 text-stone-500">{new Date(t.createdAt).toLocaleDateString("tr-TR")}</td>
                    <td className="py-2 px-2">{t.description}{t.isOverdue && <span className="ml-1 text-[9px] font-black text-rose-700">GECİKMİŞ</span>}</td>
                    <td className="py-2 px-2 text-stone-500">{t.dueDate ? new Date(t.dueDate).toLocaleDateString("tr-TR") : "—"}</td>
                    <td className="py-2 px-2 text-right font-bold text-rose-700">{t.type === "DEBIT" ? Number(t.amount).toFixed(2) : ""}</td>
                    <td className="py-2 px-2 text-right font-bold text-emerald-700">{t.type === "CREDIT" ? Number(t.amount).toFixed(2) : ""}</td>
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
