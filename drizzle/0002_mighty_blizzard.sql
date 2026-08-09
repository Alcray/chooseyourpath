CREATE TABLE `character_references` (
	`id` text PRIMARY KEY NOT NULL,
	`story_id` text NOT NULL,
	`character_id` text NOT NULL,
	`status` text NOT NULL,
	`provider_model` text NOT NULL,
	`prompt` text NOT NULL,
	`r2_key` text,
	`mime_type` text,
	`error_message` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_character_references_story_character` ON `character_references` (`story_id`,`character_id`);--> statement-breakpoint
CREATE INDEX `idx_character_references_story_status_updated` ON `character_references` (`story_id`,`status`,`updated_at`);