-- "El İşi Ürünler" kategorisi eklenir (el emeği örgü, nakış, punch, makrome ürünleri).
-- Idempotent: kategori zaten varsa eklenmez.
-- NOT: Taze/boş veritabanında (hiç kategori yokken) no-op olur; boş kurulumu
-- `npm run db:seed` 9 kategoriyle birlikte kurar.
INSERT INTO `categories` (`name`, `slug`, `icon`, `description`, `display_order`, `is_active`)
SELECT 'El İşi Ürünler', 'el-isi-urunler', 'Heart', 'El emeği örgü, nakış, punch ve makrome ürünleri', 9, 1
WHERE EXISTS (SELECT 1 FROM `categories`)
  AND NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'el-isi-urunler');
