CREATE TABLE `account_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customer_id` int NOT NULL,
	`type` varchar(255) NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`balance_after` decimal(12,2) NOT NULL,
	`reference_type` varchar(255),
	`reference_id` varchar(255),
	`description` text,
	`due_date` timestamp,
	`paid_at` timestamp,
	`created_by` varchar(255) DEFAULT 'Sistem',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `account_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `admin_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`jti` varchar(255) NOT NULL,
	`ip` varchar(255),
	`user_agent` varchar(500),
	`mfa_verified` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`expires_at` timestamp NOT NULL,
	`revoked_at` timestamp,
	CONSTRAINT `admin_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `admin_sessions_jti_unique` UNIQUE(`jti`)
);
--> statement-breakpoint
CREATE TABLE `app_settings` (
	`key` varchar(255) NOT NULL,
	`value` varchar(255) NOT NULL,
	`description` text,
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `app_settings_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` varchar(255) DEFAULT '1',
	`user_name` varchar(255) DEFAULT 'Yönetici',
	`action` varchar(255) NOT NULL,
	`entity` varchar(255) NOT NULL,
	`entity_id` varchar(255),
	`details` text,
	`ip_address` varchar(255) DEFAULT '127.0.0.1',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `auth_nonces` (
	`id` int AUTO_INCREMENT NOT NULL,
	`token_hash` varchar(255) NOT NULL,
	`user_id` int NOT NULL,
	`scope` varchar(255) NOT NULL,
	`attempt_count` int NOT NULL DEFAULT 0,
	`used_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`expires_at` timestamp NOT NULL,
	CONSTRAINT `auth_nonces_id` PRIMARY KEY(`id`),
	CONSTRAINT `auth_nonces_token_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `blog_posts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255) NOT NULL,
	`slug` varchar(255) NOT NULL,
	`excerpt` text,
	`content` text NOT NULL,
	`category` varchar(255) DEFAULT 'Dikiş Rehberi',
	`author` varchar(255) DEFAULT 'Tuhafiye Uzmanı',
	`image_url` varchar(500),
	`is_published` boolean NOT NULL DEFAULT true,
	`published_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `blog_posts_id` PRIMARY KEY(`id`),
	CONSTRAINT `blog_posts_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `brands` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`slug` varchar(255) NOT NULL,
	`logo_url` varchar(500),
	`is_active` boolean NOT NULL DEFAULT true,
	CONSTRAINT `brands_id` PRIMARY KEY(`id`),
	CONSTRAINT `brands_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`slug` varchar(255) NOT NULL,
	`parent_id` int,
	`icon` varchar(255),
	`description` text,
	`display_order` int DEFAULT 0,
	`is_active` boolean NOT NULL DEFAULT true,
	CONSTRAINT `categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `categories_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `coupons` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(255) NOT NULL,
	`discount_type` varchar(255) NOT NULL DEFAULT 'PERCENT',
	`discount_value` decimal(10,2) NOT NULL,
	`min_cart_amount` decimal(10,2) DEFAULT '0.00',
	`max_discount` decimal(10,2),
	`usage_limit` int DEFAULT 100,
	`used_count` int DEFAULT 0,
	`is_active` boolean NOT NULL DEFAULT true,
	CONSTRAINT `coupons_id` PRIMARY KEY(`id`),
	CONSTRAINT `coupons_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` varchar(255) NOT NULL DEFAULT 'B2C',
	`name` varchar(255) NOT NULL,
	`email` varchar(255),
	`phone` varchar(255) NOT NULL,
	`company_name` varchar(255),
	`tax_office` varchar(255),
	`tax_number` varchar(255),
	`credit_limit` decimal(12,2) DEFAULT '0.00',
	`balance` decimal(12,2) DEFAULT '0.00',
	`loyalty_points` int NOT NULL DEFAULT 0,
	`segment` varchar(255) DEFAULT 'YENİ',
	`discount_rate` decimal(5,2) DEFAULT '0.00',
	`price_list_id` int,
	`payment_term_days` int NOT NULL DEFAULT 30,
	`min_order_amount` decimal(10,2) DEFAULT '0.00',
	`is_blocked` boolean NOT NULL DEFAULT false,
	`approval_status` varchar(255) DEFAULT 'APPROVED',
	`address` text,
	`city` varchar(255),
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `erp_sync_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`provider` varchar(255) NOT NULL DEFAULT 'LOGO_GO3',
	`entity_type` varchar(255) NOT NULL,
	`entity_id` varchar(255) NOT NULL,
	`payload` text NOT NULL,
	`status` varchar(255) NOT NULL DEFAULT 'PENDING',
	`priority` int NOT NULL DEFAULT 10,
	`attempts` int NOT NULL DEFAULT 0,
	`max_attempts` int NOT NULL DEFAULT 3,
	`last_error` text,
	`next_run_at` timestamp NOT NULL DEFAULT (now()),
	`completed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `erp_sync_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `erp_sync_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`provider` varchar(255) NOT NULL DEFAULT 'LOGO_GO3',
	`entity_type` varchar(255) NOT NULL,
	`entity_id` varchar(255) NOT NULL,
	`action` varchar(255) NOT NULL,
	`status` varchar(255) NOT NULL,
	`retry_count` int NOT NULL DEFAULT 0,
	`error_message` text,
	`payload` text,
	`response` text,
	`batch_id` varchar(255),
	`synced_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `erp_sync_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `goods_receipt_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`receipt_id` int NOT NULL,
	`purchase_order_item_id` int NOT NULL,
	`product_id` int NOT NULL,
	`variant_id` int,
	`qty` int NOT NULL,
	CONSTRAINT `goods_receipt_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `goods_receipts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`receipt_number` varchar(255) NOT NULL,
	`purchase_order_id` int NOT NULL,
	`warehouse_id` int NOT NULL,
	`received_by` varchar(255) DEFAULT 'Mal Kabul Görevlisi',
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `goods_receipts_id` PRIMARY KEY(`id`),
	CONSTRAINT `goods_receipts_receipt_number_unique` UNIQUE(`receipt_number`)
);
--> statement-breakpoint
CREATE TABLE `inventory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`warehouse_id` int NOT NULL,
	`product_id` int NOT NULL,
	`variant_id` int,
	`physical_qty` int NOT NULL DEFAULT 0,
	`reserved_qty` int NOT NULL DEFAULT 0,
	`min_stock` int NOT NULL DEFAULT 10,
	`max_stock` int NOT NULL DEFAULT 500,
	`reorder_point` int NOT NULL DEFAULT 15,
	`location_code` varchar(255) DEFAULT 'GENEL-A-01',
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inventory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inventory_ledger` (
	`id` int AUTO_INCREMENT NOT NULL,
	`transaction_type` varchar(255) NOT NULL,
	`warehouse_id` int NOT NULL,
	`product_id` int NOT NULL,
	`variant_id` int,
	`quantity` int NOT NULL,
	`unit_cost` decimal(10,2) DEFAULT '0.00',
	`reference_type` varchar(255),
	`reference_id` varchar(255),
	`note` text,
	`created_by` varchar(255) DEFAULT 'Sistem',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inventory_ledger_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inventory_reservations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`warehouse_id` int NOT NULL,
	`product_id` int NOT NULL,
	`variant_id` int,
	`qty` int NOT NULL,
	`reference_type` varchar(255) NOT NULL DEFAULT 'CART',
	`reference_id` varchar(255),
	`status` varchar(255) NOT NULL DEFAULT 'ACTIVE',
	`expires_at` timestamp NOT NULL,
	`created_by` varchar(255) DEFAULT 'Sistem',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inventory_reservations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `loyalty_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customer_id` int NOT NULL,
	`points` int NOT NULL,
	`type` varchar(255) NOT NULL,
	`description` text,
	`order_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `loyalty_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`order_id` int NOT NULL,
	`product_id` int NOT NULL,
	`variant_id` int,
	`product_name` varchar(255) NOT NULL,
	`variant_name` varchar(255),
	`sku` varchar(255) NOT NULL,
	`barcode` varchar(255),
	`unit_price` decimal(10,2) NOT NULL,
	`quantity` int NOT NULL,
	`tax_rate` int NOT NULL DEFAULT 20,
	`total_price` decimal(10,2) NOT NULL,
	CONSTRAINT `order_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `order_return_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`return_id` int NOT NULL,
	`order_item_id` int NOT NULL,
	`product_id` int NOT NULL,
	`variant_id` int,
	`product_name` varchar(255) NOT NULL,
	`quantity` int NOT NULL,
	`refund_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
	CONSTRAINT `order_return_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `order_returns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`return_number` varchar(255) NOT NULL,
	`order_id` int NOT NULL,
	`order_number` varchar(255) NOT NULL,
	`reason` varchar(255),
	`status` varchar(255) NOT NULL DEFAULT 'REQUESTED',
	`refund_amount` decimal(10,2) DEFAULT '0.00',
	`restock` boolean NOT NULL DEFAULT true,
	`warehouse_id` int DEFAULT 3,
	`created_by` varchar(255) DEFAULT 'Müşteri Hizmetleri',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`resolved_at` timestamp,
	CONSTRAINT `order_returns_id` PRIMARY KEY(`id`),
	CONSTRAINT `order_returns_return_number_unique` UNIQUE(`return_number`)
);
--> statement-breakpoint
CREATE TABLE `order_status_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`order_id` int NOT NULL,
	`from_status` varchar(255),
	`to_status` varchar(255) NOT NULL,
	`note` text,
	`changed_by` varchar(255) DEFAULT 'Sistem',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `order_status_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`order_number` varchar(255) NOT NULL,
	`order_type` varchar(255) NOT NULL DEFAULT 'ONLINE_B2C',
	`customer_id` int,
	`customer_name` varchar(255) NOT NULL,
	`customer_email` varchar(255),
	`customer_phone` varchar(255),
	`status` varchar(255) NOT NULL DEFAULT 'PAID',
	`payment_status` varchar(255) NOT NULL DEFAULT 'PAID',
	`payment_method` varchar(255) NOT NULL DEFAULT 'CREDIT_CARD',
	`subtotal` decimal(10,2) NOT NULL DEFAULT '0.00',
	`discount_total` decimal(10,2) NOT NULL DEFAULT '0.00',
	`tax_total` decimal(10,2) NOT NULL DEFAULT '0.00',
	`shipping_total` decimal(10,2) NOT NULL DEFAULT '0.00',
	`grand_total` decimal(10,2) NOT NULL DEFAULT '0.00',
	`shipping_address` text,
	`tracking_number` varchar(255),
	`carrier` varchar(255) DEFAULT 'Yurtiçi Kargo',
	`pos_shift_id` int,
	`erp_invoice_number` varchar(255),
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `orders_order_number_unique` UNIQUE(`order_number`)
);
--> statement-breakpoint
CREATE TABLE `pos_cash_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`shift_id` int NOT NULL,
	`warehouse_id` int NOT NULL,
	`type` varchar(255) NOT NULL,
	`amount` decimal(10,2) NOT NULL,
	`reason` varchar(255) NOT NULL,
	`cashier_name` varchar(255) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pos_cash_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pos_shifts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`shift_number` varchar(255),
	`terminal_code` varchar(255) NOT NULL DEFAULT 'KASA-01',
	`cashier_name` varchar(255) NOT NULL,
	`warehouse_id` int NOT NULL,
	`opening_amount` decimal(10,2) NOT NULL DEFAULT '500.00',
	`closing_amount` decimal(10,2),
	`expected_amount` decimal(10,2),
	`total_sales_cash` decimal(10,2) DEFAULT '0.00',
	`total_sales_card` decimal(10,2) DEFAULT '0.00',
	`total_sales_split` decimal(10,2) DEFAULT '0.00',
	`total_returns_cash` decimal(10,2) DEFAULT '0.00',
	`total_returns_card` decimal(10,2) DEFAULT '0.00',
	`cash_in_total` decimal(10,2) DEFAULT '0.00',
	`cash_out_total` decimal(10,2) DEFAULT '0.00',
	`status` varchar(255) NOT NULL DEFAULT 'OPEN',
	`z_report_number` varchar(255),
	`opened_at` timestamp NOT NULL DEFAULT (now()),
	`closed_at` timestamp,
	`notes` text,
	CONSTRAINT `pos_shifts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `price_list_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`price_list_id` int NOT NULL,
	`product_id` int NOT NULL,
	`variant_id` int,
	`unit_price` decimal(10,2) NOT NULL,
	`min_qty` int NOT NULL DEFAULT 1,
	CONSTRAINT `price_list_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `price_lists` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`default_discount_rate` decimal(5,2) NOT NULL DEFAULT '0.00',
	`is_default` boolean NOT NULL DEFAULT false,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `price_lists_id` PRIMARY KEY(`id`),
	CONSTRAINT `price_lists_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `price_tiers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`price_list_id` int NOT NULL,
	`product_id` int,
	`min_qty` int NOT NULL,
	`max_qty` int,
	`discount_rate` decimal(5,2),
	`unit_price` decimal(10,2),
	CONSTRAINT `price_tiers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `product_images` (
	`id` int AUTO_INCREMENT NOT NULL,
	`product_id` int NOT NULL,
	`variant_id` int,
	`url` varchar(500) NOT NULL,
	`alt_text` varchar(255),
	`sort_order` int NOT NULL DEFAULT 0,
	`is_primary` boolean NOT NULL DEFAULT false,
	CONSTRAINT `product_images_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `product_questions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`product_id` int NOT NULL,
	`asker_name` varchar(255) NOT NULL,
	`question` text NOT NULL,
	`answer` text,
	`answered_by` varchar(255),
	`status` varchar(255) NOT NULL DEFAULT 'OPEN',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `product_questions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `product_reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`product_id` int NOT NULL,
	`customer_name` varchar(255) NOT NULL,
	`customer_email` varchar(255),
	`rating` int NOT NULL,
	`title` varchar(255),
	`comment` text NOT NULL,
	`verified_purchase` boolean NOT NULL DEFAULT false,
	`status` varchar(255) NOT NULL DEFAULT 'PENDING',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `product_reviews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `product_variants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`product_id` int NOT NULL,
	`sku` varchar(255) NOT NULL,
	`barcode` varchar(255),
	`color_name` varchar(255),
	`color_hex` varchar(255),
	`size` varchar(255),
	`length` varchar(255),
	`buy_price` decimal(10,2),
	`retail_price` decimal(10,2) NOT NULL,
	`b2b_price` decimal(10,2),
	`image_url` varchar(500),
	`is_active` boolean NOT NULL DEFAULT true,
	CONSTRAINT `product_variants_id` PRIMARY KEY(`id`),
	CONSTRAINT `product_variants_sku_unique` UNIQUE(`sku`),
	CONSTRAINT `product_variants_barcode_unique` UNIQUE(`barcode`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`slug` varchar(255) NOT NULL,
	`sku` varchar(255) NOT NULL,
	`barcode` varchar(255),
	`brand_id` int,
	`category_id` int NOT NULL,
	`short_description` text,
	`description` text,
	`unit` varchar(255) NOT NULL DEFAULT 'Adet',
	`buy_price` decimal(10,2) NOT NULL DEFAULT '0.00',
	`retail_price` decimal(10,2) NOT NULL DEFAULT '0.00',
	`b2b_price` decimal(10,2) NOT NULL DEFAULT '0.00',
	`min_order_qty` int NOT NULL DEFAULT 1,
	`package_qty` int NOT NULL DEFAULT 1,
	`vat_rate` int NOT NULL DEFAULT 20,
	`has_variants` boolean NOT NULL DEFAULT false,
	`image_url` varchar(500),
	`campaign_price` decimal(10,2),
	`tags` text,
	`collection` varchar(255),
	`seo_title` varchar(255),
	`seo_description` text,
	`is_featured` boolean DEFAULT false,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `products_id` PRIMARY KEY(`id`),
	CONSTRAINT `products_slug_unique` UNIQUE(`slug`),
	CONSTRAINT `products_sku_unique` UNIQUE(`sku`),
	CONSTRAINT `products_barcode_unique` UNIQUE(`barcode`)
);
--> statement-breakpoint
CREATE TABLE `promotions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`rule_type` varchar(255) NOT NULL DEFAULT 'PERCENT_CATEGORY',
	`category_id` int,
	`brand_id` int,
	`product_id` int,
	`percent_value` decimal(5,2),
	`fixed_value` decimal(10,2),
	`threshold_amount` decimal(10,2),
	`buy_qty` int,
	`pay_qty` int,
	`min_qty` int DEFAULT 1,
	`max_discount` decimal(10,2),
	`free_shipping` boolean NOT NULL DEFAULT false,
	`priority` int NOT NULL DEFAULT 50,
	`start_date` timestamp NOT NULL DEFAULT (now()),
	`end_date` timestamp,
	`is_active` boolean NOT NULL DEFAULT true,
	`used_count` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `promotions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchase_order_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`purchase_order_id` int NOT NULL,
	`product_id` int NOT NULL,
	`variant_id` int,
	`quantity` int NOT NULL,
	`unit_cost` decimal(10,2) NOT NULL,
	`received_qty` int NOT NULL DEFAULT 0,
	`total_cost` decimal(10,2) NOT NULL,
	CONSTRAINT `purchase_order_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchase_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`po_number` varchar(255) NOT NULL,
	`supplier_id` int NOT NULL,
	`warehouse_id` int NOT NULL,
	`status` varchar(255) NOT NULL DEFAULT 'ORDERED',
	`total_amount` decimal(12,2) NOT NULL DEFAULT '0.00',
	`notes` text,
	`expected_date` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `purchase_orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `purchase_orders_po_number_unique` UNIQUE(`po_number`)
);
--> statement-breakpoint
CREATE TABLE `purchase_request_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`request_id` int NOT NULL,
	`product_id` int NOT NULL,
	`variant_id` int,
	`qty` int NOT NULL,
	`estimated_cost` decimal(10,2) DEFAULT '0.00',
	CONSTRAINT `purchase_request_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchase_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`request_number` varchar(255) NOT NULL,
	`warehouse_id` int NOT NULL,
	`status` varchar(255) NOT NULL DEFAULT 'REQUESTED',
	`priority` varchar(255) NOT NULL DEFAULT 'NORMAL',
	`notes` text,
	`created_by` varchar(255) DEFAULT 'Depo Sorumlusu',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`approved_at` timestamp,
	`approved_by` varchar(255),
	CONSTRAINT `purchase_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `purchase_requests_request_number_unique` UNIQUE(`request_number`)
);
--> statement-breakpoint
CREATE TABLE `stock_count_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`session_id` int NOT NULL,
	`product_id` int NOT NULL,
	`variant_id` int,
	`expected_qty` int NOT NULL,
	`counted_qty` int NOT NULL,
	`location_code` varchar(255),
	`scanned_barcode` varchar(255),
	`counted_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stock_count_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stock_count_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`count_number` varchar(255) NOT NULL,
	`warehouse_id` int NOT NULL,
	`status` varchar(255) NOT NULL DEFAULT 'IN_PROGRESS',
	`started_by` varchar(255) DEFAULT 'Sayım Ekibi',
	`started_at` timestamp NOT NULL DEFAULT (now()),
	`completed_at` timestamp,
	CONSTRAINT `stock_count_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `stock_count_sessions_count_number_unique` UNIQUE(`count_number`)
);
--> statement-breakpoint
CREATE TABLE `stock_transfer_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`transfer_id` int NOT NULL,
	`product_id` int NOT NULL,
	`variant_id` int,
	`qty` int NOT NULL,
	CONSTRAINT `stock_transfer_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stock_transfers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`transfer_number` varchar(255) NOT NULL,
	`from_warehouse_id` int NOT NULL,
	`to_warehouse_id` int NOT NULL,
	`status` varchar(255) NOT NULL DEFAULT 'REQUESTED',
	`note` text,
	`created_by` varchar(255) DEFAULT 'Depo Sorumlusu',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`approved_at` timestamp,
	`shipped_at` timestamp,
	`received_at` timestamp,
	CONSTRAINT `stock_transfers_id` PRIMARY KEY(`id`),
	CONSTRAINT `stock_transfers_transfer_number_unique` UNIQUE(`transfer_number`)
);
--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`contact_person` varchar(255),
	`phone` varchar(255),
	`email` varchar(255),
	`tax_office` varchar(255),
	`tax_number` varchar(255),
	`lead_time_days` int NOT NULL DEFAULT 3,
	`payment_terms` varchar(255) DEFAULT '30 Gün Vade',
	`rating` decimal(3,1) DEFAULT '4.8',
	`address` text,
	`is_active` boolean NOT NULL DEFAULT true,
	CONSTRAINT `suppliers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(255) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`role` varchar(255) NOT NULL DEFAULT 'CASHIER',
	`phone` varchar(255),
	`avatar_url` varchar(500),
	`customer_id` int,
	`totp_secret` varchar(255),
	`totp_secret_previous` varchar(255),
	`mfa_enabled` boolean NOT NULL DEFAULT false,
	`recovery_code_hash` varchar(255),
	`failed_login_count` int NOT NULL DEFAULT 0,
	`locked_until` timestamp,
	`last_login_at` timestamp,
	`password_changed_at` timestamp,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `warehouse_locations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`warehouse_id` int NOT NULL,
	`location_code` varchar(255) NOT NULL,
	`zone` varchar(255),
	`aisle` varchar(255),
	`rack` varchar(255),
	`shelf` varchar(255),
	`bin` varchar(255),
	CONSTRAINT `warehouse_locations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `warehouses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`code` varchar(255) NOT NULL,
	`type` varchar(255) NOT NULL DEFAULT 'STORE',
	`address` text,
	`is_active` boolean NOT NULL DEFAULT true,
	CONSTRAINT `warehouses_id` PRIMARY KEY(`id`),
	CONSTRAINT `warehouses_code_unique` UNIQUE(`code`)
);
