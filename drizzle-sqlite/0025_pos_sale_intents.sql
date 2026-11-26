CREATE TABLE IF NOT EXISTS `pos_sale_intents` (
 `request_key` TEXT PRIMARY KEY NOT NULL,
 `request_hash` TEXT NOT NULL,
 `actor_id` INTEGER NOT NULL,
 `actor_name` TEXT NOT NULL,
 `shift_id` INTEGER NOT NULL,
 `status` TEXT NOT NULL DEFAULT 'PREPARED',
 `payload_json` TEXT NOT NULL,
 `quote_json` TEXT NOT NULL,
 `coupon_id` INTEGER,
 `points_transaction_id` INTEGER,
 `earn_points` INTEGER NOT NULL DEFAULT 0,
 `order_id` INTEGER,
 `created_at` INTEGER NOT NULL DEFAULT (unixepoch()),
 `resolved_at` INTEGER
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `pos_sale_intents_shift_status_idx` ON `pos_sale_intents` (`shift_id`,`status`);
