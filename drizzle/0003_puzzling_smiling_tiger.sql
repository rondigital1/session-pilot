CREATE TABLE `analysis_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`repository_id` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`fingerprint_hash` text,
	`profile_json` text NOT NULL,
	`findings_json` text NOT NULL,
	`summary` text NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_analysis_runs_repo` ON `analysis_runs` (`repository_id`);--> statement-breakpoint
CREATE INDEX `idx_analysis_runs_created` ON `analysis_runs` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_analysis_runs_status` ON `analysis_runs` (`status`);--> statement-breakpoint
CREATE TABLE `execution_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`execution_task_id` text NOT NULL,
	`event_type` text NOT NULL,
	`event_data` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`execution_task_id`) REFERENCES `execution_tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_execution_events_task` ON `execution_events` (`execution_task_id`);--> statement-breakpoint
CREATE INDEX `idx_execution_events_created` ON `execution_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `execution_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`repository_id` text NOT NULL,
	`suggestion_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`branch_name` text,
	`worktree_path` text,
	`task_spec_json` text NOT NULL,
	`agent_prompt` text NOT NULL,
	`validation_commands_json` text NOT NULL,
	`validation_results_json` text,
	`final_message` text,
	`error` text,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`cancelled_at` integer,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`suggestion_id`) REFERENCES `suggestions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_execution_tasks_repo` ON `execution_tasks` (`repository_id`);--> statement-breakpoint
CREATE INDEX `idx_execution_tasks_suggestion` ON `execution_tasks` (`suggestion_id`);--> statement-breakpoint
CREATE INDEX `idx_execution_tasks_status` ON `execution_tasks` (`status`);--> statement-breakpoint
CREATE INDEX `idx_execution_tasks_started` ON `execution_tasks` (`started_at`);--> statement-breakpoint
CREATE TABLE `idea_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`idea_id` text NOT NULL,
	`vote` text NOT NULL,
	`reason` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`idea_id`) REFERENCES `improvement_ideas`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_feedback_idea` ON `idea_feedback` (`idea_id`);--> statement-breakpoint
CREATE INDEX `idx_feedback_created` ON `idea_feedback` (`created_at`);--> statement-breakpoint
CREATE TABLE `improvement_ideas` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`snapshot_id` text NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`impact` text NOT NULL,
	`effort` text NOT NULL,
	`risk` text NOT NULL,
	`confidence` real NOT NULL,
	`score` real NOT NULL,
	`evidence` text NOT NULL,
	`acceptance_criteria` text NOT NULL,
	`steps` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`snapshot_id`) REFERENCES `project_snapshots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_ideas_workspace` ON `improvement_ideas` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `idx_ideas_snapshot` ON `improvement_ideas` (`snapshot_id`);--> statement-breakpoint
CREATE INDEX `idx_ideas_status` ON `improvement_ideas` (`status`);--> statement-breakpoint
CREATE INDEX `idx_ideas_created` ON `improvement_ideas` (`created_at`);--> statement-breakpoint
CREATE TABLE `project_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`snapshot_hash` text NOT NULL,
	`snapshot_data` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_snapshots_workspace` ON `project_snapshots` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `idx_snapshots_hash` ON `project_snapshots` (`snapshot_hash`);--> statement-breakpoint
CREATE INDEX `idx_snapshots_created` ON `project_snapshots` (`created_at`);--> statement-breakpoint
CREATE TABLE `repo_roots` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`path` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_repo_roots_path` ON `repo_roots` (`path`);--> statement-breakpoint
CREATE TABLE `repositories` (
	`id` text PRIMARY KEY NOT NULL,
	`root_id` text NOT NULL,
	`name` text NOT NULL,
	`path` text NOT NULL,
	`remote_origin` text,
	`default_branch` text,
	`current_branch` text,
	`is_dirty` integer DEFAULT false NOT NULL,
	`fingerprint_hash` text,
	`profile_json` text,
	`last_analyzed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`root_id`) REFERENCES `repo_roots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_repositories_root` ON `repositories` (`root_id`);--> statement-breakpoint
CREATE INDEX `idx_repositories_path` ON `repositories` (`path`);--> statement-breakpoint
CREATE INDEX `idx_repositories_last_analyzed` ON `repositories` (`last_analyzed_at`);--> statement-breakpoint
CREATE TABLE `suggestions` (
	`id` text PRIMARY KEY NOT NULL,
	`repository_id` text NOT NULL,
	`analysis_run_id` text NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`summary` text NOT NULL,
	`evidence_json` text NOT NULL,
	`impact_score` integer NOT NULL,
	`effort_score` integer NOT NULL,
	`confidence_score` integer NOT NULL,
	`risk_score` integer NOT NULL,
	`priority_score` real NOT NULL,
	`autonomy_mode` text NOT NULL,
	`likely_files_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`analysis_run_id`) REFERENCES `analysis_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_suggestions_repo` ON `suggestions` (`repository_id`);--> statement-breakpoint
CREATE INDEX `idx_suggestions_analysis` ON `suggestions` (`analysis_run_id`);--> statement-breakpoint
CREATE INDEX `idx_suggestions_priority` ON `suggestions` (`priority_score`);