# TUHAFİYE RETAIL COMMERCE MANAGEMENT PLATFORM
## FAZ 0 — System Architecture & Technical Blueprint

---

### 1. PROJENİN DETAYLI KAPSAMI
Bu platform; fiziki tuhafiye mağazası, çoklu depo ağı, B2C e-ticaret vitrini, B2B toptan satış portalı, web tabanlı POS terminali, barkod motoru, stok hareket defteri (stock ledger), satın alma ve tedarikçi yönetimi, kampanya & sadakat motoru, CRM 360, ERP/ön muhasebe (e-Fatura / e-Arşiv) entegrasyon adaptörü ve kural tabanlı AI asistanını **tek bir merkezi ürün ve stok veritabanı** üzerinde birleştiren kurumsal bir perakende işletim sistemidir.

### 2. FONKSİYONEL GEREKSİNİMLER
- **Tekil Ürün Tanımı**: Bir ürün ve varyantları sisteme tek sefer tanımlanır; B2C, POS, B2B, Depo ve ERP aynı kimliği (SKU / Barkod) kullanır.
- **Varyant Desteği**: Renk (hex kodlu), ebat/en (10mm, 20mm, vb.), uzunluk (100m, 500m), numara varyantları.
- **Hareket Bazlı Stok (Stock Ledger)**: Basit sayı yerine PURCHASE, SALE, RETURN, TRANSFER_IN, TRANSFER_OUT, ADJUSTMENT, COUNT_DIFF, DAMAGE işlem kayıtları.
- **Çoklu Depo (Multi-Warehouse)**: Merkez Depo, Mağaza Kasa Deposu, Online Depo, Toptan Deposu ve lokasyon/raf kodları (MRK-A-03-12).
- **Web Tabanlı POS**: Barkod okutma, nakit/kredi kartı/parçalı ödeme, askıya alma, vardiya açılış/kapanış, fiş yazdırma.
- **B2B Portal**: Cari hesap limitleri, vergi bilgileri, kademeli toptan iskonto, koli/paket minimum sipariş.
- **Satın Alma**: Tedarikçi karnesi, otomatik sipariş önerisi (Reorder Engine), mal kabul ve stok artırma.
- **ERP Entegrasyonu**: Adapter pattern ile GİB e-Fatura/e-Arşiv, cari mutabakat ve sync kuyruğu.
- **AI Asistanı**: Satış analizi, kritik stok uyarısı, sipariş tahmini (Guardrail: Kullanıcı onayı olmadan otomatik işlem yapmaz).

### 3. FONKSİYONEL OLMAYAN GEREKSİNİMLER
- **Veri Bütünlüğü & Concurrency**: Stok rezervasyonları ve sipariş oluşturmada MySQL (InnoDB) transaction & row-level locking.
- **Performans**: TTFB < 200ms, sub-second POS barkod tarama yanıtı, Core Web Vitals 95+.
- **Güvenlik**: OWASP Top 10 uyumlu, PCI-DSS ilkelerine göre kart saklamama, RBAC ve granular yetkilendirme.
- **Denetlenebilirlik (Auditability)**: Fiyat, stok ve sipariş değişikliklerinde immutable audit log kaydı.
- **Lokalizasyon**: Türkçe dil, TL para birimi, KDV oranları (%10 / %20), Türkiye adres formatı.

### 4. KULLANICI ROLLERİ & RBAC
- `SUPER_ADMIN`: Tüm modüllere, ayarlara ve loglara tam erişim.
- `STORE_MANAGER`: Mağaza, POS, fiyat ve personel yönetimi.
- `WAREHOUSE_KEEPER`: Mal kabul, stok transferi, sayım ve raf düzenleme.
- `CASHIER`: POS satışı, iade, fiş kesme, vardiya açılış/kapanış.
- `B2B_CUSTOMER`: Toptan fiyatları görme, açık hesap sipariş, cari bakiye izleme.
- `B2C_CUSTOMER`: Üye vitrin alışverişi, sipariş takibi, sadakat puanları.

### 5. SİSTEM CONTEXT DIAGRAMI
```text
                     ┌───────────────────────────────┐
                     │    Tuhafiye Retail Commerce   │
                     │          Platform             │
                     └───────────────┬───────────────┘
                                     │
      ┌──────────────┬───────────────┼───────────────┬──────────────┐
      │              │               │               │              │
 ┌────▼────┐   ┌─────▼────┐    ┌─────▼─────┐   ┌─────▼────┐   ┌─────▼────┐
 │ B2C Web │   │ Web POS  │    │ Admin WMS │   │   B2B    │   │ ERP/GİB  │
 │ Vitrini │   │ Terminal │    │  Paneli   │   │  Portal  │   │ Entegr.  │
 └─────────┘   └──────────┘    └───────────┘   └──────────┘   └──────────┘
```

