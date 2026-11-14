DROP TABLE `price_list_items`;--> statement-breakpoint
DROP TABLE `price_lists`;--> statement-breakpoint
DROP TABLE `price_tiers`;--> statement-breakpoint
ALTER TABLE `customers` DROP COLUMN `price_list_id`;--> statement-breakpoint
ALTER TABLE `customers` DROP COLUMN `payment_term_days`;--> statement-breakpoint
ALTER TABLE `customers` DROP COLUMN `min_order_amount`;--> statement-breakpoint
ALTER TABLE `product_variants` DROP COLUMN `b2b_price`;--> statement-breakpoint
ALTER TABLE `products` DROP COLUMN `b2b_price`;