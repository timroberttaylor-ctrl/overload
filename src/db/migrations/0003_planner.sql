ALTER TABLE `checkins` ADD `enrolment_id` text;--> statement-breakpoint
ALTER TABLE `checkins` ADD `program_week` integer;--> statement-breakpoint
ALTER TABLE `week_plans` ADD `program_week` integer;--> statement-breakpoint
ALTER TABLE `week_plans` ADD `details` text;