### 6. HIGH-LEVEL ARCHITECTURE DIAGRAMI
```text
  [ Client Tier: Next.js App Router (React 19, Tailwind CSS, Responsive Web / PWA) ]
                                    │ HTTP / REST / Server Actions
  [ Application Service Tier: Next.js API Routes & Core Retail Business Engines ]
      ├── Inventory Engine (Physical, Reserved, Available calculation)
      ├── POS Engine (Shifts, Split Payment, Instant Deduction)
      ├── Pricing & Promotion Engine (Tier prices, coupons, loyalty)
      ├── ERP Adapter Service (e-Fatura simulation, Cari sync)
      └── AI Analyst Service (Sales & reorder predictive analytics)
                                    │
  [ Data Tier: MySQL 8 + Drizzle ORM (Relational, Foreign Keys, JSON, Indexes) ]
```

### 7. FRONTEND ARCHITECTURE
- Next.js App Router ile Server-Side Rendering (SSR) ve dinamik Client Component optimizasyonu.
- Reusable UI component kütüphanesi: Navbar, MegaMenu, ProductCard, VariantSelector, POS Keypad, CartDrawer, DataGrid, Badge, Modal, StatCard.
- State Management: React Hooks, Optimistic UI güncellemeleri, persistent cart state (LocalStorage + Backend Sync).

### 8. BACKEND ARCHITECTURE
- RESTful JSON API mimarisi (`/api/products`, `/api/orders`, `/api/pos`, `/api/inventory`, `/api/b2b`, `/api/erp`, `/api/ai`).
- Controller -> Service -> Repository katman ayrımı.
- Idempotency & Concurrency: Sipariş ve ödemelerde atomic transactions.

### 9. DOMAIN / MODÜL MİMARİSİ
- `Core / Auth`: Kullanıcı kimlik doğrulama, roller, oturum.
- `Catalog`: Ürünler, varyantlar, kategoriler, markalar.
- `Inventory`: Depolar, raf lokasyonları, stock ledger, transferler, sayım.
- `Orders & Checkout`: B2C sepet, kargo ve ödeme akışı.
- `POS`: Fiziksel mağaza kasa satışı, vardiya, nakit devir, fiş.
- `B2B`: Cari hesaplar, toptan fiyat listeleri, iskonto.
- `Purchasing`: Tedarikçiler, satın alma siparişleri, mal kabul.
- `Promotions & Loyalty`: Kampanyalar, kuponlar, sadakat puanları.
- `ERP Integration`: Fatura ve cari senkronizasyonu.
- `AI Assistant`: Satış ve stok tahmin motoru.

### 10. MYSQL DATABASE MİMARİSİ
Tüm para alanları `numeric(10,2)` veya `numeric(12,2)` olarak tutulur. Asla floating point kullanılmaz. Tarih alanları UTC timestamp'tir.

### 11. ANA ENTITY LİSTESİ
- `users`: Sistem kullanıcıları ve personeller.
- `customers`: B2C müşteriler ve B2B kurumsal cariler.
- `categories`: Hiyerarşik kategori ağacı.
- `brands`: Markalar.
- `products`: Ana ürün kartları.
- `product_variants`: SKU ve barkod bazlı varyantlar.
- `warehouses`: Depolar ve şubeler.
- `warehouse_locations`: Depo raf ve koridor adresleri.
- `inventory`: Depo bazında güncel fiziksel ve rezerve stoklar.
- `inventory_ledger`: Denetlenebilir stok hareket defteri.
- `orders`: E-ticaret, B2B ve POS siparişleri.
- `order_items`: Sipariş kalemleri.
- `pos_shifts`: Kasa vardiyaları ve kasa mutabakatı.
- `suppliers`: Tedarikçi firmalar ve vadeler.
- `purchase_orders`: Satın alma siparişleri.
- `purchase_order_items`: Satın alma kalemleri ve mal kabul.
- `coupons`: İndirim kuponları.
- `loyalty_transactions`: Sadakat puan hareketleri.
- `blog_posts`: CMS makaleleri.
- `erp_sync_logs`: ERP entegrasyon kuyruğu ve sonuçları.
- `audit_logs`: Güvenlik ve denetim kayıtları.

### 12. ERD TASARIMI
```text
  [CATEGORIES] ──1:N──< [PRODUCTS] >──1:N── [PRODUCT_VARIANTS]
                             │                      │
                             │                      │
                        1:N  │                 1:N  │
                             ▼                      ▼
                     [INVENTORY] <──N:1── [WAREHOUSES]
                             │
                             ▼
                 [INVENTORY_LEDGER] (Immutable)
                             ▲
                             │ (Hareket Referansı)
                     ┌───────┴────────┐
                     ▼                ▼
                 [ORDERS]       [PURCHASE_ORDERS]
                     │                │
            [ORDER_ITEMS]     [PO_ITEMS]
```

