"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  PanelTop,
  PanelBottom,
  Database,
  ShoppingCart,
  LockKeyhole,
  Landmark,
  CreditCard,
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
  RotateCcw,
  History,
  Loader2,
  Upload,
} from "lucide-react";
import { DEFAULT_SITE_SETTINGS } from "@/lib/site-settings-shared";

import { authFetch, downloadAuthenticated } from "@/lib/client-auth";
type SiteTab = "header" | "footer" | "cart" | "database";

const inputCls =
  "w-full px-3 py-2 border border-stone-300 rounded-xl text-xs focus:outline-none focus:border-amber-700 bg-white";
const labelCls = "block text-[10px] font-bold text-stone-500 uppercase mb-1";

export function PanelShell({
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
    authFetch("/api/site-settings", { cache: "no-store" })
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
      const res = await authFetch("/api/site-settings", {
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

const CART_KEYS = [
  "site.cart.enabled",
  "site.cart.free_shipping_threshold",
  "site.cart.shipping_fee",
  "site.cart.notice",
  "site.cart.empty_message",
  "site.cart.trust_text",
];

const CHECKOUT_KEYS = [
  "site.checkout.title",
  "site.checkout.payment_card_enabled",
  "site.checkout.payment_eft_enabled",
  "site.checkout.card_note",
  "site.checkout.eft_note",
  "site.checkout.eft_bank",
  "site.checkout.eft_iban",
  "site.checkout.eft_account_name",
  "site.checkout.trust_text",
  "site.checkout.success_note",
];

const FOOTER_KEYS = [
  "site.footer.description",
  "site.footer.store_address",
  "site.footer.warehouse_address",
  "site.footer.phone_line",
  "site.footer.email",
  "site.footer.copyright",
  "site.social.instagram",
  "site.social.facebook",
  "site.social.youtube",
  "site.social.tiktok",
  "site.social.x",
  "site.social.linkedin",
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

const SOCIAL_FIELDS: { key: string; label: string; placeholder: string }[] = [
  { key: "site.social.instagram", label: "Instagram", placeholder: "https://instagram.com/kullaniciadi" },
  { key: "site.social.facebook", label: "Facebook", placeholder: "https://facebook.com/sayfaadi" },
  { key: "site.social.youtube", label: "YouTube", placeholder: "https://youtube.com/@kanaladi" },
  { key: "site.social.tiktok", label: "TikTok", placeholder: "https://tiktok.com/@kullaniciadi" },
  { key: "site.social.x", label: "X (Twitter)", placeholder: "https://x.com/kullaniciadi" },
  { key: "site.social.linkedin", label: "LinkedIn", placeholder: "https://linkedin.com/company/sirketadi" },
];

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

          <div className="pt-2 border-t border-stone-100">
            <p className="text-[10px] font-black uppercase tracking-widest text-stone-500 mb-1">Sosyal Medya</p>
            <p className="text-[10px] text-stone-400 mb-2">Boş bırakılan alan footer&apos;da gösterilmez. Tam adres (https://...) girin.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {SOCIAL_FIELDS.map((f) => (
                <div key={f.key}>
                  <label className={labelCls}>{f.label}</label>
                  <input
                    className={inputCls}
                    type="url"
                    inputMode="url"
                    value={form[f.key] || ""}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                  />
                </div>
              ))}
            </div>
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

function CartSettingsPanel() {
  const { form, setForm, loading, saving, feedback, save } = useSiteSettings();
  const threshold = parseFloat(String(form["site.cart.free_shipping_threshold"] || "0").replace(",", ".")) || 0;
  const fee = parseFloat(String(form["site.cart.shipping_fee"] || "0").replace(",", ".")) || 0;
  const cartOn = form["site.cart.enabled"] !== "false";
  return (
    <PanelShell icon={ShoppingCart} title="Sepetim Ayarı" desc="Üst header'daki 'Sepetim' düğmesi, sepet çekmecesi, ücretsiz kargo kuralları ve güvenli ödeme sayfası (2. bölüm).">
      {loading ? (
        <p className="text-xs text-stone-400">Yükleniyor…</p>
      ) : (
        <>
        <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4 max-w-3xl">
          <Feedback feedback={feedback} />

          <label className="flex items-start gap-3 p-3 rounded-xl border border-stone-200 bg-stone-50 cursor-pointer select-none">
            <input
              type="checkbox"
              className="w-4 h-4 accent-amber-800 mt-0.5"
              checked={cartOn}
              onChange={(e) => setForm({ ...form, "site.cart.enabled": e.target.checked ? "true" : "false" })}
            />
            <span>
              <span className="text-xs font-bold text-stone-800 block">Sepet etkin</span>
              <span className="text-[10px] text-stone-500">Kapatırsanız header&apos;daki “Sepetim” düğmesi gizlenir; sepet çekmecesi, sepet sayfası ve ödeme adımında uyarı gösterilir.</span>
            </span>
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Ücretsiz Kargo Eşiği (TL)</label>
              <input
                type="number"
                min={0}
                step="1"
                inputMode="decimal"
                className={inputCls}
                value={form["site.cart.free_shipping_threshold"]}
                onChange={(e) => setForm({ ...form, "site.cart.free_shipping_threshold": e.target.value })}
                placeholder="1000"
              />
              <p className="text-[10px] text-stone-400 mt-1">Bu tutarın üstündeki sepetlerde kargo ücretsiz olur. 0 yazarsanız kural kapatılır.</p>
            </div>
            <div>
              <label className={labelCls}>Kargo Ücreti (TL)</label>
              <input
                type="number"
                min={0}
                step="0.5"
                inputMode="decimal"
                className={inputCls}
                value={form["site.cart.shipping_fee"]}
                onChange={(e) => setForm({ ...form, "site.cart.shipping_fee": e.target.value })}
                placeholder="59"
              />
              <p className="text-[10px] text-stone-400 mt-1">0 yazarsanız kargo her zaman ücretsiz görünür.</p>
            </div>
          </div>

          <div>
            <label className={labelCls}>Sepet Bilgi Bandı</label>
            <input
              className={inputCls}
              value={form["site.cart.notice"]}
              onChange={(e) => setForm({ ...form, "site.cart.notice": e.target.value })}
              placeholder="14 gün içinde koşulsuz iade • Aynı gün hızlı gönderim"
            />
            <p className="text-[10px] text-stone-400 mt-1">Sepet çekmecesinin üstünde görünür; boş bırakırsanız gizlenir.</p>
          </div>

          <div>
            <label className={labelCls}>Boş Sepet Mesajı</label>
            <input
              className={inputCls}
              value={form["site.cart.empty_message"]}
              onChange={(e) => setForm({ ...form, "site.cart.empty_message": e.target.value })}
              placeholder="Dikiş iplikleri, fermuarlar…"
            />
            <p className="text-[10px] text-stone-400 mt-1">Sepet boşken çekmece ve sepet sayfasında gösterilir.</p>
          </div>

          <div>
            <label className={labelCls}>Ödeme Altı Güven Mesajı</label>
            <input
              className={inputCls}
              value={form["site.cart.trust_text"]}
              onChange={(e) => setForm({ ...form, "site.cart.trust_text": e.target.value })}
              placeholder="256-Bit SSL & 3D Secure Güvenli Ödeme Altyapısı"
            />
            <p className="text-[10px] text-stone-400 mt-1">“Siparişi Tamamla” düğmesinin altında görünür; boş bırakırsanız gizlenir.</p>
          </div>

          {/* Özet kutu */}
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-[11px] text-amber-950 space-y-1">
            <p className="font-black uppercase tracking-widest text-[9px] text-amber-800">Önizleme</p>
            <p>Sepet durumu: <strong>{cartOn ? "Etkin" : "Kapalı (Sepetim düğmesi gizli)"}</strong></p>
            <p>Kargo: <strong>{fee === 0 ? "Her zaman ücretsiz" : threshold > 0 ? `${threshold.toLocaleString("tr-TR")} TL üzeri ücretsiz, altı ${fee.toFixed(2)} TL` : `${fee.toFixed(2)} TL`}</strong></p>
            <p>Bilgi bandı: <strong>{form["site.cart.notice"].trim() ? "görünür" : "gizli"}</strong> • Boş sepet mesajı: <strong>{form["site.cart.empty_message"].trim() ? "özel" : "varsayılan"}</strong></p>
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[10px] text-stone-400">Kaydedince vitrine anında yansır (açık sayfa varsa ayar değişikliği yenilendiğinde görülür).</p>
            <button onClick={() => save(CART_KEYS)} disabled={saving} className="flex items-center gap-1.5 px-5 py-2.5 bg-amber-800 hover:bg-amber-900 disabled:opacity-60 text-white text-xs font-bold rounded-xl transition">
              <Save className="w-4 h-4" />
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </div>
        </div>

        <CheckoutSettingsCard />
        </>
      )}
    </PanelShell>
  );
}

function CheckoutSettingsCard() {
  const { form, setForm, loading, saving, feedback, save } = useSiteSettings();
  if (loading) {
    return <p className="text-xs text-stone-400">Yükleniyor…</p>;
  }
  const cardOn = form["site.checkout.payment_card_enabled"] !== "false";
  const eftOn = form["site.checkout.payment_eft_enabled"] !== "false";
  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4 max-w-3xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
            <LockKeyhole className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-black text-stone-900 uppercase tracking-wide">Güvenli Sipariş Tamamlama & Ödeme Ayarı</h3>
            <p className="text-[10px] text-stone-500">/odeme sayfasının başlığı, ödeme yöntemleri ve güvenli ödeme mesajları.</p>
          </div>
        </div>
      </div>

      <Feedback feedback={feedback} />

      <div>
        <label className={labelCls}>Sayfa Başlığı</label>
        <input
          className={inputCls}
          value={form["site.checkout.title"]}
          onChange={(e) => setForm({ ...form, "site.checkout.title": e.target.value })}
          placeholder="Güvenli Sipariş Tamamlama & Ödeme"
        />
        <p className="text-[10px] text-stone-400 mt-1">/odeme sayfasının en üstünde görünür.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="flex items-start gap-3 p-3 rounded-xl border border-stone-200 bg-stone-50 cursor-pointer select-none">
          <input
            type="checkbox"
            className="w-4 h-4 accent-amber-800 mt-0.5"
            checked={cardOn}
            onChange={(e) => setForm({ ...form, "site.checkout.payment_card_enabled": e.target.checked ? "true" : "false" })}
          />
          <span>
            <span className="text-xs font-bold text-stone-800 flex items-center gap-1.5"><CreditCard className="w-4 h-4 text-amber-800" /> Kredi / Banka Kartı</span>
            <span className="text-[10px] text-stone-500">Ödeme sayfasında kart seçeneği görünür.</span>
          </span>
        </label>
        <label className="flex items-start gap-3 p-3 rounded-xl border border-stone-200 bg-stone-50 cursor-pointer select-none">
          <input
            type="checkbox"
            className="w-4 h-4 accent-amber-800 mt-0.5"
            checked={eftOn}
            onChange={(e) => setForm({ ...form, "site.checkout.payment_eft_enabled": e.target.checked ? "true" : "false" })}
          />
          <span>
            <span className="text-xs font-bold text-stone-800 flex items-center gap-1.5"><Landmark className="w-4 h-4 text-amber-800" /> Havale / EFT</span>
            <span className="text-[10px] text-stone-500">Ödeme sayfasında havale seçeneği görünür.</span>
          </span>
        </label>
      </div>
      {!cardOn && !eftOn && (
        <p className="text-[11px] font-semibold text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
          Uyarı: İki ödeme yöntemi de kapalı — müşteriler siparişi tamamlayamaz.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Kart Notu</label>
          <input className={inputCls} value={form["site.checkout.card_note"]} onChange={(e) => setForm({ ...form, "site.checkout.card_note": e.target.value })} placeholder="3D Secure ile anında onay" />
        </div>
        <div>
          <label className={labelCls}>Havale / EFT Notu</label>
          <input className={inputCls} value={form["site.checkout.eft_note"]} onChange={(e) => setForm({ ...form, "site.checkout.eft_note": e.target.value })} placeholder="Havale / EFT ile transfer" />
        </div>
      </div>

      <div className="pt-1 border-t border-stone-100">
        <p className="text-[10px] font-black uppercase tracking-widest text-stone-500 mb-1 mt-1 flex items-center gap-1.5"><Landmark className="w-3.5 h-3.5" /> Havale / EFT Hesap Bilgileri</p>
        <p className="text-[10px] text-stone-400 mb-2">Müşteri ödeme sayfasında Havale/EFT seçtiğinde gösterilir. IBAN&apos;ı boş bırakırsanız hesap kutusu gizlenir.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Banka & Şube</label>
            <input className={inputCls} value={form["site.checkout.eft_bank"]} onChange={(e) => setForm({ ...form, "site.checkout.eft_bank": e.target.value })} placeholder="Türkiye İş Bankası — Kadıköy Şubesi" />
          </div>
          <div>
            <label className={labelCls}>Hesap Adı</label>
            <input className={inputCls} value={form["site.checkout.eft_account_name"]} onChange={(e) => setForm({ ...form, "site.checkout.eft_account_name": e.target.value })} placeholder="İpek Tuhafiye San. ve Tic. Ltd. Şti." />
          </div>
        </div>
        <div className="mt-3">
          <label className={labelCls}>IBAN</label>
          <input className={`${inputCls} font-mono`} value={form["site.checkout.eft_iban"]} onChange={(e) => setForm({ ...form, "site.checkout.eft_iban": e.target.value })} placeholder="TR12 0006 4000 0011 2345 6789 01" />
        </div>
      </div>

      <div>
        <label className={labelCls}>Ödeme Altı Güven Mesajı</label>
        <input className={inputCls} value={form["site.checkout.trust_text"]} onChange={(e) => setForm({ ...form, "site.checkout.trust_text": e.target.value })} placeholder="256-Bit SSL & 3D Secure Güvenli Ödeme" />
        <p className="text-[10px] text-stone-400 mt-1">“Siparişi Onayla & Öde” düğmesinin altında görünür; boş bırakırsanız gizlenir.</p>
      </div>

      <div>
        <label className={labelCls}>Sipariş Başarı Mesajı</label>
        <input className={inputCls} value={form["site.checkout.success_note"]} onChange={(e) => setForm({ ...form, "site.checkout.success_note": e.target.value })} placeholder="Siparişiniz alındı…" />
        <p className="text-[10px] text-stone-400 mt-1">Sipariş tamamlandığında “Siparişiniz Başarıyla Alındı!” ekranında görünür.</p>
      </div>

      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-[11px] text-emerald-950 space-y-1">
        <p className="font-black uppercase tracking-widest text-[9px] text-emerald-800">Önizleme</p>
        <p>Açık ödeme yöntemleri: <strong>{[cardOn ? "Kredi/Banka Kartı" : null, eftOn ? "Havale/EFT" : null].filter(Boolean).join(" + ") || "YOK — sipariş alınamaz"}</strong></p>
        <p>Havale kutusu: <strong>{form["site.checkout.eft_iban"].trim() ? "görünür" : "gizli (IBAN boş)"}</strong> • Güven mesajı: <strong>{form["site.checkout.trust_text"].trim() ? "görünür" : "gizli"}</strong></p>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[10px] text-stone-400">Kaydedince /odeme sayfasına yansır.</p>
        <button onClick={() => save(CHECKOUT_KEYS)} disabled={saving} className="flex items-center gap-1.5 px-5 py-2.5 bg-amber-800 hover:bg-amber-900 disabled:opacity-60 text-white text-xs font-bold rounded-xl transition">
          <Save className="w-4 h-4" />
          {saving ? "Kaydediliyor…" : "Kaydet"}
        </button>
      </div>
    </div>
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
  backups: BackupEntry[];
  restoreState?: {
    source: string;
    restoredAt: string;
    preRestoreBackup: string;
    actor: string;
    tables: number;
    rowsCopied: number;
  } | null;
}

type BackupEntry = {
  name: string;
  sizeBytes: number;
  createdAt: string;
  integrity: "ok" | "fail" | "unknown";
  tables: number;
  orders: number | null;
  products: number | null;
  customers: number | null;
  users: number | null;
  error?: string;
};

function DatabaseSettingsPanel() {
  const [info, setInfo] = useState<DbInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; isError: boolean } | null>(null);
  const [tableFilter, setTableFilter] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmUpload, setConfirmUpload] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isInIframe = () => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  };

  const downloadBackup = async (name: string) => {
    if (downloading) return;
    setDownloading(name);
    setFeedback(null);
    try {
      if (isInIframe()) {
        // Çerçeve içinde indirmeler engellenebilir — biletle yeni sekmede aç
        const res = await authFetch("/api/database", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "download-ticket", name }),
        });
        const d = await res.json().catch(() => null);
        if (!d?.success) {
          setFeedback({ text: d?.error?.message || "İndirme başlatılamadı.", isError: true });
          return;
        }
        const win = window.open(d.data.url, "_blank", "noopener");
        if (!win) {
          setFeedback({ text: "Tarayıcı yeni sekmeyi engelledi. Önizlemeyi sağ üstteki düzenekle yeni sekmede açıp yedeği tekrar indirmeyi deneyin.", isError: true });
        }
        return;
      }
      const result = await downloadAuthenticated(`/api/database?download=${encodeURIComponent(name)}`, name);
      if (!result.ok) setFeedback({ text: result.message, isError: true });
    } catch {
      setFeedback({ text: "Sunucuya ulaşılamadı.", isError: true });
    } finally {
      setDownloading(null);
    }
  };

  const load = () => {
    authFetch("/api/database", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.success) setInfo(d.data);
        else setFeedback({ text: d?.error?.message || "Bilgi alınamadı.", isError: true });
      })
      .catch(() => setFeedback({ text: "Sunucuya ulaşılamadı.", isError: true }))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
  }, []);

  const backup = async () => {
    setBackingUp(true);
    setFeedback(null);
    try {
      const res = await authFetch("/api/database", {
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

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setUploadFile(f);
    setConfirmUpload(false);
    setFeedback(null);
  };

  const restoreFromUpload = async () => {
    if (!uploadFile || uploading) return;
    setUploading(true);
    setFeedback(null);
    try {
      const form = new FormData();
      form.append("file", uploadFile, uploadFile.name);
      const res = await authFetch("/api/database", { method: "POST", body: form });
      const d = await res.json();
      if (!d?.success) {
        setFeedback({ text: d?.error?.message || "Yükleme başarısız.", isError: true });
        return;
      }
      setConfirmUpload(false);
      setFeedback({ text: `${d.data?.restored ?? uploadFile.name} geri yüklendi (${(d.data?.rowsCopied ?? 0).toLocaleString("tr-TR")} satır, ${d.data?.tables ?? 0} tablo). Güvenlik yedeği: ${d.data?.preRestoreBackup}. Sayfa yenileniyor…`, isError: false });
      window.setTimeout(() => window.location.reload(), 1800);
    } catch {
      setFeedback({ text: "Sunucuya ulaşılamadı.", isError: true });
    } finally {
      setUploading(false);
    }
  };

  const restore = async (name: string) => {
    setRestoring(true);
    setFeedback(null);
    try {
      const res = await authFetch("/api/database", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore", name }),
      });
      const d = await res.json();
      if (!d.success) {
        setFeedback({ text: d?.error?.message || "Geri yükleme başarısız.", isError: true });
        return;
      }
      setConfirmRestore(null);
      setFeedback({ text: `${name} geri yüklendi (${(d.data?.rowsCopied ?? 0).toLocaleString("tr-TR")} satır, ${d.data?.tables ?? 0} tablo). Güvenlik yedeği: ${d.data?.preRestoreBackup}. Sayfa yenileniyor…`, isError: false });
      // Geri yüklenen DB'nin durumunu herkese göster: tam yenileme
      window.setTimeout(() => window.location.reload(), 1800);
    } catch {
      setFeedback({ text: "Sunucuya ulaşılamadı.", isError: true });
    } finally {
      setRestoring(false);
    }
  };

  const filteredTables = useMemo(
    () => (info?.tables || []).filter((t) => t.name.toLowerCase().includes(tableFilter.trim().toLowerCase())),
    [info, tableFilter]
  );

  const integrityOk = info?.integrity === "ok";

  return (
    <PanelShell icon={Database} title="Veritabanı Ayarı" desc="SQLite veritabanının durumu, tablo istatistikleri, tutarlı yedek alma ve yedekten geri yükleme.">
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

          {info.restoreState && (
            <div className="flex items-start gap-2 p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-900">
              <History className="w-4 h-4 mt-0.5 shrink-0" />
              <span><b>Son geri yükleme:</b> {info.restoreState.source} — {new Date(info.restoreState.restoredAt).toLocaleString("tr-TR")} ({info.restoreState.rowsCopied?.toLocaleString("tr-TR")} satır). Önceki durum <span className="font-mono">{info.restoreState.preRestoreBackup}</span> olarak saklandı.</span>
            </div>
          )}

          <div className="flex items-start gap-2 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span><b>Geri yükleme</b>, seçilen yedeği sistemde çalışır hale getirir: mevcut TÜM veriler yedekteki hal ile DEĞİŞTİRİLİR. İşlem öncesi mevcut durum otomatik olarak <span className="font-mono">tuhafiye-pre-restore-*.db</span> olarak yedeklenir; istediğinizde o yedeğe tekrar dönebilirsiniz. Yalnız Süper Admin yapabilir. Yedek yüklendikten sonra mevcut oturum düşebilir — yeniden giriş yapmanız gerekebilir.</span>
          </div>

          {/* Bilgisayardan yedek yükle */}
          <div className="rounded-2xl border border-dashed border-violet-300 bg-violet-50/60 p-3 space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-start gap-2 min-w-0 flex-1">
                <Upload className="w-5 h-5 mt-0.5 shrink-0 text-violet-700" />
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-wide text-violet-900">Bilgisayardan Yedek Yükle</p>
                  <p className="text-[10px] text-violet-900/80 leading-snug">Kendi bilgisayarınızdaki <span className="font-mono">.db</span> yedek dosyasını doğrudan sisteme yükleyin. Dosya önce SQLite bütünlük ve zorunlu tablo (users/products/orders/order_items) kontrolünden geçirilir; mevcut veritabanı değişmeden önce otomatik güvenlik yedeği alınır.</p>
                  {uploadFile && (
                    <p className="text-[10px] font-mono text-violet-950 mt-1 truncate" title={uploadFile.name}>{uploadFile.name} <span className="text-violet-700">• {formatBytes(uploadFile.size)}</span></p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 pl-7 sm:pl-0">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".db,.sqlite,.sqlite3,application/octet-stream"
                  className="hidden"
                  onChange={onPickFile}
                />
                <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="px-3 py-2 bg-white border border-violet-300 hover:border-violet-500 text-violet-900 text-xs font-bold rounded-xl transition disabled:opacity-60">
                  {uploadFile ? "Dosyayı Değiştir" : "Dosya Seç"}
                </button>
                <button
                  onClick={() => setConfirmUpload(true)}
                  disabled={!uploadFile || uploading}
                  title={uploadFile ? "Seçilen yedeği yükleyip geri yükle" : "Önce bir .db dosyası seçin"}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-700 hover:bg-violet-800 disabled:opacity-40 disabled:hover:bg-violet-700 text-white text-xs font-bold transition"
                >
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {uploading ? "Yükleniyor…" : "Yedeği Yükle"}
                </button>
              </div>
            </div>
            {confirmUpload && uploadFile && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-[10px] text-rose-900 space-y-1.5">
                <p><b>Emin misiniz?</b> “{uploadFile.name}” içeriği canlı veritabanını tamamen değiştirecek. Önce otomatik güvenlik yedeği alınır.</p>
                <div className="flex items-center gap-1.5">
                  <button onClick={restoreFromUpload} disabled={uploading} className="px-2.5 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-800 disabled:opacity-60 text-white font-bold transition">{uploading ? "Geri yükleniyor…" : "Evet, yükle ve geri yükle"}</button>
                  <button onClick={() => setConfirmUpload(false)} disabled={uploading} className="px-2.5 py-1.5 rounded-lg bg-white border border-rose-200 text-rose-800 font-bold hover:bg-rose-100 transition">Vazgeç</button>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Yedekler */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-stone-200 overflow-hidden h-max">
              <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
                <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wide">Yedekler ({info.backups.length})</h3>
              </div>
              <div className="max-h-96 overflow-y-auto divide-y divide-stone-100">
                {info.backups.length === 0 && <p className="px-4 py-6 text-xs text-stone-400 text-center">Henüz yedek yok. “Yedek Oluştur” ile ilk kopyayı alın.</p>}
                {info.backups.map((b) => (
                  <div key={b.name} className="px-4 py-2.5 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono font-bold text-stone-800 truncate" title={b.name}>{b.name}</p>
                        <p className="text-[10px] text-stone-400">{new Date(b.createdAt).toLocaleString("tr-TR")} • {formatBytes(b.sizeBytes)}{b.tables >= 0 ? ` • ${b.tables} tablo` : ""}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => downloadBackup(b.name)}
                          disabled={downloading === b.name}
                          className="p-2 rounded-lg bg-stone-100 hover:bg-amber-100 disabled:opacity-60 text-stone-700 hover:text-amber-900 transition"
                          title="Yedeği indir"
                        >
                          {downloading === b.name ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => setConfirmRestore(confirmRestore === b.name ? null : b.name)}
                          disabled={restoring || b.integrity !== "ok"}
                          title={b.integrity === "ok" ? "Bu yedeği sisteme geri yükle" : "Yedek bütünlük kontrolünden geçemedi — yüklenemez"}
                          className="flex items-center gap-1 px-2.5 py-2 rounded-lg bg-violet-700 hover:bg-violet-800 disabled:opacity-40 disabled:hover:bg-violet-700 text-white text-[10px] font-bold transition"
                        >
                          {restoring && confirmRestore === b.name ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                          Yükle
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-stone-500 flex-wrap">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-bold ${b.integrity === "ok" ? "bg-emerald-100 text-emerald-800" : b.integrity === "fail" ? "bg-rose-100 text-rose-800" : "bg-stone-100 text-stone-500"}`}>
                        {b.integrity === "ok" ? "Sağlam" : b.integrity === "fail" ? "Bozuk" : "Özet yok"}
                      </span>
                      {b.orders != null && <span>Sipariş: <b>{b.orders.toLocaleString("tr-TR")}</b></span>}
                      {b.products != null && <span>Ürün: <b>{b.products.toLocaleString("tr-TR")}</b></span>}
                      {b.customers != null && <span>Müşteri: <b>{b.customers.toLocaleString("tr-TR")}</b></span>}
                      {b.users != null && <span>Kullanıcı: <b>{b.users.toLocaleString("tr-TR")}</b></span>}
                    </div>
                    {confirmRestore === b.name && (
                      <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-[10px] text-rose-900 space-y-1.5">
                        <p><b>Emin misiniz?</b> Mevcut veritabanı bu yedekteki haline dönecek. Önce otomatik güvenlik yedeği alınır.</p>
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => restore(b.name)} disabled={restoring} className="px-2.5 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-800 text-white font-bold transition">{restoring ? "Geri yükleniyor…" : "Evet, geri yükle"}</button>
                          <button onClick={() => setConfirmRestore(null)} disabled={restoring} className="px-2.5 py-1.5 rounded-lg bg-white border border-rose-200 text-rose-800 font-bold hover:bg-rose-100 transition">Vazgeç</button>
                        </div>
                      </div>
                    )}
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
  if (tab === "cart") return <CartSettingsPanel />;
  return <DatabaseSettingsPanel />;
}
