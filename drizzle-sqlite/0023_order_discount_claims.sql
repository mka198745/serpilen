CREATE TABLE IF NOT EXISTS `order_discount_claims` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `order_id` integer NOT NULL,
  `kind` text NOT NULL,
  `target_id` integer NOT NULL,
  `status` text NOT NULL DEFAULT 'ACTIVE'
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `order_discount_claims_unique_idx` ON `order_discount_claims` (`order_id`, `kind`, `target_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `order_discount_claims_order_idx` ON `order_discount_claims` (`order_id`, `status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `orders_stock_queue_idx` ON `orders` (`status`, `id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `inventory_reservations_payment_hold_idx` ON `inventory_reservations` (`reference_type`, `status`, `expires_at`, `reference_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `pos_return_context` (
  `return_id` integer PRIMARY KEY NOT NULL,
  `shift_id` integer NOT NULL,
  `refund_method` text NOT NULL
);