### 13. INVENTORY TRANSACTION MİMARİSİ
Formül:
`Kullanılabilir Stok (Available Stock) = Fiziksel Stok (Physical) - Rezerve Stok (Reserved)`
Her stok giriş/çıkışında `inventory_ledger` tablosuna hareket tipiyle yazılır:
- Satışta: `quantity: -X, transactionType: 'SALE'`
- Satın almada: `quantity: +X, transactionType: 'PURCHASE'`
- Depolar arası transferde: Kaynak depoda `TRANSFER_OUT (-X)`, hedef depoda `TRANSFER_IN (+X)`.

### 14. ORDER LIFECYCLE
`PENDING` -> `PAID` -> `PREPARING` -> `READY_FOR_SHIPMENT` -> `SHIPPED` -> `DELIVERED` (veya `CANCELLED` / `REFUNDED`).
Her aşamada stok rezervasyonu ve düşümü otomatik işletilir.

### 15. PAYMENT LIFECYCLE
Adapter pattern ile Sanal POS (3D Secure), Havale/EFT ve B2B Cari Açık Hesap desteği. Kredi kartı bilgileri asla veritabanında saklanmaz.

### 16. PURCHASE LIFECYCLE
`DRAFT` -> `APPROVED` -> `ORDERED` -> `PARTIAL_RECEIVED` -> `COMPLETED`.
Mal kabul yapıldığında `inventory` ve `inventory_ledger` otomatik güncellenir.

### 17. POS MİMARİSİ
- Kasiyer sabah kasayı devir parası ile açar (`pos_shifts`).
- Barkod okuyucu veya arama kutusu ile anında ürün sepete eklenir.
- Müşteri sadakat puanı uygulanabilir veya yeni puan kazanılır.
- Ödeme Nakit, Kredi Kartı veya Parçalı alınabilir.
- Gün sonunda fiili kasa sayılarak `expectedAmount` ile karşılaştırılır ve vardiya kapatılır.

### 18. B2B MİMARİSİ
- Vergi dairesi ve vergi numarası ile kurumsal kayıt.
- Toptan iskonto oranı ve özel B2B fiyat listeleri.
- Koli bazlı alımlarda otomatik kademeli indirim.
- Cari limit ve açık hesap bakiyesi takibi.

### 19. ERP ENTEGRASYON MİMARİSİ
- `ERPAdapter` arabirimi:
  - `syncCustomer(customer)`
  - `createInvoice(order)`
  - `syncStockLevels(sku, qty)`
- Tüm senkronizasyonlar `erp_sync_logs` tablosuna payload ve yanıt ile loglanır. Hata durumunda yeniden deneme (retry) mekanizması bulunur.

### 20. SEARCH MİMARİSİ
Ürün adı, SKU, barkod, marka, kategori, renk ve teknik açıklama alanlarında indexlenmiş hızlı arama ve Türkçe karakter desteği (İ/ı, Ş/ş, Ğ/ğ vb.).

### 21. NOTIFICATION MİMARİSİ
Sipariş alındı, kargoya verildi, düşük stok ve mal kabul bildirimleri tekil merkezi olay mimarisi ile tetiklenir.

### 22. SECURITY MİMARİSİ
- Bcrypt / Scrypt şifreleme.
- SQL Injection ve XSS koruması (Drizzle ORM parametrik sorguları ve React sanitize).
- Rate limiting ve CSRF başlıkları.

### 23. RBAC PERMISSION MODELİ
Granular yetkiler: `product:read`, `product:write`, `stock:adjust`, `pos:sell`, `pos:shift_close`, `b2b:approve`, `report:view`.

### 24. AUDIT LOG MİMARİSİ
Fiyat güncellemeleri, stok düzeltmeleri, vardiya kapatma ve kullanıcı yetkilendirme işlemleri `audit_logs` tablosunda kullanıcı kimliği ve IP ile saklanır.

### 25. CACHE STRATEJİSİ
Statik sayfalar ve kategori ağacı için Next.js ISR (Incremental Static Regeneration), sık sorgulanan ürün katalog verileri için HTTP Cache-Control başlıkları.

### 26. BACKGROUND WORKER MİMARİSİ
ERP fatura senkronizasyonu ve otomatik kritik stok reorder kontrolleri asenkron kuyruk yapısında çalışır.

### 27. DOCKER MİMARİSİ
Multi-stage Dockerfile ile Next.js üretim derlemesi ve MySQL 8 container kurulumu (docker-compose).

### 28. DEV / STAGING / PROD MİMARİSİ
Environment variables (`DATABASE_URL`, `ERP_API_KEY`, `APP_ENV`) üzerinden ayrılmış, izole veritabanı şemaları.

