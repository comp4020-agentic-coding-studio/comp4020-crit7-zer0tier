ALTER TABLE `activities` ADD `source` text DEFAULT 'illustrative' NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `seats` integer DEFAULT 0 NOT NULL;