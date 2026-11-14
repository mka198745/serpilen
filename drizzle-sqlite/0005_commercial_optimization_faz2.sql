CREATE TABLE `advertising_performance` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`channel` text DEFAULT 'OTHER' NOT NULL,
	`spend` numeric DEFAULT '0' NOT NULL,
	`impressions` integer DEFAULT 0 NOT NULL,
	`clicks` integer DEFAULT 0 NOT NULL,
	`conversions` integer DEFAULT 0 NOT NULL,
	`revenue_attributed` numeric DEFAULT '0' NOT NULL,
	`starts_on` text NOT NULL,
	`ends_on` text,
	`entered_by` text DEFAULT 'Yönetici' NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `advertising_performance_period_idx` ON `advertising_performance` (`starts_on`,`ends_on`);--> statement-breakpoint
CREATE INDEX `advertising_performance_channel_idx` ON `advertising_performance` (`channel`);--> statement-breakpoint
CREATE TABLE `commercial_opportunities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`opportunity_key` text NOT NULL,
	`opportunity_type` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`source_module` text NOT NULL,
	`related_product_id` integer,
	`related_category_id` integer,
	`related_supplier_id` integer,
	`related_campaign_id` integer,
	`estimated_revenue_impact` numeric DEFAULT '0' NOT NULL,
	`estimated_profit_impact` numeric DEFAULT '0' NOT NULL,
	`estimated_cost_saving` numeric DEFAULT '0' NOT NULL,
	`estimated_cash_impact` numeric DEFAULT '0' NOT NULL,
	`confidence_score` numeric DEFAULT '50' NOT NULL,
	`data_coverage` numeric DEFAULT '50' NOT NULL,
	`priority_score` numeric DEFAULT '0' NOT NULL,
	`severity` text DEFAULT 'MEDIUM' NOT NULL,
	`evidence` text,
	`assumptions` text,
	`calculation_method` text DEFAULT '' NOT NULL,
	`recommended_action` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'NEW' NOT NULL,
	`owner_name` text,
	`algorithm_version` text DEFAULT 'commercial@1.0.0' NOT NULL,
	`data_period_start` text,
	`data_period_end` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`expires_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commercial_opportunities_opportunity_key_unique` ON `commercial_opportunities` (`opportunity_key`);--> statement-breakpoint
CREATE INDEX `commercial_opportunities_status_idx` ON `commercial_opportunities` (`status`);--> statement-breakpoint
CREATE INDEX `commercial_opportunities_priority_idx` ON `commercial_opportunities` (`priority_score`);--> statement-breakpoint
CREATE INDEX `commercial_opportunities_type_idx` ON `commercial_opportunities` (`opportunity_type`);--> statement-breakpoint
CREATE INDEX `commercial_opportunities_product_idx` ON `commercial_opportunities` (`related_product_id`);--> statement-breakpoint
CREATE TABLE `opportunity_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`opportunity_id` integer NOT NULL,
	`action` text NOT NULL,
	`from_status` text,
	`to_status` text,
	`details` text,
	`actor_name` text DEFAULT 'Sistem' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `opportunity_history_opp_idx` ON `opportunity_history` (`opportunity_id`);--> statement-breakpoint
CREATE TABLE `opportunity_impact_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`opportunity_id` integer NOT NULL,
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
CREATE INDEX `opportunity_impact_opp_idx` ON `opportunity_impact_results` (`opportunity_id`);