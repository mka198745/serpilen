"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Scissors, Phone, Mail, MapPin, ShieldCheck, RefreshCw, CreditCard, Clock } from "lucide-react";
import { DEFAULT_SITE_SETTINGS } from "@/lib/site-settings-shared";

/* Marka ikonları (lucide bu sürümde marka ikonları içermiyor; alt bilgi için satır-ikon olarak çizilir) */
const iconProps = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className: "w-4 h-4" };
const InstagramIcon = () => (
  <svg {...iconProps}><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none" /></svg>
);
const FacebookIcon = () => (
  <svg {...iconProps}><path fill="currentColor" stroke="none" d="M13.4 21v-6.4h2.2l.3-2.6h-2.5V9.3c0-.75.2-1.26 1.3-1.26h1.3V5.75c-.3-.04-1.3-.13-2.5-.13-2.6 0-4.3 1.57-4.3 4.4v2.45H9.6v2.6h2.1V21h1.7z" /></svg>
);
const YoutubeIcon = () => (
  <svg {...iconProps}><path d="M22 12s0-3.4-.4-5a3 3 0 0 0-2.3-2.1C17.6 4.5 12 4.5 12 4.5s-5.6 0-7.3.4A3 3 0 0 0 2.4 7C2 8.6 2 12 2 12s0 3.4.4 5a3 3 0 0 0 2.3 2.1c1.7.4 7.3.4 7.3.4s5.6 0 7.3-.4a3 3 0 0 0 2.3-2.1c.4-1.6.4-5 .4-5z" /><path d="M10.2 9.7l4.8 2.3-4.8 2.3z" fill="currentColor" stroke="none" /></svg>
);
const TikTokIcon = () => (
  <svg {...iconProps}><path d="M14.5 4v10.4a4.2 4.2 0 1 1-4.2-4.2" /><path d="M14.5 5.4a6.4 6.4 0 0 0 4.9 4.6" /></svg>
);
const XIcon = () => (
  <svg {...iconProps}><path d="M4.5 4.5l15 15M19.5 4.5l-15 15" /></svg>
);
const LinkedInIcon = () => (
  <svg {...iconProps}><path d="M6.5 10.2V18.5" /><circle cx="6.5" cy="6" r="1.2" fill="currentColor" stroke="none" /><path d="M11.4 18.5v-5.3a3.1 3.1 0 0 1 6.2 0v5.3" /></svg>
);

