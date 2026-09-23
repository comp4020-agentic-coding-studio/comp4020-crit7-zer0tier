CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`activity_id` text NOT NULL,
	`part` text NOT NULL,
	`activity_type` text NOT NULL,
	`description` text NOT NULL,
	`day` integer NOT NULL,
	`start` integer NOT NULL,
	`end` integer NOT NULL,
	`campus` text NOT NULL,
	`location` text NOT NULL,
	`staff` text NOT NULL,
	`dates` text NOT NULL,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `activities` DROP COLUMN `day`;--> statement-breakpoint
ALTER TABLE `activities` DROP COLUMN `start`;--> statement-breakpoint
ALTER TABLE `activities` DROP COLUMN `end`;--> statement-breakpoint
ALTER TABLE `activities` DROP COLUMN `location`;--> statement-breakpoint
ALTER TABLE `activities` DROP COLUMN `capacity`;--> statement-breakpoint
ALTER TABLE `activities` DROP COLUMN `taken`;