CREATE TYPE "public"."sharing_permission" AS ENUM('unknown', 'granted');--> statement-breakpoint
CREATE TYPE "public"."summary_basis" AS ENUM('metadata', 'transcript');--> statement-breakpoint
CREATE TYPE "public"."transcript_source" AS ENUM('whisper', 'creator_provided');--> statement-breakpoint
CREATE TYPE "public"."transcript_visibility" AS ENUM('private', 'public');--> statement-breakpoint
CREATE TABLE "transcripts" (
	"video_id" integer PRIMARY KEY NOT NULL,
	"source" "transcript_source" NOT NULL,
	"visibility" "transcript_visibility" DEFAULT 'private' NOT NULL,
	"sharing_permission" "sharing_permission" DEFAULT 'unknown' NOT NULL,
	"segments" jsonb NOT NULL,
	"permission_note" text,
	"attribution" text,
	"license_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transcript_segments_array" CHECK (jsonb_typeof(segments) = 'array'),
	CONSTRAINT "transcript_grant_evidence" CHECK (sharing_permission <> 'granted' OR (permission_note IS NOT NULL AND length(trim(permission_note)) > 0)),
	CONSTRAINT "transcript_public_attribution" CHECK (visibility <> 'public' OR (attribution IS NOT NULL AND length(trim(attribution)) > 0))
);
--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "estimated_difficulty" "difficulty";--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "difficulty_estimate_note" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "difficulty_estimate_method" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "summary_basis" "summary_basis";--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "summary_sharing_permission" "sharing_permission" DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "summary_permission_note" text;--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "estimate_assessed" CHECK (estimated_difficulty IS NULL OR estimated_difficulty <> 'unassessed');--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "estimate_evidence" CHECK (estimated_difficulty IS NULL OR (length(trim(difficulty_estimate_note)) > 0 AND length(trim(difficulty_estimate_method)) > 0 AND difficulty_estimate_note IS NOT NULL AND difficulty_estimate_method IS NOT NULL));--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "summary_grant_evidence" CHECK (summary_sharing_permission <> 'granted' OR (summary IS NOT NULL AND length(trim(summary)) > 0 AND summary_basis IS NOT NULL AND summary_permission_note IS NOT NULL AND length(trim(summary_permission_note)) > 0));