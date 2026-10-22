CREATE TABLE `bodyweights` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`kg` real NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `change_log` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`table_name` text NOT NULL,
	`row_id` text NOT NULL,
	`op` text NOT NULL,
	`at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `checkins` (
	`id` text PRIMARY KEY NOT NULL,
	`week_start` text NOT NULL,
	`fatigue` integer NOT NULL,
	`soreness` integer NOT NULL,
	`motivation` integer NOT NULL,
	`joint_pain` integer NOT NULL,
	`joint_pain_region` text,
	`note` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `enrolment_swaps` (
	`id` text PRIMARY KEY NOT NULL,
	`enrolment_id` text NOT NULL,
	`program_exercise_id` text NOT NULL,
	`from_exercise_id` text NOT NULL,
	`to_exercise_id` text NOT NULL,
	`scope` text NOT NULL,
	`program_day` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`enrolment_id`) REFERENCES `enrolments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`program_exercise_id`) REFERENCES `program_exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `enrolments` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`started_on` text NOT NULL,
	`current_day_index` integer DEFAULT 0 NOT NULL,
	`day_order` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`template_id`) REFERENCES `program_templates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `exercise_states` (
	`id` text PRIMARY KEY NOT NULL,
	`exercise_id` text NOT NULL,
	`working_weight_kg` real,
	`target_reps` integer,
	`consecutive_fails` integer DEFAULT 0 NOT NULL,
	`e1rm_kg` real,
	`last_increase_on` text,
	`last_session_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`primary_muscle` text NOT NULL,
	`secondary_muscles` text DEFAULT '[]' NOT NULL,
	`equipment` text NOT NULL,
	`pattern` text NOT NULL,
	`is_compound` integer DEFAULT false NOT NULL,
	`default_increment_kg` real DEFAULT 2.5 NOT NULL,
	`cues` text DEFAULT '' NOT NULL,
	`media_url` text,
	`is_custom` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `exercises_primary_idx` ON `exercises` (`primary_muscle`);--> statement-breakpoint
CREATE TABLE `health_daily` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`source` text NOT NULL,
	`hrv_ms` real,
	`rhr_bpm` real,
	`sleep_hours` real,
	`sleep_score` real,
	`vendor_readiness` real,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `health_daily_date_source_idx` ON `health_daily` (`date`,`source`);--> statement-breakpoint
CREATE TABLE `nutrition_targets` (
	`id` text PRIMARY KEY NOT NULL,
	`effective_from` text NOT NULL,
	`goal` text NOT NULL,
	`activity` text NOT NULL,
	`based_on_kg` real NOT NULL,
	`kcal` integer NOT NULL,
	`protein_g` integer NOT NULL,
	`carbs_g` integer NOT NULL,
	`fat_g` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `phases` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`week_from` integer NOT NULL,
	`week_to` integer NOT NULL,
	`kind` text NOT NULL,
	`volume_mult` real DEFAULT 1 NOT NULL,
	`rpe_target` real,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`template_id`) REFERENCES `program_templates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `program_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`template_day_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`series` text NOT NULL,
	`position` integer NOT NULL,
	`warmup_sets` integer DEFAULT 0 NOT NULL,
	`sets` integer NOT NULL,
	`rep_min` integer NOT NULL,
	`rep_max` integer NOT NULL,
	`target_rpe` real,
	`tempo` text,
	`rest_s` integer DEFAULT 120 NOT NULL,
	`rule` text NOT NULL,
	`increment_kg` real,
	`fails_before_reset` integer DEFAULT 3 NOT NULL,
	`reset_pct` real DEFAULT 0.9 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`template_day_id`) REFERENCES `template_days`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `program_exercises_day_idx` ON `program_exercises` (`template_day_id`);--> statement-breakpoint
CREATE TABLE `program_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`method` text NOT NULL,
	`level` text NOT NULL,
	`weeks` integer NOT NULL,
	`days_per_week` integer NOT NULL,
	`cycle_length` integer DEFAULT 7 NOT NULL,
	`minutes` integer NOT NULL,
	`summary` text NOT NULL,
	`rationale` text NOT NULL,
	`is_custom` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `readiness_daily` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`score` real,
	`band` text NOT NULL,
	`reasons` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`enrolment_id` text,
	`template_day_id` text,
	`program_day` integer,
	`date` text NOT NULL,
	`name` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`status` text NOT NULL,
	`readiness_at_start` real,
	`adjustments` text,
	`notes` text,
	`is_backfill` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`enrolment_id`) REFERENCES `enrolments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`template_day_id`) REFERENCES `template_days`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sessions_date_idx` ON `sessions` (`date`);--> statement-breakpoint
CREATE TABLE `set_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`program_exercise_id` text,
	`series` text,
	`exercise_order` integer DEFAULT 0 NOT NULL,
	`set_index` integer NOT NULL,
	`set_type` text NOT NULL,
	`target_weight_kg` real,
	`target_reps` integer,
	`target_rpe` real,
	`weight_kg` real,
	`reps` integer,
	`rpe` real,
	`completed` integer DEFAULT false NOT NULL,
	`logged_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `set_logs_session_idx` ON `set_logs` (`session_id`);--> statement-breakpoint
CREATE INDEX `set_logs_exercise_idx` ON `set_logs` (`exercise_id`,`logged_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `template_days` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`day_index` integer NOT NULL,
	`name` text NOT NULL,
	`is_rest` integer DEFAULT false NOT NULL,
	`focus` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`template_id`) REFERENCES `program_templates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `template_days_tpl_idx` ON `template_days` (`template_id`,`day_index`);--> statement-breakpoint
CREATE TABLE `week_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`enrolment_id` text NOT NULL,
	`week_start` text NOT NULL,
	`volume_mult` real NOT NULL,
	`rpe_cap` real,
	`deload` integer DEFAULT false NOT NULL,
	`reasons` text DEFAULT '[]' NOT NULL,
	`accepted` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`enrolment_id`) REFERENCES `enrolments`(`id`) ON UPDATE no action ON DELETE no action
);
