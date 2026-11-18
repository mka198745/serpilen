-- "Dikiş Malzemeleri" kategorisi sistemden kaldırılır, yerine "Çanta Aksesuarları" devreye alınır.
-- Idempotent: kategori zaten varsa eklenmez, ürünler güvenli biçimde taşınır.

-- 1) Çanta Aksesuarları kategorisi yoksa oluştur (6. sıraya)
--    NOT: Taze/boş veritabanında (hiç kategori yokken) bu migration HİÇBİR ŞEY yapmaz;
--    boş kurulumu `npm run db:seed` 8 kategoriyle birlikte kurar. Böylece seed'in
--    "zaten seed edilmiş" koruması yanlışlıkla tetiklenmez.
INSERT INTO `categories` (`name`, `slug`, `icon`, `description`, `display_order`, `is_active`)
SELECT 'Çanta Aksesuarları', 'canta-aksesuarlari', 'Handbag', 'Çanta tokası, sapı, çıtçıt, mıknatıs kapama, metal çerçeve ve çanta aksesuarları', 6, 1
WHERE EXISTS (SELECT 1 FROM `categories`)
  AND NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'canta-aksesuarlari');
--> statement-breakpoint

-- 2) Sıralamayı sabitle
UPDATE `categories` SET `display_order` = 6 WHERE `slug` = 'canta-aksesuarlari';
--> statement-breakpoint

-- 3) Kaldırılan kategoriye bağlı ürünleri "Dikiş & Nakış" altına taşı
--    (hedef kategori yoksa ürünün mevcut kategorisi korunur)
UPDATE `products`
SET `category_id` = COALESCE(
  (SELECT `id` FROM `categories` WHERE `slug` = 'dikis-nakis'),
  `category_id`
)
WHERE `category_id` IN (SELECT `id` FROM `categories` WHERE `slug` = 'dikis-malzemeleri');
--> statement-breakpoint

-- 4) Sonraki kategori sırasını sıkıştır (Tekstil 7, Hobi Kitleri 8)
UPDATE `categories` SET `display_order` = 8 WHERE `slug` = 'hobi-kitleri';
--> statement-breakpoint

-- 5) "Dikiş Malzemeleri" kategorisini sil (bağlı ürün kalmadıktan sonra)
DELETE FROM `categories` WHERE `slug` = 'dikis-malzemeleri';
