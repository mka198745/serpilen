ALTER TABLE `blog_posts` ADD `seo_title` text;--> statement-breakpoint
ALTER TABLE `blog_posts` ADD `seo_description` text;--> statement-breakpoint
ALTER TABLE `blog_posts` ADD `seo_keywords` text;--> statement-breakpoint
ALTER TABLE `blog_posts` ADD `seo_noindex` integer DEFAULT false NOT NULL;