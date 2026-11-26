CREATE TABLE IF NOT EXISTS `brand_categories` (
  `brand_id` integer NOT NULL REFERENCES `brands`(`id`) ON DELETE CASCADE,
  `category_id` integer NOT NULL REFERENCES `categories`(`id`) ON DELETE CASCADE,
  PRIMARY KEY (`brand_id`, `category_id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `brand_categories_category_idx` ON `brand_categories` (`category_id`, `brand_id`);
--> statement-breakpoint
-- Existing product assignments are facts, not a guessed default; products and brands remain unchanged.
INSERT OR IGNORE INTO `brand_categories` (`brand_id`, `category_id`)
SELECT DISTINCT p.`brand_id`,p.`category_id` FROM `products` p
INNER JOIN `brands` b ON b.`id`=p.`brand_id`
INNER JOIN `categories` c ON c.`id`=p.`category_id`
WHERE p.`brand_id` IS NOT NULL;
