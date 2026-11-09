# İpek Tuhafiye — Perakende Ticaret Yönetim Platformu

Fiziki tuhafiye mağazası, çoklu depo ağı, B2C e-ticaret vitrini, B2B toptan portalı,
web tabanlı POS terminali, stok hareket defteri, satın alma, kampanya/sadakat motoru,
ERP (e-Fatura) adaptörü ve AI asistanını **tek bir SQLite veritabanı** üzerinde birleştiren
Next.js + Drizzle ORM tabanlı perakende işletim sistemi.
(MySQL'e geçiş için şema ve migration'lar `schema.mysql.ts` + `drizzle/` altında hazırdır; bkz. "MySQL'e Geçiş".)

## Teknolojiler

- **Next.js 16** (App Router) + React 19 + Tailwind CSS 4
- **SQLite** (uygulama dizini içinde `data/tuhafiye.db` dosyası) + **Drizzle ORM** (`better-sqlite3` sürücüsü)
- TypeScript (strict)

## Hızlı Başlangıç (Docker — önerilen)

Tek komutla uygulamayı ayağa kaldırır (migration ve örnek veriler otomatik yüklenir;
ayrı bir veritabanı sunucusu gerekmez):

```bash
docker compose up -d --build
docker compose logs -f app
```

- Uygulama: http://localhost:3000
- Sağlık kontrolü: http://localhost:3000/api/health
- Veriler: `app-data` volume'ünde `/app/data/tuhafiye.db` (SQLite) olarak saklanır
  (`APP_PORT` ile port değiştirilebilir)

