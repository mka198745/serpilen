# İpek Tuhafiye — Perakende Ticaret Yönetim Platformu

Fiziki tuhafiye mağazası, çoklu depo ağı, B2C e-ticaret vitrini, B2B toptan portalı,
web tabanlı POS terminali, stok hareket defteri, satın alma, kampanya/sadakat motoru,
ERP (e-Fatura) adaptörü ve AI asistanını **tek bir MySQL veritabanı** üzerinde birleştiren
Next.js + Drizzle ORM tabanlı perakende işletim sistemi.

## Teknolojiler

- **Next.js 16** (App Router) + React 19 + Tailwind CSS 4
- **MySQL 8** + **Drizzle ORM** (`mysql2` sürücüsü)
- TypeScript (strict)

## Hızlı Başlangıç (Docker — önerilen)

Tek komutla MySQL + uygulamayı ayağa kaldırır (migration ve örnek veriler otomatik yüklenir):

```bash
docker compose up -d --build
docker compose logs -f app
```

- Uygulama: http://localhost:3000
- Sağlık kontrolü: http://localhost:3000/api/health
- MySQL: `localhost:3306` (db: `tuhafiye`, kullanıcı/şifre: `tuhafiye`/`tuhafiye`
  — `.env` veya ortam değişkenleriyle değiştirilebilir:
  `MYSQL_ROOT_PASSWORD`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`,
  `MYSQL_PORT`, `APP_PORT`)

Durdurmak: `docker compose down` (veriler `mysql-data` volume'ünde saklanır).

## Manuel Kurulum (mevcut bir MySQL'e karşı)

1. MySQL 8 kurun ve **utf8mb4** bir veritabanı + kullanıcı oluşturun:

   ```sql
   CREATE DATABASE tuhafiye CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'tuhafiye'@'%' IDENTIFIED BY 'güçlü-şifre';
   GRANT ALL PRIVILEGES ON tuhafiye.* TO 'tuhafiye'@'%';
   FLUSH PRIVILEGES;
   ```

2. Ortam dosyasını hazırlayın:

   ```bash
   cp .env.example .env
   # .env içindeki DATABASE_URL'i düzenleyin:
   # DATABASE_URL="mysql://tuhafiye:güçlü-şifre@127.0.0.1:3306/tuhafiye"
   ```

3. Bağımlılıklar + şema + örnek veri:

   ```bash
   npm install
   npm run db:push      # şemayı doğrudan uygular (alternatif: npm run db:generate + migrate)
   npm run db:seed      # örnek ürün/depo/sipariş verileri (idempotent)
   ```

4. Çalıştırın:

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
| `npm run db:push`  | Drizzle şemasını MySQL'e uygular                |
| `npm run db:generate` | `drizzle/` altına SQL migration üretir       |
| `npm run db:seed`  | Örnek verileri yükler (tekrar çalıştırılabilir) |
| `npm run db:studio`| Drizzle Studio (veritabanı arayüzü)             |

Ayrıca `GET /api/health` ilk çağrıda eksikse seed'i otomatik tamamlar.

## Proje Yapısı

- `src/app/` — Sayfalar (vitrin, sepet, ödeme, POS, B2B, admin, blog) ve `/api/*` uçları
- `src/db/schema.ts` — 46 tabloluk MySQL şeması (Drizzle)
- `src/db/seed.ts` — Örnek veri yükleyici
- `src/lib/*-engine.ts` — Stok, fiyat, kampanya, ERP ve AI motorları
- `drizzle/` — Üretilmiş SQL migration'ları
- `docker-compose.yml` + `Dockerfile` — Tek komutla kurulum

## Notlar

- Tüm para alanları `DECIMAL`, tarihler UTC'dir; Türkçe karakterler için
  veritabanı **utf8mb4** olmalıdır.
- Detaylı sistem mimarisi için `ARCHITECTURE.md` dosyasına bakın.
