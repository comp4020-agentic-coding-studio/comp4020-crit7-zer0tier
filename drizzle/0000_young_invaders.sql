CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`number` text NOT NULL,
	`day` integer NOT NULL,
	`start` integer NOT NULL,
	`end` integer NOT NULL,
	`location` text NOT NULL,
	`capacity` integer NOT NULL,
	`taken` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `activity_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `activity_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`course_code` text NOT NULL,
	`label` text NOT NULL,
	`kind` text NOT NULL,
	`read_only` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`course_code`) REFERENCES `courses`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `allocations` (
	`group_id` text PRIMARY KEY NOT NULL,
	`activity_id` text NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `activity_groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `courses` (
	`code` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`class_number` text NOT NULL,
	`hue` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `preferences` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `waitlist` (
	`group_id` text PRIMARY KEY NOT NULL,
	`activity_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `activity_groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE no action
);
