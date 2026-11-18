CREATE INDEX IF NOT EXISTS `order_status_history_order_created_idx` ON `order_status_history` (`order_id`, `created_at`, `id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_logs_crm_entity_idx` ON `audit_logs` (`entity`, `entity_id`, `action`, `created_at`, `id`);
