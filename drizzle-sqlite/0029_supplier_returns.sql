-- New purchases opt into reliable supplier-return history and freeze their promised delivery date.
CREATE TABLE IF NOT EXISTS `supplier_order_coverage` (
 `purchase_order_id` integer PRIMARY KEY NOT NULL REFERENCES `purchase_orders`(`id`) ON DELETE RESTRICT,
 `expected_date` text,
 `created_at` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `supplier_receipt_requests` (
 `request_key` text PRIMARY KEY NOT NULL,
 `payload_hash` text NOT NULL,
 `receipt_id` integer NOT NULL UNIQUE REFERENCES `goods_receipts`(`id`) ON DELETE RESTRICT,
 `received_qty` integer NOT NULL CHECK (`received_qty` > 0),
 `po_status` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `supplier_returns` (
 `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
 `request_key` text NOT NULL UNIQUE,
 `payload_hash` text NOT NULL,
 `receipt_id` integer NOT NULL REFERENCES `goods_receipts`(`id`) ON DELETE RESTRICT,
 `supplier_id` integer NOT NULL REFERENCES `suppliers`(`id`) ON DELETE RESTRICT,
 `warehouse_id` integer NOT NULL REFERENCES `warehouses`(`id`) ON DELETE RESTRICT,
 `reason` text NOT NULL,
 `created_by` integer NOT NULL REFERENCES `users`(`id`) ON DELETE RESTRICT,
 `created_at` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `supplier_return_items` (
 `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
 `supplier_return_id` integer NOT NULL REFERENCES `supplier_returns`(`id`) ON DELETE RESTRICT,
 `receipt_item_id` integer NOT NULL REFERENCES `goods_receipt_items`(`id`) ON DELETE RESTRICT,
 `product_id` integer NOT NULL REFERENCES `products`(`id`) ON DELETE RESTRICT,
 `variant_id` integer REFERENCES `product_variants`(`id`) ON DELETE RESTRICT,
 `qty` integer NOT NULL CHECK (`qty` > 0),
 UNIQUE (`supplier_return_id`, `receipt_item_id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `supplier_return_items_receipt_item_idx` ON `supplier_return_items` (`receipt_item_id`);
--> statement-breakpoint
-- A cancelled/uncertain request is fenced under the same write lock as its operation.
CREATE TABLE IF NOT EXISTS `supplier_command_fences` (
 `request_key` text PRIMARY KEY NOT NULL,
 `created_by` integer NOT NULL REFERENCES `users`(`id`) ON DELETE RESTRICT,
 `created_at` integer NOT NULL DEFAULT (unixepoch())
);
