CREATE TABLE `account_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`customer_id` integer NOT NULL,
	`type` text NOT NULL,
	`amount` numeric NOT NULL,
	`balance_after` numeric NOT NULL,
	`reference_type` text,
	`reference_id` text,
	`description` text,
	`due_date` integer,
	`paid_at` integer,
	`created_by` text DEFAULT 'Sistem',
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `admin_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`jti` text NOT NULL,
	`ip` text,
	`user_agent` text,
	`mfa_verified` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_sessions_jti_unique` ON `admin_sessions` (`jti`);--> statement-breakpoint
CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`description` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text DEFAULT '1',
	`user_name` text DEFAULT 'Yönetici',
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text,
	`details` text,
	`ip_address` text DEFAULT '127.0.0.1',
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `auth_nonces` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token_hash` text NOT NULL,
	`user_id` integer NOT NULL,
	`scope` text NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`used_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_nonces_token_hash_unique` ON `auth_nonces` (`token_hash`);--> statement-breakpoint
CREATE TABLE `blog_posts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`excerpt` text,
	`content` text NOT NULL,
	`category` text DEFAULT 'Dikiş Rehberi',
	`author` text DEFAULT 'Tuhafiye Uzmanı',
	`image_url` text,
	`is_published` integer DEFAULT true NOT NULL,
	`published_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `blog_posts_slug_unique` ON `blog_posts` (`slug`);--> statement-breakpoint
