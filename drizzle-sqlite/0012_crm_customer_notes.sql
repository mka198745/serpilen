CREATE TABLE IF NOT EXISTS `crm_customer_notes` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `customer_id` integer NOT NULL REFERENCES `customers`(`id`) ON DELETE RESTRICT,
  `body` text NOT NULL CHECK(length(trim(`body`)) BETWEEN 1 AND 2000),
  `created_by_id` integer NOT NULL,
  `created_by_name` text NOT NULL,
  `created_at` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `crm_customer_notes_customer_idx` ON `crm_customer_notes` (`customer_id`, `created_at`, `id`);
