CREATE INDEX IF NOT EXISTS `account_transactions_customer_idx` ON `account_transactions` (`customer_id`, `id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `loyalty_transactions_order_idx` ON `loyalty_transactions` (`order_id`, `customer_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `order_return_items_return_idx` ON `order_return_items` (`return_id`, `id`);
