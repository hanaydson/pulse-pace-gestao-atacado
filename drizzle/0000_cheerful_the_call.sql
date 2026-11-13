CREATE TABLE `audit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`at` text NOT NULL,
	`detail` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`parent` integer NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`note` text NOT NULL,
	`type` text NOT NULL,
	`size` integer NOT NULL,
	`actor` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `files_parent` ON `files` (`parent`);--> statement-breakpoint
CREATE TABLE `members` (
	`email` text PRIMARY KEY NOT NULL,
	`uid` text,
	`role` text NOT NULL,
	`client` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_uid_unique` ON `members` (`uid`);--> statement-breakpoint
CREATE TABLE `records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`client` integer,
	`source` integer,
	`body` text NOT NULL,
	`rev` integer DEFAULT 1 NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `records_kind_client` ON `records` (`kind`,`client`);--> statement-breakpoint
CREATE UNIQUE INDEX `records_source` ON `records` (`kind`,`source`);