CREATE TABLE `brands` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`logo_url` text,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `brands_slug_unique` ON `brands` (`slug`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`parent_id` integer,
	`icon` text,
	`description` text,
	`display_order` integer DEFAULT 0,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_slug_unique` ON `categories` (`slug`);--> statement-breakpoint
CREATE TABLE `coupons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`discount_type` text DEFAULT 'PERCENT' NOT NULL,
	`discount_value` numeric NOT NULL,
	`min_cart_amount` numeric DEFAULT '0.00',
	`max_discount` numeric,
	`usage_limit` integer DEFAULT 100,
	`used_count` integer DEFAULT 0,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `coupons_code_unique` ON `coupons` (`code`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text DEFAULT 'B2C' NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`phone` text NOT NULL,
	`company_name` text,
	`tax_office` text,
	`tax_number` text,
	`credit_limit` numeric DEFAULT '0.00',
	`balance` numeric DEFAULT '0.00',
	`loyalty_points` integer DEFAULT 0 NOT NULL,
	`segment` text DEFAULT 'YENİ',
	`discount_rate` numeric DEFAULT '0.00',
	`price_list_id` integer,
	`payment_term_days` integer DEFAULT 30 NOT NULL,
	`min_order_amount` numeric DEFAULT '0.00',
	`is_blocked` integer DEFAULT false NOT NULL,
	`approval_status` text DEFAULT 'APPROVED',
	`address` text,
	`city` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `erp_sync_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text DEFAULT 'LOGO_GO3' NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`priority` integer DEFAULT 10 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`last_error` text,
	`next_run_at` integer DEFAULT (unixepoch()) NOT NULL,
	`completed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `erp_sync_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text DEFAULT 'LOGO_GO3' NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`status` text NOT NULL,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`error_message` text,
	`payload` text,
	`response` text,
	`batch_id` text,
	`synced_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `goods_receipt_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`receipt_id` integer NOT NULL,
	`purchase_order_item_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`variant_id` integer,
	`qty` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `goods_receipts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`receipt_number` text NOT NULL,
	`purchase_order_id` integer NOT NULL,
	`warehouse_id` integer NOT NULL,
	`received_by` text DEFAULT 'Mal Kabul Görevlisi',
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `goods_receipts_receipt_number_unique` ON `goods_receipts` (`receipt_number`);--> statement-breakpoint
CREATE TABLE `inventory` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`warehouse_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`variant_id` integer,
	`physical_qty` integer DEFAULT 0 NOT NULL,
	`reserved_qty` integer DEFAULT 0 NOT NULL,
	`min_stock` integer DEFAULT 10 NOT NULL,
	`max_stock` integer DEFAULT 500 NOT NULL,
	`reorder_point` integer DEFAULT 15 NOT NULL,
	`location_code` text DEFAULT 'GENEL-A-01',
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `inventory_ledger` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`transaction_type` text NOT NULL,
	`warehouse_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`variant_id` integer,
	`quantity` integer NOT NULL,
	`unit_cost` numeric DEFAULT '0.00',
	`reference_type` text,
	`reference_id` text,
	`note` text,
	`created_by` text DEFAULT 'Sistem',
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `inventory_reservations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`warehouse_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`variant_id` integer,
	`qty` integer NOT NULL,
	`reference_type` text DEFAULT 'CART' NOT NULL,
	`reference_id` text,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`expires_at` integer NOT NULL,
	`created_by` text DEFAULT 'Sistem',
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `loyalty_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`customer_id` integer NOT NULL,
	`points` integer NOT NULL,
	`type` text NOT NULL,
	`description` text,
	`order_id` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`variant_id` integer,
	`product_name` text NOT NULL,
	`variant_name` text,
	`sku` text NOT NULL,
	`barcode` text,
	`unit_price` numeric NOT NULL,
	`quantity` integer NOT NULL,
	`tax_rate` integer DEFAULT 20 NOT NULL,
	`total_price` numeric NOT NULL
);
--> statement-breakpoint
CREATE TABLE `order_return_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`return_id` integer NOT NULL,
	`order_item_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`variant_id` integer,
	`product_name` text NOT NULL,
	`quantity` integer NOT NULL,
	`refund_amount` numeric DEFAULT '0.00' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `order_returns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`return_number` text NOT NULL,
	`order_id` integer NOT NULL,
	`order_number` text NOT NULL,
	`reason` text,
	`status` text DEFAULT 'REQUESTED' NOT NULL,
	`refund_amount` numeric DEFAULT '0.00',
	`restock` integer DEFAULT true NOT NULL,
	`warehouse_id` integer DEFAULT 3,
	`created_by` text DEFAULT 'Müşteri Hizmetleri',
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`resolved_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `order_returns_return_number_unique` ON `order_returns` (`return_number`);--> statement-breakpoint
CREATE TABLE `order_status_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`note` text,
	`changed_by` text DEFAULT 'Sistem',
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_number` text NOT NULL,
	`order_type` text DEFAULT 'ONLINE_B2C' NOT NULL,
	`customer_id` integer,
	`customer_name` text NOT NULL,
	`customer_email` text,
	`customer_phone` text,
	`status` text DEFAULT 'PAID' NOT NULL,
	`payment_status` text DEFAULT 'PAID' NOT NULL,
	`payment_method` text DEFAULT 'CREDIT_CARD' NOT NULL,
	`subtotal` numeric DEFAULT '0.00' NOT NULL,
	`discount_total` numeric DEFAULT '0.00' NOT NULL,
	`tax_total` numeric DEFAULT '0.00' NOT NULL,
	`shipping_total` numeric DEFAULT '0.00' NOT NULL,
	`grand_total` numeric DEFAULT '0.00' NOT NULL,
	`shipping_address` text,
	`tracking_number` text,
	`carrier` text DEFAULT 'Yurtiçi Kargo',
	`pos_shift_id` integer,
	`erp_invoice_number` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_order_number_unique` ON `orders` (`order_number`);--> statement-breakpoint
CREATE TABLE `pos_cash_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shift_id` integer NOT NULL,
	`warehouse_id` integer NOT NULL,
	`type` text NOT NULL,
	`amount` numeric NOT NULL,
	`reason` text NOT NULL,
	`cashier_name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pos_shifts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shift_number` text,
	`terminal_code` text DEFAULT 'KASA-01' NOT NULL,
	`cashier_name` text NOT NULL,
	`warehouse_id` integer NOT NULL,
	`opening_amount` numeric DEFAULT '500.00' NOT NULL,
	`closing_amount` numeric,
	`expected_amount` numeric,
	`total_sales_cash` numeric DEFAULT '0.00',
	`total_sales_card` numeric DEFAULT '0.00',
	`total_sales_split` numeric DEFAULT '0.00',
	`total_returns_cash` numeric DEFAULT '0.00',
	`total_returns_card` numeric DEFAULT '0.00',
	`cash_in_total` numeric DEFAULT '0.00',
	`cash_out_total` numeric DEFAULT '0.00',
	`status` text DEFAULT 'OPEN' NOT NULL,
	`z_report_number` text,
	`opened_at` integer DEFAULT (unixepoch()) NOT NULL,
	`closed_at` integer,
	`notes` text
);
--> statement-breakpoint
CREATE TABLE `price_list_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`price_list_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`variant_id` integer,
	`unit_price` numeric NOT NULL,
	`min_qty` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `price_lists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`default_discount_rate` numeric DEFAULT '0.00' NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `price_lists_code_unique` ON `price_lists` (`code`);--> statement-breakpoint
CREATE TABLE `price_tiers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`price_list_id` integer NOT NULL,
	`product_id` integer,
	`min_qty` integer NOT NULL,
	`max_qty` integer,
	`discount_rate` numeric,
	`unit_price` numeric
);
--> statement-breakpoint
CREATE TABLE `product_images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`variant_id` integer,
	`url` text NOT NULL,
	`alt_text` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `product_questions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`asker_name` text NOT NULL,
	`question` text NOT NULL,
	`answer` text,
	`answered_by` text,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `product_reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`customer_name` text NOT NULL,
	`customer_email` text,
	`rating` integer NOT NULL,
	`title` text,
	`comment` text NOT NULL,
	`verified_purchase` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `product_variants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`sku` text NOT NULL,
	`barcode` text,
	`color_name` text,
	`color_hex` text,
	`size` text,
	`length` text,
	`buy_price` numeric,
	`retail_price` numeric NOT NULL,
	`b2b_price` numeric,
	`image_url` text,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_variants_sku_unique` ON `product_variants` (`sku`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_variants_barcode_unique` ON `product_variants` (`barcode`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`sku` text NOT NULL,
	`barcode` text,
	`brand_id` integer,
	`category_id` integer NOT NULL,
	`short_description` text,
	`description` text,
	`unit` text DEFAULT 'Adet' NOT NULL,
	`buy_price` numeric DEFAULT '0.00' NOT NULL,
	`retail_price` numeric DEFAULT '0.00' NOT NULL,
	`b2b_price` numeric DEFAULT '0.00' NOT NULL,
	`min_order_qty` integer DEFAULT 1 NOT NULL,
	`package_qty` integer DEFAULT 1 NOT NULL,
	`vat_rate` integer DEFAULT 20 NOT NULL,
	`has_variants` integer DEFAULT false NOT NULL,
	`image_url` text,
	`video_url` text,
	`campaign_price` numeric,
	`tags` text,
	`collection` text,
	`seo_title` text,
	`seo_description` text,
	`is_featured` integer DEFAULT false,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_slug_unique` ON `products` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `products_sku_unique` ON `products` (`sku`);--> statement-breakpoint
CREATE UNIQUE INDEX `products_barcode_unique` ON `products` (`barcode`);--> statement-breakpoint
CREATE TABLE `promotions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`rule_type` text DEFAULT 'PERCENT_CATEGORY' NOT NULL,
	`category_id` integer,
	`brand_id` integer,
	`product_id` integer,
	`percent_value` numeric,
	`fixed_value` numeric,
	`threshold_amount` numeric,
	`buy_qty` integer,
	`pay_qty` integer,
	`min_qty` integer DEFAULT 1,
	`max_discount` numeric,
	`free_shipping` integer DEFAULT false NOT NULL,
	`priority` integer DEFAULT 50 NOT NULL,
	`start_date` integer DEFAULT (unixepoch()) NOT NULL,
	`end_date` integer,
	`is_active` integer DEFAULT true NOT NULL,
	`used_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `purchase_order_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`purchase_order_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`variant_id` integer,
	`quantity` integer NOT NULL,
	`unit_cost` numeric NOT NULL,
	`received_qty` integer DEFAULT 0 NOT NULL,
	`total_cost` numeric NOT NULL
);
--> statement-breakpoint
CREATE TABLE `purchase_orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`po_number` text NOT NULL,
	`supplier_id` integer NOT NULL,
	`warehouse_id` integer NOT NULL,
	`status` text DEFAULT 'ORDERED' NOT NULL,
	`total_amount` numeric DEFAULT '0.00' NOT NULL,
	`notes` text,
	`expected_date` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_orders_po_number_unique` ON `purchase_orders` (`po_number`);--> statement-breakpoint
CREATE TABLE `purchase_request_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`variant_id` integer,
	`qty` integer NOT NULL,
	`estimated_cost` numeric DEFAULT '0.00'
);
--> statement-breakpoint
CREATE TABLE `purchase_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_number` text NOT NULL,
	`warehouse_id` integer NOT NULL,
	`status` text DEFAULT 'REQUESTED' NOT NULL,
	`priority` text DEFAULT 'NORMAL' NOT NULL,
	`notes` text,
	`created_by` text DEFAULT 'Depo Sorumlusu',
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`approved_at` integer,
	`approved_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_requests_request_number_unique` ON `purchase_requests` (`request_number`);--> statement-breakpoint
CREATE TABLE `stock_count_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`variant_id` integer,
	`expected_qty` integer NOT NULL,
	`counted_qty` integer NOT NULL,
	`location_code` text,
	`scanned_barcode` text,
	`counted_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stock_count_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`count_number` text NOT NULL,
	`warehouse_id` integer NOT NULL,
	`status` text DEFAULT 'IN_PROGRESS' NOT NULL,
	`started_by` text DEFAULT 'Sayım Ekibi',
	`started_at` integer DEFAULT (unixepoch()) NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stock_count_sessions_count_number_unique` ON `stock_count_sessions` (`count_number`);--> statement-breakpoint
CREATE TABLE `stock_transfer_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`transfer_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`variant_id` integer,
	`qty` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stock_transfers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`transfer_number` text NOT NULL,
	`from_warehouse_id` integer NOT NULL,
	`to_warehouse_id` integer NOT NULL,
	`status` text DEFAULT 'REQUESTED' NOT NULL,
	`note` text,
	`created_by` text DEFAULT 'Depo Sorumlusu',
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`approved_at` integer,
	`shipped_at` integer,
	`received_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stock_transfers_transfer_number_unique` ON `stock_transfers` (`transfer_number`);--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`contact_person` text,
	`phone` text,
	`email` text,
	`tax_office` text,
	`tax_number` text,
	`lead_time_days` integer DEFAULT 3 NOT NULL,
	`payment_terms` text DEFAULT '30 Gün Vade',
	`rating` numeric DEFAULT '4.8',
	`address` text,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'CASHIER' NOT NULL,
	`phone` text,
	`avatar_url` text,
	`customer_id` integer,
	`totp_secret` text,
	`totp_secret_previous` text,
	`mfa_enabled` integer DEFAULT false NOT NULL,
	`recovery_code_hash` text,
	`failed_login_count` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`last_login_at` integer,
	`password_changed_at` integer,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `warehouse_locations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`warehouse_id` integer NOT NULL,
	`location_code` text NOT NULL,
	`zone` text,
	`aisle` text,
	`rack` text,
	`shelf` text,
	`bin` text
);
--> statement-breakpoint
CREATE TABLE `warehouses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`type` text DEFAULT 'STORE' NOT NULL,
	`address` text,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `warehouses_code_unique` ON `warehouses` (`code`);