export function Footer() {
  const [siteSettings, setSiteSettings] = useState<Record<string, string>>(DEFAULT_SITE_SETTINGS);
  useEffect(() => {
    const load = () =>
      fetch("/api/site-settings", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          if (d?.success && d.data) setSiteSettings({ ...DEFAULT_SITE_SETTINGS, ...d.data });
        })
        .catch(() => {});
    load();
    window.addEventListener("site-settings-updated", load);
    return () => window.removeEventListener("site-settings-updated", load);
  }, []);
  const brandName = siteSettings["site.brand_name"] || DEFAULT_SITE_SETTINGS["site.brand_name"];
  const brandParts = brandName.trim().split(/\s+/);
  const brandLast = brandParts.length > 1 ? brandParts[brandParts.length - 1] : "";
  const brandHead = brandParts.length > 1 ? brandParts.slice(0, -1).join(" ") : brandName;
  const normUrl = (v?: string) => {
    const t = (v || "").trim();
    if (!t) return null;
    return /^https?:\/\//i.test(t) ? t : `https://${t}`;
  };
  const socialLinks = [
    { key: "instagram", label: "Instagram", href: normUrl(siteSettings["site.social.instagram"]), Icon: InstagramIcon },
    { key: "facebook", label: "Facebook", href: normUrl(siteSettings["site.social.facebook"]), Icon: FacebookIcon },
    { key: "youtube", label: "YouTube", href: normUrl(siteSettings["site.social.youtube"]), Icon: YoutubeIcon },
    { key: "tiktok", label: "TikTok", href: normUrl(siteSettings["site.social.tiktok"]), Icon: TikTokIcon },
    { key: "x", label: "X (Twitter)", href: normUrl(siteSettings["site.social.x"]), Icon: XIcon },
    { key: "linkedin", label: "LinkedIn", href: normUrl(siteSettings["site.social.linkedin"]), Icon: LinkedInIcon },
  ].filter((x) => x.href) as { key: string; label: string; href: string; Icon: () => React.JSX.Element }[];
  return (
    <footer className="bg-stone-900 text-stone-300 border-t border-stone-800">
      {/* Trust badges banner */}
      <div className="border-b border-stone-800 py-8 px-4">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-900/40 text-amber-400 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white">%100 Orijinal Ürün</h4>
              <p className="text-xs text-stone-400">YKK, Gütermann, Prym resmi ürünleri</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-900/40 text-amber-400 flex items-center justify-center shrink-0">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white">Güvenli Ödeme & e-Fatura</h4>
              <p className="text-xs text-stone-400">256-Bit SSL, 3D Secure, anında fatura</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-900/40 text-amber-400 flex items-center justify-center shrink-0">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white">14 Gün Kolay İade</h4>
              <p className="text-xs text-stone-400">Koşulsuz iade ve mağazada değişim</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-900/40 text-amber-400 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white">Aynı Gün Hızlı Kargo</h4>
              <p className="text-xs text-stone-400">15:00'e kadar verilen siparişlerde</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Footer Columns */}
      <div className="max-w-7xl mx-auto px-4 py-12 grid grid-cols-1 md:grid-cols-5 gap-8">
        {/* Brand & Address */}
        <div className="md:col-span-2 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-700 flex items-center justify-center text-white">
              <Scissors className="w-4 h-4 -rotate-45" />
            </div>
            <span className="text-lg font-black text-white tracking-tight">
              {brandHead} <span className="text-amber-500">{brandLast}</span>
            </span>
          </div>
          <p className="text-xs text-stone-400 leading-relaxed max-w-sm">
            {siteSettings["site.footer.description"]}
          </p>

          <div className="space-y-2 text-xs text-stone-400 pt-2">
            <p className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-amber-500 shrink-0" />
              <span><strong>Mağaza:</strong> {siteSettings["site.footer.store_address"]}</span>
            </p>
            <p className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-amber-500 shrink-0" />
              <span><strong>Merkez Depo:</strong> {siteSettings["site.footer.warehouse_address"]}</span>
            </p>
            <p className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-amber-500 shrink-0" />
              <span>{siteSettings["site.footer.phone_line"]}</span>
            </p>
            <p className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-amber-500 shrink-0" />
              <span>{siteSettings["site.footer.email"]}</span>
            </p>
          </div>

          {socialLinks.length > 0 && (
            <div className="flex items-center gap-2 pt-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-stone-500 mr-1">Bizi Takip Edin</span>
              {socialLinks.map(({ key, label, href, Icon }) => (
                <a
                  key={key}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  title={label}
                  className="w-8 h-8 rounded-full border border-stone-700 flex items-center justify-center text-stone-400 hover:text-amber-400 hover:border-amber-500 transition"
                >
                  <Icon />
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Categories */}
        <div className="space-y-3">
          <h4 className="text-sm font-bold text-white uppercase tracking-wider">Kategoriler</h4>
          <ul className="space-y-2 text-xs text-stone-400">
            <li><Link href="/urunler?category=dikis-nakis" className="hover:text-amber-400 transition">Dikiş & Nakış İplikleri</Link></li>
            <li><Link href="/urunler?category=fermuar" className="hover:text-amber-400 transition">Metal & Gizli Fermuarlar</Link></li>
            <li><Link href="/urunler?category=dugme" className="hover:text-amber-400 transition">Doğal Ahşap & Sedef Düğmeler</Link></li>
            <li><Link href="/urunler?category=kurdele-serit" className="hover:text-amber-400 transition">Saten & Grogren Kurdeleler</Link></li>
            <li><Link href="/urunler?category=orgu-hobi" className="hover:text-amber-400 transition">Alize & Nako Örgü İpleri</Link></li>
            <li><Link href="/urunler?category=dikis-malzemeleri" className="hover:text-amber-400 transition">Prym Terzi Makasları & İğneler</Link></li>
            <li><Link href="/urunler?category=tekstil-yardimci" className="hover:text-amber-400 transition">Bez Tela & Lastik Çeşitleri</Link></li>
          </ul>
        </div>

        {/* Kurumsal & Hizmetler */}
        <div className="space-y-3">
          <h4 className="text-sm font-bold text-white uppercase tracking-wider">Kurumsal & Portal</h4>
          <ul className="space-y-2 text-xs text-stone-400">
            <li><Link href="/hakkimizda" className="hover:text-amber-400 transition">Hakkımızda</Link></li>
            <li><Link href="/magazalarimiz" className="hover:text-amber-400 transition">Mağazalarımız & Kasa</Link></li>
            <li><Link href="/toptan-b2b" className="hover:text-amber-400 transition">B2B Toptan Satış Başvurusu</Link></li>
            <li><Link href="/pos" className="hover:text-amber-400 transition">Mağaza Web POS Terminali</Link></li>
            <li><Link href="/admin" className="hover:text-amber-400 transition">Yönetim & WMS Paneli</Link></li>
            <li><Link href="/blog" className="hover:text-amber-400 transition">Dikiş & Malzeme Rehberi</Link></li>
            <li><Link href="/mimari" className="hover:text-amber-400 transition">Sistem Mimarisi (FAZ 0)</Link></li>
          </ul>
        </div>

        {/* Yasal & Sözleşmeler */}
        <div className="space-y-3">
          <h4 className="text-sm font-bold text-white uppercase tracking-wider">Müşteri İlişkileri</h4>
          <ul className="space-y-2 text-xs text-stone-400">
            <li><Link href="/kvkk" className="hover:text-amber-400 transition">KVKK Aydınlatma Metni</Link></li>
            <li><Link href="/kvkk#mesafeli" className="hover:text-amber-400 transition">Mesafeli Satış Sözleşmesi</Link></li>
            <li><Link href="/kvkk#iade" className="hover:text-amber-400 transition">İptal, İade ve Değişim</Link></li>
            <li><Link href="/kvkk#cerez" className="hover:text-amber-400 transition">Çerez Politikası</Link></li>
            <li><Link href="/iletisim" className="hover:text-amber-400 transition">İletişim & Harita</Link></li>
          </ul>
        </div>
      </div>

      {/* Copyright */}
      <div className="border-t border-stone-800 py-5 px-4 text-xs text-stone-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>{siteSettings["site.footer.copyright"]}</p>
          {socialLinks.length > 0 && (
            <div className="flex items-center gap-2">
              {socialLinks.map(({ key, label, href, Icon }) => (
                <a
                  key={key}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  title={label}
                  className="w-8 h-8 rounded-full border border-stone-700 flex items-center justify-center text-stone-500 hover:text-amber-400 hover:border-amber-500 transition"
                >
                  <Icon />
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}
