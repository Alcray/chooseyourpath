CREATE TABLE `blueprints` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`brief_json` text NOT NULL,
	`plan_json` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_blueprints_owner_created` ON `blueprints` (`owner_user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `stories` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`status` text NOT NULL,
	`brief_json` text NOT NULL,
	`plan_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_stories_owner_idempotency` ON `stories` (`owner_user_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_stories_owner_updated` ON `stories` (`owner_user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `clips` (
	`id` text PRIMARY KEY NOT NULL,
	`story_id` text NOT NULL,
	`slot` text NOT NULL,
	`status` text NOT NULL,
	`provider_job_id` text,
	`r2_key` text,
	`mime_type` text,
	`error_message` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_clips_story_slot` ON `clips` (`story_id`,`slot`);--> statement-breakpoint
CREATE INDEX `idx_clips_story_status_updated` ON `clips` (`story_id`,`status`,`updated_at`);--> statement-breakpoint
PRAGMA optimize;
