CREATE TABLE IF NOT EXISTS `crm_duplicate_reviews` (
  `customer_low_id` integer NOT NULL REFERENCES `customers`(`id`) ON DELETE RESTRICT,
  `customer_high_id` integer NOT NULL REFERENCES `customers`(`id`) ON DELETE RESTRICT,
  `status` text NOT NULL CHECK (`status` IN ('DISTINCT', 'UNSURE')),
  `low_version` text NOT NULL,
  `high_version` text NOT NULL,
  `revision` integer NOT NULL CHECK (`revision` > 0),
  `reviewed_by_id` integer NOT NULL,
  `reviewed_by_name` text NOT NULL,
  `reviewed_at` integer NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (`customer_low_id`, `customer_high_id`),
  CHECK (`customer_low_id` < `customer_high_id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `crm_duplicate_reviews_high_idx` ON `crm_duplicate_reviews` (`customer_high_id`, `customer_low_id`);
