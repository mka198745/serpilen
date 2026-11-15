-- Destek Masası: "İletişim & Destek Masası" sayfasındaki "Bize Mesaj Gönderin"
-- formundan gelen mesajlar bu tabloda saklanır (yönetim paneli -> Destek Masası).
CREATE TABLE `contact_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`email` text,
	`subject` text,
	`message` text NOT NULL,
	`status` text DEFAULT 'NEW' NOT NULL,
	`source` text DEFAULT 'iletisim' NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`read_at` integer
);
--> statement-breakpoint
CREATE INDEX `contact_messages_created_idx` ON `contact_messages` (`created_at`);
--> statement-breakpoint
CREATE INDEX `contact_messages_status_idx` ON `contact_messages` (`status`);
