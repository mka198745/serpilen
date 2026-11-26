CREATE INDEX IF NOT EXISTS `order_returns_order_created_idx` ON `order_returns` (`order_id`, `created_at`, `id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `loyalty_transactions_customer_created_idx` ON `loyalty_transactions` (`customer_id`, `created_at`, `id`);
