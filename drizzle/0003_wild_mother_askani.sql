ALTER TABLE `editor_accounts` ADD `role` text DEFAULT 'member' NOT NULL CONSTRAINT `editor_accounts_valid_role` CHECK (`role` IN ('owner', 'member'));
--> statement-breakpoint
CREATE UNIQUE INDEX `editor_accounts_single_owner` ON `editor_accounts` (`role`) WHERE `role` = 'owner';
