import React from "react";
import { ShieldCheck, FileText, RotateCcw, Cookie } from "lucide-react";

export default function KvkkPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12 space-y-10">
      <div>
        <h1 className="text-3xl font-black text-stone-900 tracking-tight">
          Yasal Bildirimler & Sözleşmeler
        </h1>
        <p className="text-stone-500 text-sm mt-1">
          6698 sayılı KVKK, 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve e-Fatura mevzuatına uygun şartlarımız.
        </p>
      </div>

      {/* KVKK */}
      <section className="bg-white p-6 md:p-8 rounded-3xl border border-stone-200 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-amber-800" />
          <h2 className="text-lg font-black text-stone-900">1. KVKK Aydınlatma Metni</h2>
        </div>
        <p className="text-xs text-stone-600 leading-relaxed">
          İpek Tuhafiye San. ve Tic. Ltd. Şti. olarak veri sorumlusu sıfatıyla, 6698 sayılı Kişisel Verilerin Korunması Kanunu (&ldquo;KVKK&rdquo;) kapsamında; ad, soyad, telefon numarası, teslimat adresi ve e-posta verileriniz yalnızca siparişlerin yerine getirilmesi, GİB e-Fatura / e-Arşiv faturalarının tanzimi, kargo teslimatı ve müşteri ilişkileri yönetimi amacıyla işlenmektedir. Verileriniz üçüncü şahıslara ticari amaçla devredilmez.
        </p>
      </section>

      {/* Mesafeli Satış */}
      <section id="mesafeli" className="bg-white p-6 md:p-8 rounded-3xl border border-stone-200 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-amber-800" />
          <h2 className="text-lg font-black text-stone-900">2. Mesafeli Satış Sözleşmesi</h2>
        </div>
        <p className="text-xs text-stone-600 leading-relaxed">
          İşbu sözleşme, alıcının satıcıya ait internet sitesinden elektronik ortamda siparişini verdiği ürünlerin satışı ve teslimi ile ilgili olarak tarafların hak ve yükümlülüklerini düzenler. Satıcı, sipariş edilen ürünleri eksiksiz, belirtilen niteliklere uygun ve yasal 30 günlük süreyi aşmamak kaydıyla kargo vasıtasıyla teslim etmeyi taahhüt eder.
        </p>
      </section>

      {/* İptal ve İade */}
      <section id="iade" className="bg-white p-6 md:p-8 rounded-3xl border border-stone-200 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <RotateCcw className="w-5 h-5 text-amber-800" />
          <h2 className="text-lg font-black text-stone-900">3. İptal, İade ve Değişim Koşulları</h2>
        </div>
        <p className="text-xs text-stone-600 leading-relaxed">
          Alıcı, hiçbir hukuki ve cezai sorumluluk üstlenmeksizin ve hiçbir gerekçe göstermeksizin malı teslim aldığı tarihten itibaren 14 (on dört) gün içerisinde cayma hakkını kullanabilir. İade edilecek ürünlerin açılmamış, orijinal ambalajında ve fatura nüshası ile birlikte gönderilmesi gerekmektedir. Metrajlı kesilen kumaş, tela ve kurdeleler tüketici isteğine göre özel hazırlandığından cayma hakkı kapsamı dışındadır.
        </p>
      </section>

      {/* Çerezler */}
      <section id="cerez" className="bg-white p-6 md:p-8 rounded-3xl border border-stone-200 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <Cookie className="w-5 h-5 text-amber-800" />
          <h2 className="text-lg font-black text-stone-900">4. Çerez (Cookie) Politikası</h2>
        </div>
        <p className="text-xs text-stone-600 leading-relaxed">
          Sitemizde kullanıcı deneyimini iyileştirmek, sepet içeriklerini oturum boyunca muhafaza etmek ve güvenli oturum yönetimi sağlamak amacıyla zorunlu ve işlevsel çerezler kullanılmaktadır.
        </p>
      </section>
    </div>
  );
}
