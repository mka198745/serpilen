CREATE TABLE IF NOT EXISTS `pos_screen_pins` (
 `user_id` integer PRIMARY KEY NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
 `pin_hash` text NOT NULL,
 `failed_attempts` integer NOT NULL DEFAULT 0,
 `locked_until` integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `pos_screen_grants` (
 `grant_hash` text PRIMARY KEY NOT NULL,
 `user_id` integer NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
 `session_hash` text NOT NULL,
 `expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `pos_screen_grants_user_idx` ON `pos_screen_grants` (`user_id`, `expires_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `pos_pin_password_attempts` (
 `user_id` integer PRIMARY KEY NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
 `failed_attempts` integer NOT NULL DEFAULT 0,
 `locked_until` integer NOT NULL DEFAULT 0
);
