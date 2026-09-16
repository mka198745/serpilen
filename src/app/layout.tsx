import type { Metadata } from "next";
import "./globals.css";
import { CartProvider } from "@/context/CartContext";
import { AuthProvider } from "@/context/AuthContext";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { CartDrawer } from "@/components/layout/CartDrawer";
import { AuthModal } from "@/components/layout/AuthModal";

export const metadata: Metadata = {
  title: "İpek Tuhafiye | Dikiş, Nakış, Fermuar, Düğme & Örgü Malzemeleri",
  description:
    "Türkiye'nin lider tuhafiye ve tekstil hobi malzemeleri platformu. Gütermann, Coats, YKK ve Prym ürünlerinde toptan ve perakende satış, anında e-Fatura ve hızlı kargo.",
  keywords: [
    "tuhafiye",
    "dikiş ipliği",
    "ykk fermuar",
    "gütermann",
    "düğme",
    "saten kurdele",
    "alize örgü ipi",
    "terzi makası",
    "bez tela",
    "b2b toptan tuhafiye",
    "pos kasa",
  ],
  authors: [{ name: "İpek Tuhafiye San. ve Tic. Ltd. Şti." }],
  openGraph: {
    title: "İpek Tuhafiye | Perakende, Toptan & POS Dijital Platformu",
    description: "Fiziki mağaza, online e-ticaret, B2B toptan satış ve çoklu depo stok entegrasyonu.",
    locale: "tr_TR",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" className="scroll-smooth">
      <head>
        {/* Schema.org Organization JSON-LD */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "LocalBusiness",
              name: "İpek Tuhafiye",
              image: "https://images.unsplash.com/photo-1596704017254-9b121068fb31?w=800",
              telephone: "08508882026",
              email: "siparis@ipektuhafiye.com",
              address: {
                "@type": "PostalAddress",
                streetAddress: "Moda Caddesi No: 18",
                addressLocality: "Kadıköy",
                addressRegion: "İstanbul",
                postalCode: "34710",
                addressCountry: "TR",
              },
              currenciesAccepted: "TRY",
              paymentAccepted: "Cash, Credit Card, Bank Transfer",
              priceRange: "₺₺",
            }),
          }}
        />
      </head>
      <body className="min-h-screen bg-stone-50 text-stone-900 flex flex-col antialiased selection:bg-amber-800 selection:text-white">
        <CartProvider>
          <AuthProvider>
            <Header />
            <main className="flex-1">{children}</main>
            <CartDrawer />
            <AuthModal />
            <Footer />
          </AuthProvider>
        </CartProvider>
      </body>
    </html>
  );
}
