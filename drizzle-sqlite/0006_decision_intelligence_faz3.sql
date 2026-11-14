CREATE TABLE `decision_alternatives` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`decision_id` integer NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`expected_revenue` numeric DEFAULT '0' NOT NULL,
	`expected_profit` numeric DEFAULT '0' NOT NULL,
	`expected_cost` numeric DEFAULT '0' NOT NULL,
	`cash_need` numeric DEFAULT '0' NOT NULL,
	`risk_score` numeric DEFAULT '50' NOT NULL,
	`success_probability` numeric,
	`implementation_days` integer,
	`resource_note` text,
	`constraints` text,
	`score` numeric,
	`rank` integer,
	`criteria_scores` text,
	`assumptions` text
);
--> statement-breakpoint
CREATE INDEX `decision_alternatives_decision_idx` ON `decision_alternatives` (`decision_id`);--> statement-breakpoint
CREATE TABLE `decision_conflicts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conflict_key` text NOT NULL,
	`conflict_type` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`related_product_id` integer,
	`items` text DEFAULT '[]' NOT NULL,
	`financial_impact_difference` numeric,
	`resolution_options` text,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `decision_conflicts_conflict_key_unique` ON `decision_conflicts` (`conflict_key`);--> statement-breakpoint
CREATE INDEX `decision_conflicts_status_idx` ON `decision_conflicts` (`status`);--> statement-breakpoint
CREATE INDEX `decision_conflicts_product_idx` ON `decision_conflicts` (`related_product_id`);--> statement-breakpoint
CREATE TABLE `decision_outcomes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`decision_id` integer NOT NULL,
	`expected_profit_impact` numeric DEFAULT '0' NOT NULL,
	`actual_profit_impact` numeric DEFAULT '0' NOT NULL,
	`realization_rate` numeric,
	`evaluation_window_start` text,
	`evaluation_window_end` text,
	`note` text,
	`measured_by` text DEFAULT 'Yönetici' NOT NULL,
	`measured_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `decision_outcomes_decision_idx` ON `decision_outcomes` (`decision_id`);--> statement-breakpoint
CREATE TABLE `decision_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`decision_key` text NOT NULL,
	`title` text NOT NULL,
	`decision_type` text NOT NULL,
	`status` text DEFAULT 'RECOMMENDED' NOT NULL,
	`source_modules` text DEFAULT '[]' NOT NULL,
	`related_product_id` integer,
	`related_category_id` integer,
	`related_supplier_id` integer,
	`related_campaign_id` integer,
	`analysis_period_start` text,
	`analysis_period_end` text,
	`recommendation_summary` text DEFAULT '' NOT NULL,
	`expected_revenue_impact` numeric DEFAULT '0' NOT NULL,
	`expected_profit_impact` numeric DEFAULT '0' NOT NULL,
	`expected_cash_impact` numeric DEFAULT '0' NOT NULL,
	`risk_score` numeric DEFAULT '50' NOT NULL,
	`success_probability` numeric,
	`data_coverage` numeric DEFAULT '50' NOT NULL,
	`confidence_label` text DEFAULT 'LOW' NOT NULL,
	`statistical_confidence` numeric,
	`confidence_components` text,
	`method_note` text DEFAULT '' NOT NULL,
	`evidence` text,
	`assumptions` text,
	`explanation` text DEFAULT '' NOT NULL,
	`analysis_snapshot` text,
	`opportunity_key` text,
	`algorithm_version` text DEFAULT 'decision@1.0.0' NOT NULL,
	`created_by` text DEFAULT 'Sistem' NOT NULL,
	`approved_by` text,
	`approved_at` integer,
	`implemented_at` integer,
	`completed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `decision_records_decision_key_unique` ON `decision_records` (`decision_key`);--> statement-breakpoint
