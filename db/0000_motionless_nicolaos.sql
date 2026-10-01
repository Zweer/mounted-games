CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`role` text DEFAULT 'viewer' NOT NULL,
	`status` text DEFAULT 'approved' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `category` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`competition_id` integer NOT NULL,
	`format` text NOT NULL,
	`age_band` text,
	`pro` integer DEFAULT false NOT NULL,
	`division` text,
	`label` text,
	`source` text NOT NULL,
	FOREIGN KEY (`competition_id`) REFERENCES `competition`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `category_competition_idx` ON `category` (`competition_id`);--> statement-breakpoint
CREATE INDEX `category_format_idx` ON `category` (`format`);--> statement-breakpoint
CREATE TABLE `competition` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`grouping_key` text NOT NULL,
	`level` text,
	`nation_id` integer,
	`venue_id` integer,
	`starts_on` text,
	`ends_on` text,
	`organizer` text,
	`source` text NOT NULL,
	`source_title_raw` text,
	FOREIGN KEY (`nation_id`) REFERENCES `nation`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`venue_id`) REFERENCES `venue`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `competition_source_group_idx` ON `competition` (`source`,`grouping_key`);--> statement-breakpoint
CREATE TABLE `heat` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`phase_id` integer NOT NULL,
	`number` integer NOT NULL,
	FOREIGN KEY (`phase_id`) REFERENCES `phase`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `heat_phase_number_uq` ON `heat` (`phase_id`,`number`);--> statement-breakpoint
CREATE TABLE `phase` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category_id` integer NOT NULL,
	`kind` text NOT NULL,
	`ordinal` integer NOT NULL,
	`label` text NOT NULL,
	`native_params` text,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `phase_category_kind_ord_uq` ON `phase` (`category_id`,`kind`,`ordinal`);--> statement-breakpoint
CREATE TABLE `contribution` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`target` text NOT NULL,
	`target_id` integer,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reviewed_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`reviewed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ingestion_state` (
	`job` text PRIMARY KEY NOT NULL,
	`lease_until` integer,
	`next_run_at` integer,
	`last_discovery_at` integer,
	`next_discovery_at` integer,
	`last_archive_at` integer
);
--> statement-breakpoint
CREATE TABLE `scrape_target` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`url` text NOT NULL,
	`kind` text NOT NULL,
	`category_id` integer,
	`is_live` integer DEFAULT false NOT NULL,
	`last_scraped_at` integer,
	`next_poll_at` integer,
	`last_attempt_at` integer,
	`last_success_at` integer,
	`leased_until` integer,
	`failure_count` integer DEFAULT 0 NOT NULL,
	`content_hash` text,
	`starts_on` text,
	`ends_on` text,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `scrape_target_live_stale_idx` ON `scrape_target` (`is_live`,`next_poll_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `scrape_target_url_uq` ON `scrape_target` (`url`);--> statement-breakpoint
CREATE TABLE `source_ref` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` integer NOT NULL,
	`native_id` text NOT NULL,
	`native_url` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_ref_source_type_native_uq` ON `source_ref` (`source`,`entity_type`,`native_id`);--> statement-breakpoint
CREATE TABLE `athlete` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`family_name` text NOT NULL,
	`given_name` text,
	`normalized_name` text NOT NULL,
	`nation_id` integer,
	FOREIGN KEY (`nation_id`) REFERENCES `nation`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `athlete_normalized_name_unique` ON `athlete` (`normalized_name`);--> statement-breakpoint
CREATE TABLE `horse` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `horse_normalized_name_unique` ON `horse` (`normalized_name`);--> statement-breakpoint
CREATE TABLE `participant` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category_id` integer NOT NULL,
	`type` text NOT NULL,
	`label` text NOT NULL,
	`normalized_label` text NOT NULL,
	`team_id` integer,
	`athlete_id` integer,
	`nation_id` integer,
	`start_number` integer,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`athlete_id`) REFERENCES `athlete`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`nation_id`) REFERENCES `nation`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `participant_category_label_uq` ON `participant` (`category_id`,`normalized_label`);--> statement-breakpoint
CREATE TABLE `participant_member` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`participant_id` integer NOT NULL,
	`athlete_id` integer NOT NULL,
	`horse_id` integer,
	`role` text,
	`provenance` text DEFAULT 'scraped' NOT NULL,
	FOREIGN KEY (`participant_id`) REFERENCES `participant`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`athlete_id`) REFERENCES `athlete`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`horse_id`) REFERENCES `horse`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `participant_member_uq` ON `participant_member` (`participant_id`,`athlete_id`);--> statement-breakpoint
CREATE TABLE `team` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`nation_id` integer,
	`is_club` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`nation_id`) REFERENCES `nation`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `game` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`canonical_name` text NOT NULL,
	`normalized_name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `game_normalized_name_unique` ON `game` (`normalized_name`);--> statement-breakpoint
CREATE TABLE `game_alias` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` integer NOT NULL,
	`source` text NOT NULL,
	`raw_name` text NOT NULL,
	`normalized_name` text NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `game`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `game_alias_source_norm_uq` ON `game_alias` (`source`,`normalized_name`);--> statement-breakpoint
CREATE TABLE `nation` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `nation_code_unique` ON `nation` (`code`);--> statement-breakpoint
CREATE TABLE `venue` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`nation_id` integer,
	FOREIGN KEY (`nation_id`) REFERENCES `nation`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `venue_normalized_name_unique` ON `venue` (`normalized_name`);--> statement-breakpoint
CREATE TABLE `game_result` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`result_id` integer NOT NULL,
	`game_id` integer NOT NULL,
	`points_cents` integer NOT NULL,
	`ordinal` integer NOT NULL,
	FOREIGN KEY (`result_id`) REFERENCES `result`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`game_id`) REFERENCES `game`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `game_result_result_game_uq` ON `game_result` (`result_id`,`game_id`);--> statement-breakpoint
CREATE TABLE `result` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`participant_id` integer NOT NULL,
	`phase_id` integer NOT NULL,
	`heat_id` integer,
	`points_total_cents` integer NOT NULL,
	`penalty_points_cents` integer,
	`rank` integer,
	`is_tie` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`participant_id`) REFERENCES `participant`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`phase_id`) REFERENCES `phase`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`heat_id`) REFERENCES `heat`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `result_participant_phase_heat_uq` ON `result` (`participant_id`,`phase_id`,`heat_id`);