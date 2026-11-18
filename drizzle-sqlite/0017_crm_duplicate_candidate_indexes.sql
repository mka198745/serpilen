CREATE INDEX IF NOT EXISTS `customers_crm_normalized_email_idx` ON `customers` (lower(trim(email)));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `customers_crm_normalized_phone_idx` ON `customers` (replace(replace(replace(replace(replace(replace(phone,' ',''),'-',''),'(',''),')',''),'.',''),'+',''));
