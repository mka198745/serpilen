import React from "react";
import Link from "next/link";
import { Scissors, Phone, Mail, MapPin, ShieldCheck, RefreshCw, CreditCard, Clock } from "lucide-react";

export function Footer() {
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
              İPEK <span className="text-amber-500">TUHAFİYE</span>
            </span>
          </div>
          <p className="text-xs text-stone-400 leading-relaxed max-w-sm">
            1994 yılından bu yana kaliteli dikiş iplikleri, fermuarlar, düğmeler, kurdeleler ve örgü malzemeleriyle terzilerin, moda tasarımcılarının ve hobi tutkunlarının yanındayız.
          </p>

          <div className="space-y-2 text-xs text-stone-400 pt-2">
            <p className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-amber-500 shrink-0" />
              <span><strong>Mağaza:</strong> Moda Cad. No: 18, Kadıköy / İstanbul</span>
            </p>
            <p className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-amber-500 shrink-0" />
              <span><strong>Merkez Depo:</strong> İkitelli OSB Dokumacılar San. Sitesi No: 42, İstanbul</span>
            </p>
            <p className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-amber-500 shrink-0" />
              <span>0850 888 20 26 & 0216 333 44 55</span>
            </p>
            <p className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-amber-500 shrink-0" />
              <span>siparis@ipektuhafiye.com</span>
            </p>
          </div>
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
          <p>© 2026 İpek Tuhafiye San. ve Tic. Ltd. Şti. Tüm Hakları Saklıdır.</p>
          <p className="flex items-center gap-2">
            <span>ERP & GİB e-Fatura Entegre Altyapı</span>
            <span>•</span>
            <span className="text-stone-400">Next.js & MySQL Drizzle Powered</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
