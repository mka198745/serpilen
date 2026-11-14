CREATE TABLE `abc_xyz_classifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`abc_class` text NOT NULL,
	`xyz_class` text NOT NULL,
	`composite` text NOT NULL,
	`annual_qty` integer DEFAULT 0 NOT NULL,
	`annual_value` numeric DEFAULT '0' NOT NULL,
	`avg_daily_demand` numeric DEFAULT '0' NOT NULL,
	`demand_cv` numeric,
	`inventory_value` numeric DEFAULT '0' NOT NULL,
	`turnover` numeric,
	`days_of_cover` numeric,
	`risk` text DEFAULT 'NONE' NOT NULL,
	`calculated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `abc_xyz_classifications_product_id_unique` ON `abc_xyz_classifications` (`product_id`);--> statement-breakpoint
CREATE INDEX `abc_xyz_composite_idx` ON `abc_xyz_classifications` (`composite`);--> statement-breakpoint
CREATE TABLE `anomaly_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`anomaly_key` text NOT NULL,
	`metric` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text DEFAULT 'STORE' NOT NULL,
	`entity_label` text NOT NULL,
	`observed_value` numeric NOT NULL,
	`expected_value` numeric NOT NULL,
	`deviation` numeric NOT NULL,
	`detection_method` text NOT NULL,
	`severity` text NOT NULL,
	`confidence` text DEFAULT 'OK' NOT NULL,
	`possible_causes` text,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`first_seen_at` integer DEFAULT (unixepoch()) NOT NULL,
	`last_seen_at` integer DEFAULT (unixepoch()) NOT NULL,
	`occurrences` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `anomaly_events_anomaly_key_unique` ON `anomaly_events` (`anomaly_key`);--> statement-breakpoint
CREATE INDEX `anomaly_events_status_idx` ON `anomaly_events` (`status`);--> statement-breakpoint
CREATE INDEX `anomaly_events_metric_idx` ON `anomaly_events` (`metric`);--> statement-breakpoint
CREATE TABLE `forecast_accuracy` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scope` text NOT NULL,
	`scope_id` integer,
	`scope_label` text NOT NULL,
	`model` text NOT NULL,
	`horizon_days` integer NOT NULL,
	`mae` numeric NOT NULL,
	`rmse` numeric NOT NULL,
	`mape` numeric,
	`wape` numeric,
	`mase` numeric,
	`bias` numeric DEFAULT '0' NOT NULL,
	`sample_size` integer DEFAULT 0 NOT NULL,
	`evaluated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `forecast_accuracy_scope_idx` ON `forecast_accuracy` (`scope`,`scope_id`);--> statement-breakpoint
CREATE INDEX `forecast_accuracy_evaluated_idx` ON `forecast_accuracy` (`evaluated_at`);--> statement-breakpoint
CREATE TABLE `forecast_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scope` text NOT NULL,
	`scope_id` integer,
	`scope_label` text NOT NULL,
	`granularity` text DEFAULT 'DAILY' NOT NULL,
	`horizon_days` integer NOT NULL,
	`forecast_date` text NOT NULL,
	`quantity` numeric DEFAULT '0' NOT NULL,
	`revenue` numeric DEFAULT '0' NOT NULL,
	`model` text NOT NULL,
	`sample_size` integer DEFAULT 0 NOT NULL,
	`ci_lower` numeric DEFAULT '0' NOT NULL,
	`ci_upper` numeric DEFAULT '0' NOT NULL,
	`model_wape` numeric,
	`data_quality` text DEFAULT 'OK' NOT NULL,
	`model_version` text DEFAULT 'intelligence@1.0.0' NOT NULL,
	`evaluated_at` integer,
	`generated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `forecast_results_scope_idx` ON `forecast_results` (`scope`,`scope_id`,`horizon_days`);--> statement-breakpoint
CREATE INDEX `forecast_results_generated_idx` ON `forecast_results` (`generated_at`);--> statement-breakpoint
CREATE TABLE `intelligence_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`description` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rfm_scores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`customer_id` integer NOT NULL,
	`period_days` integer DEFAULT 365 NOT NULL,
	`recency_days` integer NOT NULL,
	`frequency` integer NOT NULL,
	`monetary` numeric DEFAULT '0' NOT NULL,
	`r_score` integer NOT NULL,
	`f_score` integer NOT NULL,
	`m_score` integer NOT NULL,
	`segment` text NOT NULL,
	`calculated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rfm_scores_customer_idx` ON `rfm_scores` (`customer_id`,`period_days`);--> statement-breakpoint
CREATE INDEX `rfm_scores_segment_idx` ON `rfm_scores` (`segment`);