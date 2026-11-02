CREATE TYPE "public"."difficulty" AS ENUM('unassessed', 'beginner', 'intermediate', 'advanced');--> statement-breakpoint
CREATE TYPE "public"."language_status" AS ENUM('unverified', 'likely_ja', 'verified_ja');--> statement-breakpoint
CREATE TYPE "public"."membership_source" AS ENUM('query', 'manual');--> statement-breakpoint
CREATE TYPE "public"."run_kind" AS ENUM('collect', 'import_tombo', 'refresh');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('running', 'succeeded', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('youtube_query', 'tombo_manifest');--> statement-breakpoint
CREATE TYPE "public"."video_status" AS ENUM('candidate', 'published', 'hidden');--> statement-breakpoint
CREATE TABLE "ingestion_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "run_kind" NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"status" "run_status" DEFAULT 'running' NOT NULL,
	"query_count" integer DEFAULT 0 NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"candidates_count" integer DEFAULT 0 NOT NULL,
	"inserted_count" integer DEFAULT 0 NOT NULL,
	"updated_count" integer DEFAULT 0 NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"rejected_count" integer DEFAULT 0 NOT NULL,
	"deleted_count" integer DEFAULT 0 NOT NULL,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "interests" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "interests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	CONSTRAINT "interests_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "subtopics" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "subtopics_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"interest_id" integer NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_interests" (
	"video_id" integer NOT NULL,
	"interest_id" integer NOT NULL,
	"source" "membership_source" NOT NULL,
	"reviewed" boolean DEFAULT false NOT NULL,
	CONSTRAINT "video_interests_video_id_interest_id_pk" PRIMARY KEY("video_id","interest_id")
);
--> statement-breakpoint
CREATE TABLE "video_sources" (
	"video_id" integer NOT NULL,
	"ingestion_run_id" uuid NOT NULL,
	"source_kind" "source_kind" NOT NULL,
	"source_key" text NOT NULL,
	"query_text" text,
	"interest_id" integer,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_subtopics" (
	"video_id" integer NOT NULL,
	"subtopic_id" integer NOT NULL,
	CONSTRAINT "video_subtopics_video_id_subtopic_id_pk" PRIMARY KEY("video_id","subtopic_id")
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "videos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"youtube_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"channel_id" text NOT NULL,
	"channel_title" text NOT NULL,
	"thumbnail_url" text,
	"published_at" timestamp with time zone NOT NULL,
	"duration_seconds" integer NOT NULL,
	"view_count" bigint,
	"default_audio_language" text,
	"embeddable" boolean NOT NULL,
	"made_for_kids" boolean,
	"language_status" "language_status" DEFAULT 'unverified' NOT NULL,
	"format" text,
	"difficulty" "difficulty" DEFAULT 'unassessed' NOT NULL,
	"status" "video_status" DEFAULT 'candidate' NOT NULL,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "videos_youtube_id_unique" UNIQUE("youtube_id"),
	CONSTRAINT "youtube_id_valid" CHECK (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
	CONSTRAINT "duration_positive" CHECK (duration_seconds > 0),
	CONSTRAINT "views_nonnegative" CHECK (view_count IS NULL OR view_count >= 0),
	CONSTRAINT "format_valid" CHECK (format IS NULL OR format IN ('review','tutorial','vlog','interview','other'))
);
--> statement-breakpoint
ALTER TABLE "subtopics" ADD CONSTRAINT "subtopics_interest_id_interests_id_fk" FOREIGN KEY ("interest_id") REFERENCES "public"."interests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_interests" ADD CONSTRAINT "video_interests_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_interests" ADD CONSTRAINT "video_interests_interest_id_interests_id_fk" FOREIGN KEY ("interest_id") REFERENCES "public"."interests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_sources" ADD CONSTRAINT "video_sources_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_sources" ADD CONSTRAINT "video_sources_ingestion_run_id_ingestion_runs_id_fk" FOREIGN KEY ("ingestion_run_id") REFERENCES "public"."ingestion_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_sources" ADD CONSTRAINT "video_sources_interest_id_interests_id_fk" FOREIGN KEY ("interest_id") REFERENCES "public"."interests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_subtopics" ADD CONSTRAINT "video_subtopics_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_subtopics" ADD CONSTRAINT "video_subtopics_subtopic_id_subtopics_id_fk" FOREIGN KEY ("subtopic_id") REFERENCES "public"."subtopics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "subtopics_parent_slug" ON "subtopics" USING btree ("interest_id","slug");--> statement-breakpoint
CREATE INDEX "video_interests_interest_video" ON "video_interests" USING btree ("interest_id","video_id");--> statement-breakpoint
CREATE UNIQUE INDEX "video_source_run_key" ON "video_sources" USING btree ("video_id","ingestion_run_id","source_key");--> statement-breakpoint
CREATE INDEX "videos_status_publication" ON "videos" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "videos_status_views" ON "videos" USING btree ("status","view_count");