### 29. CI/CD STRATEJİSİ
GitHub Actions / Pipeline: TypeCheck -> Lint -> Production Build -> Database Migration -> HealthCheck.

### 30. BACKUP & DISASTER RECOVERY
Günlük MySQL `mysqldump` snapshot'ları ve S3 uyumlu nesne deposu yedekleme stratejisi.

### 31. MONITORING VE LOGGING
Sağlık kontrolü `/api/health`, endpoint süreleri ve yapılandırılmış JSON loglama.

### 32. SEO TEKNİK MİMARİSİ
- JSON-LD Structured Data (Product, Organization, BreadcrumbList, FAQPage).
- Dinamik Open Graph etiketleri, Canonical URL'ler ve XML sitemap.

### 33. AI ENTEGRASYON SINIRLARI & GUARDRAILS
AI asistanı yalnızca öneri üretir. Kullanıcı açık onay vermeden stok, fiyat veya sipariş durumunu değiştiremez.

### 34. REPOSITORY KLASÖR YAPISI
```text
src/
├── app/
│   ├── api/
│   │   ├── health/
│   │   ├── products/
│   │   ├── orders/
│   │   ├── pos/
│   │   ├── inventory/
│   │   ├── b2b/
│   │   ├── erp/
│   │   └── ai/
│   ├── urunler/
│   ├── pos/
│   ├── admin/
│   ├── toptan-b2b/
│   ├── blog/
│   ├── sepet/
│   ├── odeme/
│   └── page.tsx
├── components/
│   ├── layout/
│   ├── storefront/
│   ├── pos/
│   ├── admin/
│   └── ui/
├── db/
│   ├── schema.ts
│   ├── index.ts
│   └── seed.ts
└── lib/
    ├── erp-adapter.ts
    ├── inventory-engine.ts
    └── utils.ts
```

### 35. API VERSIONING STANDARDI
RESTful `/api/v1/` rota standardı ve tek tip yanıt zarfı `{ success: boolean, data?: T, error?: string }`.

### 36. NAMING CONVENTIONS
- Database: `snake_case` (tablolar çoğul, kolonlar tekil).
- TypeScript: `camelCase` değişkenler, `PascalCase` tipler ve bileşenler.
- URL Slugs: `kebab-case` (örn: `dikis-ipligi`).

### 37. CODING STANDARDS
SOLID prensipleri, DRY, React Server Components ve katmanlı servis mimarisi.

### 38. TEST STRATEJİSİ
TypeScript statik tip denetimi, sipariş/stok entegrasyon senaryoları ve API health check doğrulaması.

### 39. FAZLARA BÖLÜNMÜŞ GELİŞTİRME ROADMAP'İ
- **Faz 0**: Mimari Tasarım ve Veritabanı Şeması (Tamamlandı)
- **Faz 1-3**: Çekirdek Katalog, Varyantlar, Çoklu Depo ve Stok Defteri (Hazır)
- **Faz 4-7**: B2C E-Ticaret, Web POS, Siparişler ve Mal Kabul (Hazır)
- **Faz 8-11**: B2B Portal, ERP Senkronizasyonu, AI Yönetim Asistanı (Hazır)

### 40. MVP İLE İLERİ SÜRÜM AYRIMI
- MVP: Tek veritabanında çoklu depo, e-ticaret, B2B, POS, kampanya, ERP adaptör simülasyonu.
- İleri Sürüm: Çoklu dil (i18n), gerçek zamanlı WebSocket barkod el terminali eşzamanlaması, fiziksel mali mühür entegrasyonu.

---

## ARCHITECTURE DECISIONS
1. **Tekil Stok Defteri (Immutable Stock Ledger)**: Sadece ürün tablosundaki sayıyı güncellemek yerine her hareketi `inventory_ledger`'a kaydetme kararı alındı; bu sayede kayıp/kaçak, iade ve sayım farkları kurumsal düzeyde denetlenebilir hale geldi.
2. **Next.js Fullstack Monolith**: Ayrı bir mikroservis kümesi yerine tek Next.js + MySQL çatısı seçildi; bu sayede POS, B2C ve Admin aynı veritabanı modellerini tip güvenliğiyle sıfır gecikmeyle paylaşır.
3. **ERP Adapter Pattern**: Ön muhasebe sistemleri sık değişebileceğinden, sistem çekirdeği ERP sağlayıcısından soyutlandı.

---

## DEVELOPMENT READINESS CHECKLIST
- [x] Veritabanı tabloları oluşturuldu ve Drizzle Kit ile uygulandı.
- [x] Örnek veriler ve gerçekçi tuhafiye ürünleri tohumlandı.
- [x] Web POS, B2C Vitrini, B2B Portalı, WMS ve Admin Paneli modülleri hazırlandı.
- [x] Sağlık kontrolü ve API uç noktaları doğrulandı.
