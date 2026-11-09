"use client";

import React, { useEffect, useState } from "react";
import {
  Wallet,
  CreditCard,
  Landmark,
  Save,
  RefreshCw,
  Copy,
  Check,
  CircleCheck,
  CircleAlert,
  KeyRound,
  ShieldCheck,
} from "lucide-react";
import { PanelShell } from "@/components/admin/SiteManagement";

const inputCls =
  "w-full px-3 py-2 border border-stone-300 rounded-xl text-xs focus:outline-none focus:border-amber-700 bg-white";
const labelCls = "block text-[10px] font-bold text-stone-500 uppercase mb-1";

interface MaskedPaymentSettings {
  paytr: {
    enabled: boolean;
    mode: "test" | "live";
    merchantId: string;
    currency: string;
    maxInstallment: string;
    hasMerchantKey: boolean;
    hasMerchantSalt: boolean;
  };
  iyzico: {
    enabled: boolean;
    mode: "sandbox" | "live";
    apiKey: string;
    threedsRequired: boolean;
    hasApiSecret: boolean;
  };
}

/** Kopyalama düğmeli salt-okunur URL satırı */
function UrlRow({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* pano yoksa metin zaten seçilebilir */
    }
  };
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <div className="flex items-stretch gap-2">
        <code className="flex-1 min-w-0 px-3 py-2 bg-stone-100 border border-stone-200 rounded-xl text-[11px] font-mono text-stone-800 truncate select-all leading-6">
          {url}
        </code>
        <button
          type="button"
          onClick={copy}
          title="Panoya kopyala"
          className="shrink-0 px-3 rounded-xl border border-stone-200 bg-white hover:border-amber-400 hover:text-amber-900 text-stone-600 transition"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

function ModePills({ mode, testValue, onChange }: { mode: "test" | "live" | "sandbox"; testValue: "test" | "sandbox"; onChange: (m: any) => void }) {
  const isLive = mode === "live";
  return (
    <div className="inline-flex rounded-xl border border-stone-200 bg-stone-100 p-1 text-[10px] font-bold">
      <button
        type="button"
        onClick={() => onChange(testValue)}
        className={`px-3 py-1.5 rounded-lg transition ${!isLive ? "bg-white text-stone-900 shadow-xs" : "text-stone-500"}`}
      >
        {testValue === "sandbox" ? "Sandbox (Test)" : "Test Modu"}
      </button>
      <button
        type="button"
        onClick={() => onChange("live")}
        className={`px-3 py-1.5 rounded-lg transition ${isLive ? "bg-rose-700 text-white shadow-xs" : "text-stone-500"}`}
      >
        Canlı
      </button>
    </div>
  );
}

