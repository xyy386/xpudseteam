CREATE TABLE `editor_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `editor_accounts_email_unique` ON `editor_accounts` (`email`);--> statement-breakpoint
CREATE TABLE `editor_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `editor_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