CREATE INDEX `decision_records_status_idx` ON `decision_records` (`status`);--> statement-breakpoint
CREATE INDEX `decision_records_type_idx` ON `decision_records` (`decision_type`);--> statement-breakpoint
CREATE INDEX `decision_records_product_idx` ON `decision_records` (`related_product_id`);--> statement-breakpoint
CREATE INDEX `decision_records_opportunity_idx` ON `decision_records` (`opportunity_key`);--> statement-breakpoint
CREATE TABLE `early_warning_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`alert_key` text NOT NULL,
	`alert_type` text NOT NULL,
	`category` text NOT NULL,
	`related_entity_type` text,
	`related_entity_id` integer,
	`related_entity_label` text,
	`risk_score` numeric DEFAULT '0' NOT NULL,
	`severity` text DEFAULT 'LOW' NOT NULL,
	`trigger_condition` text DEFAULT '' NOT NULL,
	`observed_value` numeric,
	`expected_value` numeric,
	`deviation_pct` numeric,
	`potential_financial_impact` numeric,
	`confidence` numeric DEFAULT '50' NOT NULL,
	`recommended_action` text DEFAULT '' NOT NULL,
	`evidence` text,
	`assumption` text,
	`status` text DEFAULT 'NEW' NOT NULL,
	`assigned_user` text,
	`resolution_note` text,
	`occurrence_count` integer DEFAULT 1 NOT NULL,
	`first_seen_at` integer DEFAULT (unixepoch()) NOT NULL,
	`last_seen_at` integer DEFAULT (unixepoch()) NOT NULL,
	`resolved_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `early_warning_events_alert_key_unique` ON `early_warning_events` (`alert_key`);--> statement-breakpoint
CREATE INDEX `early_warning_events_status_idx` ON `early_warning_events` (`status`);--> statement-breakpoint
CREATE INDEX `early_warning_events_category_idx` ON `early_warning_events` (`category`);--> statement-breakpoint
CREATE INDEX `early_warning_events_lastseen_idx` ON `early_warning_events` (`last_seen_at`);--> statement-breakpoint
CREATE TABLE `early_warning_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`action` text NOT NULL,
	`from_status` text,
	`to_status` text,
	`details` text,
	`actor_name` text DEFAULT 'Sistem' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `early_warning_history_event_idx` ON `early_warning_history` (`event_id`);--> statement-breakpoint
CREATE TABLE `management_goals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`kpi` text NOT NULL,
	`unit` text DEFAULT 'TL' NOT NULL,
	`baseline_value` numeric,
	`target_value` numeric NOT NULL,
	`current_value` numeric,
	`direction` text DEFAULT 'HIGHER_BETTER' NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`responsible_user` text,
	`priority` text DEFAULT 'MEDIUM' NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`measurement_method` text DEFAULT 'AUTO' NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `management_goals_status_idx` ON `management_goals` (`status`);--> statement-breakpoint
CREATE INDEX `management_goals_category_idx` ON `management_goals` (`category`);--> statement-breakpoint
CREATE TABLE `monte_carlo_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`scenario_id` integer,
	`kind` text NOT NULL,
	`parameters` text DEFAULT '{}' NOT NULL,
	`seed` integer NOT NULL,
	`iterations` integer NOT NULL,
	`results` text DEFAULT '{}' NOT NULL,
	`sensitivity` text,
	`reliability` text,
	`created_by` text DEFAULT 'Yönetici' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `monte_carlo_runs_created_idx` ON `monte_carlo_runs` (`created_at`);--> statement-breakpoint
CREATE TABLE `scenario_definitions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`category` text NOT NULL,
	`scope_type` text,
	`scope_id` integer,
	`parameters` text DEFAULT '{}' NOT NULL,
	`period_start` text,
	`period_end` text,
	`created_by` text DEFAULT 'Yönetici' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `scenario_definitions_category_idx` ON `scenario_definitions` (`category`);--> statement-breakpoint
CREATE TABLE `scenario_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scenario_id` integer NOT NULL,
	`run_at` integer DEFAULT (unixepoch()) NOT NULL,
	`baseline_metrics` text DEFAULT '{}' NOT NULL,
	`scenario_metrics` text DEFAULT '{}' NOT NULL,
	`base_case` text,
	`expected_case` text,
	`best_case` text,
	`worst_case` text,
	`financial_impact` text DEFAULT '{}' NOT NULL,
	`risk_score` numeric,
	`confidence` numeric,
	`data_coverage` numeric,
	`assumptions` text,
	`notes` text,
	`algorithm_version` text DEFAULT 'scenario@1.0.0' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `scenario_results_scenario_idx` ON `scenario_results` (`scenario_id`);