CREATE TABLE IF NOT EXISTS `crm_tags` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` text NOT NULL,
  `normalized_name` text NOT NULL UNIQUE,
  `created_at` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `crm_customer_tags` (
  `customer_id` integer NOT NULL REFERENCES `customers`(`id`) ON DELETE RESTRICT,
  `tag_id` integer NOT NULL REFERENCES `crm_tags`(`id`) ON DELETE RESTRICT,
  `created_at` integer NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (`customer_id`, `tag_id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `crm_customer_tags_tag_idx` ON `crm_customer_tags` (`tag_id`, `customer_id`);