function SecretInput({
  label,
  hasExisting,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  hasExisting: boolean;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label className={labelCls}>
        {label}{" "}
        {hasExisting ? (
          <span className="normal-case font-semibold text-emerald-700">(kayıtlı — değiştirmek için yeni değer yazın)</span>
        ) : (
          <span className="normal-case font-semibold text-rose-600">(tanımlı değil)</span>
        )}
      </label>
      <input
        type="password"
        autoComplete="new-password"
        className={`${inputCls} font-mono`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={hasExisting ? "••••••••••••" : placeholder}
      />
    </div>
  );
}

export function PaymentApiSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"paytr" | "iyzico" | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; isError: boolean } | null>(null);
  const [hasSecrets, setHasSecrets] = useState({ paytrKey: false, paytrSalt: false, iyzicoSecret: false });

  const [paytr, setPaytr] = useState({
    enabled: false,
    mode: "test" as "test" | "live",
    merchantId: "",
    merchantKey: "", // yazılmadığı sürece boş kalır → kayıtlı korunur
    merchantSalt: "",
    currency: "TL",
    maxInstallment: "1",
  });
  const [iyzico, setIyzico] = useState({
    enabled: false,
    mode: "sandbox" as "sandbox" | "live",
    apiKey: "",
    apiSecret: "",
    threedsRequired: true,
  });

  const origin = typeof window !== "undefined" ? window.location.origin : "https://ipektuhafiye.com";

  const applyMasked = (d: MaskedPaymentSettings) => {
    setPaytr((p) => ({
      ...p,
      enabled: d.paytr.enabled,
      mode: d.paytr.mode,
      merchantId: d.paytr.merchantId,
      currency: d.paytr.currency,
      maxInstallment: d.paytr.maxInstallment,
      merchantKey: "",
      merchantSalt: "",
    }));
    setIyzico((p) => ({
      ...p,
      enabled: d.iyzico.enabled,
      mode: d.iyzico.mode,
      apiKey: d.iyzico.apiKey,
      threedsRequired: d.iyzico.threedsRequired,
      apiSecret: "",
    }));
    setHasSecrets({
      paytrKey: d.paytr.hasMerchantKey,
      paytrSalt: d.paytr.hasMerchantSalt,
      iyzicoSecret: d.iyzico.hasApiSecret,
    });
  };

  const load = () => {
    setLoading(true);
    fetch("/api/payment-settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.success) applyMasked(d.data);
        else setFeedback({ text: d?.error?.message || "Ayarlar alınamadı.", isError: true });
      })
      .catch(() => setFeedback({ text: "Sunucuya ulaşılamadı.", isError: true }))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const save = async (which: "paytr" | "iyzico") => {
    setSaving(which);
    setFeedback(null);
    const patch: Record<string, string | boolean> =
      which === "paytr"
        ? {
            "site.payment.paytr.enabled": paytr.enabled ? "true" : "false",
            "site.payment.paytr.mode": paytr.mode,
            "site.payment.paytr.merchant_id": paytr.merchantId.trim(),
            "site.payment.paytr.currency": paytr.currency,
            "site.payment.paytr.max_installment": paytr.maxInstallment,
            ...(paytr.merchantKey.trim() ? { "site.payment.paytr.merchant_key": paytr.merchantKey.trim() } : {}),
            ...(paytr.merchantSalt.trim() ? { "site.payment.paytr.merchant_salt": paytr.merchantSalt.trim() } : {}),
          }
        : {
            "site.payment.iyzico.enabled": iyzico.enabled ? "true" : "false",
            "site.payment.iyzico.mode": iyzico.mode,
            "site.payment.iyzico.api_key": iyzico.apiKey.trim(),
            "site.payment.iyzico.threeds_required": iyzico.threedsRequired ? "true" : "false",
            ...(iyzico.apiSecret.trim() ? { "site.payment.iyzico.api_secret": iyzico.apiSecret.trim() } : {}),
          };
    try {
      const res = await fetch("/api/payment-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patch }),
      });
      const d = await res.json();
      if (!d.success) {
        setFeedback({ text: d?.error?.message || "Kaydedilemedi.", isError: true });
        return;
      }
      applyMasked(d.data);
      setFeedback({ text: which === "paytr" ? "PayTR ayarları kaydedildi." : "iyzico ayarları kaydedildi.", isError: false });
    } catch {
      setFeedback({ text: "Sunucuya ulaşılamadı.", isError: true });
    } finally {
      setSaving(null);
    }
  };

  /** İstemci tarafı tamlık kontrolü (ilk kayıt için yardımcı — gerçek doğrulama sunucuda) */
  const validate = (which: "paytr" | "iyzico") => {
    const problems: string[] = [];
    if (which === "paytr") {
      if (!paytr.merchantId.trim()) problems.push("Mağaza No boş");
      else if (!/^\d{3,12}$/.test(paytr.merchantId.trim())) problems.push("Mağaza No yalnızca rakam olmalı");
      if (!hasSecrets.paytrKey && !paytr.merchantKey.trim()) problems.push("Mağaza Parola tanımlı değil");
      if (!hasSecrets.paytrSalt && !paytr.merchantSalt.trim()) problems.push("Gizli Tuz tanımlı değil");
    } else {
      if (!iyzico.apiKey.trim()) problems.push("API Key boş");
      if (!hasSecrets.iyzicoSecret && !iyzico.apiSecret.trim()) problems.push("Secret Key tanımlı değil");
    }
    setFeedback(
      problems.length
        ? { text: `Eksik/hatalı: ${problems.join(" • ")}`, isError: true }
        : { text: "Tüm zorunlu alanlar dolu görünüyor. Canlı denemeyi ilk gerçek işlemle yapın.", isError: false }
    );
  };

  if (loading) {
    return (
      <PanelShell icon={Wallet} title="Ödeme API Ayarları" desc="PayTR ve iyzico ödeme altyapısı.">
        <p className="text-xs text-stone-400">Yükleniyor…</p>
      </PanelShell>
    );
  }

  const paytrLive = paytr.mode === "live";
  const iyzicoLive = iyzico.mode === "live";

  return (
    <PanelShell
      icon={Wallet}
      title="Ödeme API Ayarları"
      desc="PayTR ve iyzico sanal pos entegrasyonu — canlıya almadan önce Test/Sandbox modunda doğrulayın."
    >
      <div className="max-w-3xl space-y-4">
        {/* Güvenlik notu */}
        <div className="flex items-start gap-2.5 p-3 rounded-xl border border-sky-200 bg-sky-50 text-sky-950">
          <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5 text-sky-700" />
          <p className="text-[11px] leading-snug">
            Gizli anahtarlar (Mağaza Parola, Gizli Tuz, Secret Key) yalnızca sunucuda saklanır ve{" "}
            <strong>hiçbir zaman</strong> vitrine veya tarayıcıya gönderilmez. Boş bıraktığınız gizli alanlar kaydedilmez
            (mevcut değer korunur).
          </p>
        </div>

        {feedback && (
          <div
            className={`p-2.5 rounded-xl text-xs font-medium border ${
              feedback.isError ? "bg-rose-50 border-rose-200 text-rose-800" : "bg-emerald-50 border-emerald-200 text-emerald-800"
            }`}
          >
            {feedback.text}
          </div>
        )}

        {/* ================= PAYTR ================= */}
        <section className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-stone-100 bg-stone-50/60 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-stone-900 tracking-wide">PayTR Sanal POS</h3>
                <p className="text-[10px] text-stone-500">paytr.com üzerinden kredi kartı / banka kartı tahsilatı</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${paytrLive ? "bg-rose-100 text-rose-800 border border-rose-200" : "bg-stone-200 text-stone-600"}`}>
                {paytrLive ? "Canlı" : "Test"}
              </span>
              <span className={`px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${paytr.enabled ? "bg-emerald-100 text-emerald-800 border border-emerald-200" : "bg-stone-100 text-stone-500"}`}>
                {paytr.enabled ? "Aktif" : "Kapalı"}
              </span>
            </div>
          </div>

          <div className="p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-amber-800"
                  checked={paytr.enabled}
                  onChange={(e) => setPaytr({ ...paytr, enabled: e.target.checked })}
                />
                <span className="text-xs font-bold text-stone-800">PayTR entegrasyonunu etkinleştir</span>
              </label>
              <ModePills mode={paytr.mode} testValue="test" onChange={(m) => setPaytr({ ...paytr, mode: m })} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Mağaza No (Merchant ID)</label>
                <input
                  className={`${inputCls} font-mono`}
                  inputMode="numeric"
                  value={paytr.merchantId}
                  onChange={(e) => setPaytr({ ...paytr, merchantId: e.target.value })}
                  placeholder="123456"
                />
              </div>
              <div>
                <label className={labelCls}>Para Birimi</label>
                <select className={inputCls} value={paytr.currency} onChange={(e) => setPaytr({ ...paytr, currency: e.target.value })}>
                  <option value="TL">TL</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Maks. Taksit</label>
                <select className={inputCls} value={paytr.maxInstallment} onChange={(e) => setPaytr({ ...paytr, maxInstallment: e.target.value })}>
                  {["1", "2", "3", "6", "9", "12"].map((n) => (
                    <option key={n} value={n}>{n === "1" ? "Taksitsiz" : `${n} Taksit`}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <SecretInput
                label="Mağaza Parola (Merchant Key)"
                hasExisting={hasSecrets.paytrKey}
                value={paytr.merchantKey}
                onChange={(v) => setPaytr({ ...paytr, merchantKey: v })}
                placeholder="PayTR mağaza parolası"
              />
              <SecretInput
                label="Gizli Tuz (Merchant Salt)"
                hasExisting={hasSecrets.paytrSalt}
                value={paytr.merchantSalt}
                onChange={(v) => setPaytr({ ...paytr, merchantSalt: v })}
                placeholder="PayTR gizli tuz"
              />
            </div>

            <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 space-y-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-stone-500 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5" /> PayTR Paneline Tanımlanacak Adresler
              </p>
              <UrlRow label="Bildirim (IPN / Webhook) Adresi" url={`${origin}/api/payments/paytr/notify`} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <UrlRow label="Başarı (OK) Adresi" url={`${origin}/odeme?odeme=basarili&provider=paytr`} />
                <UrlRow label="Hata (FAIL) Adresi" url={`${origin}/odeme?odeme=hatali&provider=paytr`} />
              </div>
              <p className="text-[10px] text-stone-400">Bu adresleri PayTR mağaza panelinizdeki “Ayarlar → API / Bildirim” bölümüne ekleyin.</p>
            </div>

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <button onClick={() => validate("paytr")} className="flex items-center gap-1.5 px-3 py-2.5 bg-white border border-stone-200 hover:border-amber-400 text-stone-700 text-xs font-bold rounded-xl transition">
                <CircleCheck className="w-4 h-4 text-emerald-600" /> Ayarları Doğrula
              </button>
              <button onClick={() => save("paytr")} disabled={saving !== null} className="flex items-center gap-1.5 px-5 py-2.5 bg-amber-800 hover:bg-amber-900 disabled:opacity-60 text-white text-xs font-bold rounded-xl transition">
                <Save className="w-4 h-4" />
                {saving === "paytr" ? "Kaydediliyor…" : "PayTR'ı Kaydet"}
              </button>
            </div>
          </div>
        </section>

        {/* ================= IYZICO ================= */}
        <section className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-stone-100 bg-stone-50/60 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-800 flex items-center justify-center">
                <Landmark className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-stone-900 tracking-wide">iyzico Ödeme Altyapısı</h3>
                <p className="text-[10px] text-stone-500">iyzico ile 3D Secure kart ödemeleri (Checkout Form / Ödeme API)</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${iyzicoLive ? "bg-rose-100 text-rose-800 border border-rose-200" : "bg-stone-200 text-stone-600"}`}>
                {iyzicoLive ? "Canlı" : "Sandbox"}
              </span>
              <span className={`px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${iyzico.enabled ? "bg-emerald-100 text-emerald-800 border border-emerald-200" : "bg-stone-100 text-stone-500"}`}>
                {iyzico.enabled ? "Aktif" : "Kapalı"}
              </span>
            </div>
          </div>

          <div className="p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-amber-800"
                  checked={iyzico.enabled}
                  onChange={(e) => setIyzico({ ...iyzico, enabled: e.target.checked })}
                />
                <span className="text-xs font-bold text-stone-800">iyzico entegrasyonunu etkinleştir</span>
              </label>
              <ModePills mode={iyzico.mode} testValue="sandbox" onChange={(m) => setIyzico({ ...iyzico, mode: m })} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>API Key</label>
                <input
                  className={`${inputCls} font-mono`}
                  autoComplete="off"
                  value={iyzico.apiKey}
                  onChange={(e) => setIyzico({ ...iyzico, apiKey: e.target.value })}
                  placeholder="sandbox ya da canlı API anahtarı"
                />
              </div>
              <SecretInput
                label="Secret Key"
                hasExisting={hasSecrets.iyzicoSecret}
                value={iyzico.apiSecret}
                onChange={(v) => setIyzico({ ...iyzico, apiSecret: v })}
                placeholder="iyzico gizli anahtarı"
              />
            </div>

            <label className="flex items-center gap-3 p-3 rounded-xl border border-stone-200 bg-stone-50 cursor-pointer select-none">
              <input
                type="checkbox"
                className="w-4 h-4 accent-amber-800"
                checked={iyzico.threedsRequired}
                onChange={(e) => setIyzico({ ...iyzico, threedsRequired: e.target.checked })}
              />
              <span>
                <span className="text-xs font-bold text-stone-800 block">3D Secure zorunlu</span>
                <span className="text-[10px] text-stone-500">Kapatmayın — kart işlemlerinde 3D doğrulama hem yasal hem dolandırıcılık koruması içindir.</span>
              </span>
            </label>

            <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 space-y-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-stone-500 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5" /> iyzico Konsoluna Tanımlanacak Adres
              </p>
              <UrlRow label="Ödeme Sonrası Dönüş (Callback) Adresi" url={`${origin}/api/payments/iyzico/callback`} />
              <p className="text-[10px] text-stone-400">
                Kullanılan API ucu:{" "}
                <code className="font-mono text-stone-600">{iyzicoLive ? "https://api.iyzipay.com" : "https://sandbox-api.iyzipay.com"}</code>
                {" "}({iyzicoLive ? "canlı" : "sandbox"} moda göre)
              </p>
            </div>

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <button onClick={() => validate("iyzico")} className="flex items-center gap-1.5 px-3 py-2.5 bg-white border border-stone-200 hover:border-amber-400 text-stone-700 text-xs font-bold rounded-xl transition">
                <CircleCheck className="w-4 h-4 text-emerald-600" /> Ayarları Doğrula
              </button>
              <button onClick={() => save("iyzico")} disabled={saving !== null} className="flex items-center gap-1.5 px-5 py-2.5 bg-amber-800 hover:bg-amber-900 disabled:opacity-60 text-white text-xs font-bold rounded-xl transition">
                <Save className="w-4 h-4" />
                {saving === "iyzico" ? "Kaydediliyor…" : "iyzico'yu Kaydet"}
              </button>
            </div>
          </div>
        </section>

        <p className="text-[10px] text-stone-400 flex items-center gap-1.5 px-1">
          <CircleAlert className="w-3.5 h-3.5 shrink-0" />
          Bu ayarlar checkout altyapısına aktarılmak üzere saklanır. Gerçek çekim akışı (token/ön provizyon, 3D yönlendirme)
          PayTR ve iyzico canlı hesaplarınız hazır olduğunda etkinleştirilir; vitrindeki durum{" "}
          <code className="font-mono">/api/payments/status</code> adresinden okunabilir.
        </p>
      </div>
    </PanelShell>
  );
}