Durdurmak: `docker compose down` (veriler `app-data` volume'ünde kalır).

## Manuel Kurulum

1. Ortam dosyasını hazırlayın:

   ```bash
   cp .env.example .env
   # Varsayılan yeterlidir: DATABASE_URL="sqlite:./data/tuhafiye.db"
   ```

2. Bağımlılıklar + şema + örnek veri:

   ```bash
   npm install
   npm run db:apply     # drizzle-sqlite/*.sql migration'larını uygular
   npm run db:seed      # örnek ürün/depo/sipariş verileri (idempotent)
   ```

3. Çalıştırın:

   ```bash
   npm run dev          # geliştirme (http://localhost:3000)
   npm run build && npm start   # üretim
   ```

## Yararlı Komutlar

| Komut              | Açıklama                                        |
| ------------------ | ----------------------------------------------- |
| `npm run dev`      | Geliştirme sunucusu                             |
| `npm run build`    | Üretim derlemesi                                |
| `npm run start`    | Üretim sunucusu                                 |
| `npm run typecheck`| TypeScript kontrolü                             |
| `npm run db:apply`   | `drizzle-sqlite/` migration'larını uygular     |
| `npm run db:generate`| `drizzle-sqlite/` altına SQL migration üretir  |
| `npm run db:seed`  | Örnek verileri yükler (tekrar çalıştırılabilir) |
| `npm run db:studio`| Drizzle Studio (veritabanı arayüzü)             |

Ayrıca `GET /api/health` ilk çağrıda eksikse seed'i otomatik tamamlar.

## MySQL'e Geçiş (sonraki aşama)

Veritabanı şu an SQLite dosyasıdır (`data/tuhafiye.db`). MySQL 8'e geçiş
için hazırlıklar korunmaktadır:

- MySQL şeması: `src/db/schema.mysql.ts`
- MySQL migration'ları: `drizzle/` + `drizzle.mysql.config.ts`
- MySQL compose kurulumu: `docker-compose.mysql.yml`
- `scripts/db-apply.mjs` `DATABASE_URL` `mysql://` ise `drizzle/` klasörünü
  mysql2 ile uygular.
- `scripts/mysql-bridge.py` (eski MySQL-protokol köprüsü) yalnızca geçmiş
  önizleme kurulumları içindir; güncel akışta kullanılmaz.

Geçiş adımları: `schema.mysql.ts`'yi canlı şema yapın (importları
`schema.ts`'ye taşıyın veya dosyayı değiştirin), `src/db/index.ts`'i mysql2
sürücüsüne çevirin, `DATABASE_URL=mysql://...` ayarlayın, `npm run db:apply`
çalıştırın; para alanları `decimal` olarak kalır.

## Proje Yapısı

- `src/app/` — Sayfalar (vitrin, sepet, ödeme, POS, B2B, admin, blog) ve `/api/*` uçları
- `src/db/schema.ts` — 46 tabloluk SQLite şeması (Drizzle)
- `src/db/schema.mysql.ts` — MySQL şema karşılığı (geçiş için saklı)
- `src/db/seed.ts` — Örnek veri yükleyici
- `src/lib/*-engine.ts` — Stok, fiyat, kampanya, ERP ve AI motorları
- `drizzle-sqlite/` — Üretilmiş SQL migration'ları (aktif)
- `drizzle/` — MySQL migration'ları (geçiş için saklı)
- `docker-compose.yml` + `Dockerfile` — Tek komutla kurulum (SQLite)

## Kullanıcı Girişi & Yetkiler

> **Şu an GEÇİCİ KAPALI:** `src/lib/auth-flag.ts` içinde `AUTH_ENABLED = false`.
> Giriş butonu gizli, `/admin` `/pos` `/toptan-b2b` herkese açık. Yeniden açmak
> için `true` yapıp derleyin. Tüm giriş/oturum kodu korunmaktadır.

- Üst barda **"Kullanıcı Girişi / Üye Ol"** butonu vardır. Ziyaretçiler üye olup
  giriş yapabilir (B2C cari kartı otomatik oluşur).
- **Web POS Terminali**, **B2B Toptan Portalı** ve **Yönetim Paneli & WMS**
  bağlantıları yalnızca yetkili personel girişi yapmışsa görünür
  (`SUPER_ADMIN`, `STORE_MANAGER`, `WAREHOUSE_KEEPER`, `CASHIER`, `B2B_MANAGER`).
  Bu sayfalar sunucu tarafında da korunur (yetkisiz erişim giriş ekranına yönlenir).
- Oturumlar httpOnly çerez + DB'deki `admin_sessions` tablosuyla yönetilir (7 gün).
  Çerez localhost dışında `SameSite=None + Secure + Partitioned (CHIPS)` yazılır
  (iframe önizlemede çalışır; `Lax` iframe içinden hiç gönderilmez), localhost'ta
  sade `Lax` çerez. Gerekirse `COOKIE_SECURE=1` (zorla Secure) / `=0` (zorla sade).
- Çerezin engellendiği tarayıcılarda istemci token'ı `localStorage`'da saklayıp
  `Authorization: Bearer` / `X-Auth-Token` / istek gövdesiyle API'lere erişir;
  korumalı sayfalara (Admin/POS/B2B) ise **güvenli geçiş** ile girilir:
  `POST /api/auth/handoff` kısa ömürlü jeton üretir,
  `GET /api/auth/claim?nonce=...&next=...` çerezi yazıp hedefe yönlendirir.
- Seed personelin başlangıç şifresi yoktur; tanımlamak için:

  ```bash
  npm run db:set-password -- admin@ipektuhafiye.com YeniSifre123
  ```

  Test ortamındaki hazır hesaplar:
  `admin@ipektuhafiye.com` / `Admin123!`,
  `kasiyer@ipektuhafiye.com` / `Kasiyer123!`,
  `depo@ipektuhafiye.com` / `Depo123!`

## Notlar

- Tüm para alanları `numeric` (ondalıklı metin), tarihler UTC'dir
  (SQLite'ta `unixepoch()` saniye); Türkçe karakterler UTF-8'dir.
- Detaylı sistem mimarisi için `ARCHITECTURE.md` dosyasına bakın.
