import React from "react";
import Link from "next/link";
import {
  BookOpen,
  Database,
  Layers,
  Cpu,
  ShieldCheck,
  CheckCircle2,
  Workflow,
  Server,
  Boxes,
  FileText,
  Sparkles,
  ArrowRight,
} from "lucide-react";

export default function ArchitecturePage() {
  const blueprints = [
    { num: 1, title: "Projenin Kapsamı", desc: "Fiziki mağaza, web vitrini, toptan B2B ve WMS'i tek bir merkezi ürün/stok kaydı üzerinde birleştiren kurumsal işletim sistemi." },
    { num: 2, title: "Fonksiyonel Gereksinimler", desc: "SKU/barkod bazlı tekil ürün, renk/boyut varyantları, hareket bazlı stok defteri (Stock Ledger), çoklu depo ve web POS." },
    { num: 3, title: "Fonksiyonel Olmayan Gereksinimler", desc: "MySQL (InnoDB) transaction bütünlüğü, < 200ms TTFB yanıt süresi, OWASP Top 10 ve PCI-DSS ilkeleri." },
    { num: 4, title: "Kullanıcı Rolleri & RBAC", desc: "SUPER_ADMIN, STORE_MANAGER, WAREHOUSE_KEEPER, CASHIER, B2B_CUSTOMER, B2C_CUSTOMER granular yetkilendirmesi." },
    { num: 5, title: "Context Diagramı", desc: "Platform; B2C vitrin, Web POS, Admin Paneli, B2B portal ve ERP Ön Muhasebe servislerinin merkezinde konumlanır." },
    { num: 6, title: "High-Level Mimari", desc: "Next.js App Router (Client) -> Service Katmanı (Inventory, POS, ERP) -> MySQL 8 & Drizzle ORM." },
    { num: 7, title: "Frontend Architecture", desc: "Server-side rendering, Reusable UI tokens, optimistic cart updates, mobile-first duyarlı tasarım." },
    { num: 8, title: "Backend Architecture", desc: "RESTful JSON API'ler, Transactional Idempotency, Drizzle Kit ORM migration altyapısı." },
    { num: 9, title: "Modül Sınırları", desc: "Core, Catalog, Inventory, Orders, POS, B2B, Purchasing, Loyalty, ERP Adapter, AI Assistant bağımsız domainleri." },
    { num: 10, title: "Database Mimarisi", desc: "Tüm para birimleri numeric(10,2) decimal, UTC timestamp, foreign key ve index optimizasyonu." },
    { num: 11, title: "Ana Entity Listesi", desc: "users, customers, categories, brands, products, product_variants, warehouses, inventory, inventory_ledger, orders, pos_shifts." },
    { num: 12, title: "ERD Tasarımı", desc: "Katalog -> Varyant -> Çoklu Depo Stok -> Stok Defteri -> Sipariş Kalemleri ilişkisel ağacı." },
    { num: 13, title: "Inventory Transaction", desc: "Kullanılabilir Stok = Fiziksel Stok - Rezerve Stok. Her satış, iade ve sevk inventory_ledger'a işlenir." },
    { num: 14, title: "Order Lifecycle", desc: "PENDING -> PAID -> PREPARING -> SHIPPED -> DELIVERED (veya CANCELLED/REFUNDED)." },
    { num: 15, title: "Payment Lifecycle", desc: "Adapter Pattern ile 3D Secure Kredi Kartı, Nakit Kasa, Havale ve B2B Açık Hesap Cari Bakiye." },
    { num: 16, title: "Purchase Lifecycle", desc: "Satın alma siparişi (PO) oluşturulur; mal kabul onaylandığında stoklar otomatik artırılır." },
    { num: 17, title: "POS Terminal Mimarisi", desc: "Kasiyer vardiya açılışı, barkod tabancası okuma, askıya alma, karma ödeme ve termal e-Arşiv fiş baskısı." },
    { num: 18, title: "B2B Toptan Mimarisi", desc: "Vergi dairesi/VKN doğrulaması, kademeli hacim iskontosu (10+, 50+, 100+ koli), cari limit takibi." },
    { num: 19, title: "ERP & e-Fatura Entegrasyonu", desc: "GİB e-Fatura/e-Arşiv UUID üretimi, Mikro & Logo uyumlu cari ve fatura adaptörü (erp_sync_logs)." },
    { num: 20, title: "Arama Mimarisi", desc: "Ürün adı, SKU, barkod ve varyant renklerinde tam metin arama ve Türkçe karakter desteği." },
    { num: 21, title: "Bildirim Mimarisi", desc: "Sipariş onayı, kargo takip numarası ve kritik stok uyarıları için tekil olay motoru." },
    { num: 22, title: "Güvenlik Mimarisi", desc: "SQL Injection koruması (parametrik sorgular), XSS filtreleri, güvenli HTTP başlıkları." },
    { num: 23, title: "RBAC Yetki Modeli", desc: "Kasiyer sadece POS ekranına erişebilirken, depo şefi transfer ve sayım yetkisine sahiptir." },
    { num: 24, title: "Audit Log Mimarisi", desc: "Fiyat ve stok güncellemelerinde kullanıcı kimliği, IP ve zaman damgasıyla değiştirilemez kayıt." },
    { num: 25, title: "Cache Stratejisi", desc: "Next.js ISR ve HTTP Cache-Control ile hızlı katalog sunumu." },
    { num: 26, title: "Background Worker", desc: "Asenkron fatura senkronizasyonu ve otomatik kritik stok reorder kontrolleri." },
    { num: 27, title: "Docker Konfigürasyonu", desc: "Multi-stage Dockerfile ve izole MySQL 8 veritabanı konteyner mimarisi." },
    { num: 28, title: "Dev / Staging / Prod Ortamları", desc: "Environment variable ile yönetilen izole konfigürasyon." },
    { num: 29, title: "CI/CD Pipeline", desc: "Type check -> Lint -> Build -> Database Push -> Healthcheck aşamaları." },
    { num: 30, title: "Disaster Recovery & Backup", desc: "Günlük otomatik snapshot ve S3 uyumlu yedekleme planı." },
    { num: 31, title: "Monitoring & Health Check", desc: "/api/health uç noktası ile veritabanı ve servis canlılık izlemesi." },
    { num: 32, title: "SEO Teknik Mimarisi", desc: "Product, Organization, Breadcrumb JSON-LD şemaları, dinamik OG etiketleri." },
    { num: 33, title: "AI Guardrails", desc: "AI analizleri yalnızca tavsiye üretir; kullanıcı onayı olmadan veri değişikliği yapılamaz." },
    { num: 34, title: "Klasör Yapısı", desc: "Next.js App Router, /db şeması, /lib servisleri ve /components modüler mimarisi." },
    { num: 35, title: "API Versioning", desc: "Standart JSON zarfı { success, data, error } ile öngörülebilir API yanıtları." },
    { num: 36, title: "İsimlendirme Kuralları", desc: "Veritabanında snake_case, TypeScript'te camelCase, URL rotalarında kebab-case." },
    { num: 37, title: "Kod Kalite Standartları", desc: "SOLID, DRY, Domain-Driven Design prensipleri." },
    { num: 38, title: "Test Stratejisi", desc: "TypeScript derleme doğrulaması ve kritik sipariş/stok entegrasyon testleri." },
    { num: 39, title: "Geliştirme Yol Haritası", desc: "FAZ 0'dan FAZ 12'ye kadar aşamalı ve doğrulanabilir teslimat planı." },
    { num: 40, title: "MVP vs İleri Sürüm", desc: "MVP'de tam çalışan POS, WMS, B2B ve ERP; ileri sürümde donanım mali mühür entegrasyonu." },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-10 space-y-10">
      {/* Top Banner */}
      <div className="bg-stone-900 text-white rounded-3xl p-8 md:p-12 shadow-xl border border-stone-800 space-y-4">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold border border-amber-400/30">
          <BookOpen className="w-3.5 h-3.5" />
          <span>FAZ 0 — System Architecture & Technical Blueprint</span>
        </div>
        <h1 className="text-3xl md:text-5xl font-black tracking-tight leading-tight">
          Tuhafiye Perakende & B2B Ticaret Platformu Mimarisi
        </h1>
        <p className="text-stone-300 text-sm md:text-base leading-relaxed max-w-3xl">
          Bu doküman; 40 maddelik mimari vizyonun, veri modellerinin, tekil stok motorunun, sipariş yaşam döngüsünün ve ERP entegrasyon kararlarının tam teknik haritasını sunar.
        </p>

        <div className="flex flex-wrap gap-3 pt-2">
          <Link
            href="/admin"
            className="px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl shadow-md transition"
          >
            Yönetim Masasını Aç
          </Link>
          <Link
            href="/pos"
            className="px-4 py-2.5 bg-stone-800 hover:bg-stone-700 text-white font-bold text-xs rounded-xl border border-stone-700 transition"
          >
            Web POS Terminalini İncele
          </Link>
        </div>
      </div>

      {/* ERD Diagram Visual */}
      <div className="bg-white p-6 md:p-8 rounded-3xl border border-stone-200 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-amber-800" />
          <h2 className="text-lg font-black text-stone-900">Merkezi Veritabanı İlişkileri (ERD)</h2>
        </div>
        <p className="text-xs text-stone-500">
          Bir ürün sistemde yalnızca 1 kez tanımlanır; e-ticaret vitrini, POS terminali, çoklu depo ve B2B aynı veritabanı modellerini paylaşır.
        </p>

        <div className="p-4 bg-stone-950 text-amber-300 font-mono text-xs rounded-2xl overflow-x-auto leading-relaxed border border-stone-800">
          <pre>{`
  [CATEGORIES] ──1:N──< [PRODUCTS] >──1:N── [PRODUCT_VARIANTS]
                             │                      │
                             │                      │
                        1:N  │                 1:N  │
                             ▼                      ▼
                     [INVENTORY] <──N:1── [WAREHOUSES]
                             │
                             ▼
                 [INVENTORY_LEDGER] (Immutable Değiştirilemez Defter)
                             ▲
                             │ (Hareket Referansı)
                     ┌───────┴────────┐
                     ▼                ▼
                 [ORDERS]       [PURCHASE_ORDERS]
                     │                │
            [ORDER_ITEMS]     [PO_ITEMS]
          `}</pre>
        </div>
      </div>

      {/* 40 Items Blueprint Grid */}
      <div className="space-y-4">
        <h2 className="text-xl font-black text-stone-900">40 Maddelik Mimari Blueprint Maddeleri</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {blueprints.map((item) => (
            <div
              key={item.num}
              className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs space-y-2 flex flex-col justify-between"
            >
              <div>
                <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-900 font-black text-xs flex items-center justify-center mb-2">
                  {item.num}
                </span>
                <h3 className="font-bold text-xs text-stone-900">{item.title}</h3>
                <p className="text-[11px] text-stone-500 mt-1 leading-relaxed">{item.desc}</p>
              </div>
              <div className="pt-2 border-t border-stone-100 flex items-center gap-1 text-[10px] text-emerald-700 font-bold">
                <CheckCircle2 className="w-3 h-3" />
                <span>Hazır & Uygulandı</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Critical Architecture Decisions & Readiness */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-stone-900 text-white p-6 rounded-3xl border border-stone-800 space-y-3">
          <h3 className="font-bold text-base text-amber-400">Architecture Decisions</h3>
          <ul className="space-y-2 text-xs text-stone-300">
            <li className="flex items-start gap-2">
              <span className="text-amber-400 font-bold">•</span>
              <span><strong>Tekil Stok Defteri (Stock Ledger):</strong> Stok hareket bazlı takip edilerek denetim bütünlüğü sağlandı.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-400 font-bold">•</span>
              <span><strong>Next.js + MySQL Monolith:</strong> POS ve vitrinin senkron kalması için sıfır gecikmeli ortak ORM seçildi.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-400 font-bold">•</span>
              <span><strong>ERP Adapter Pattern:</strong> Muhasebe altyapısı kolaylıkla Logo, Mikro veya GİB portala uyarlanabilir hale getirildi.</span>
            </li>
          </ul>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-xs space-y-3">
          <h3 className="font-bold text-base text-emerald-800">Development Readiness Checklist</h3>
          <ul className="space-y-2 text-xs text-stone-700">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Veritabanı tabloları MySQL üzerinde oluşturuldu.</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Tuhafiye ürünleri, varyantları ve stokları tohumlandı.</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Web POS, Çoklu Depo, B2B ve e-Ticaret sepeti entegre edildi.</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>GİB e-Fatura/e-Arşiv adaptörü ve AI asistanı devreye alındı.</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
