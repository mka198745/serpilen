CREATE INDEX IF NOT EXISTS `orders_customer_created_idx` ON `orders` (`customer_id`, `created_at`, `id`);
