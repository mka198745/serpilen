ALTER TABLE `blog_posts` ADD `seo_title` varchar(300);--> statement-breakpoint
ALTER TABLE `blog_posts` ADD `seo_description` text;--> statement-breakpoint
ALTER TABLE `blog_posts` ADD `seo_keywords` varchar(500);--> statement-breakpoint
ALTER TABLE `blog_posts` ADD `seo_noindex` boolean NOT NULL DEFAULT false;
