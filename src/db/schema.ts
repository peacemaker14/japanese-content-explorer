import { sql } from "drizzle-orm";
import type { TranscriptSegment } from "../lib/transcript-types";
import {
  pgTable,
  pgEnum,
  integer,
  text,
  boolean,
  timestamp,
  bigint,
  uuid,
  primaryKey,
  uniqueIndex,
  index,
  check,
  jsonb,
} from "drizzle-orm/pg-core";

export const languageStatus = pgEnum("language_status", [
  "unverified",
  "likely_ja",
  "verified_ja",
]);
export const videoStatus = pgEnum("video_status", [
  "candidate",
  "published",
  "hidden",
]);
export const difficulty = pgEnum("difficulty", [
  "unassessed",
  "beginner",
  "intermediate",
  "advanced",
]);
export const membershipSource = pgEnum("membership_source", [
  "query",
  "manual",
]);
export const runKind = pgEnum("run_kind", [
  "collect",
  "import_tombo",
  "refresh",
]);
export const runStatus = pgEnum("run_status", [
  "running",
  "succeeded",
  "partial",
  "failed",
]);
export const sourceKind = pgEnum("source_kind", [
  "youtube_query",
  "tombo_manifest",
]);
export const sharingPermission = pgEnum("sharing_permission", ["unknown", "granted"]);
export const transcriptSource = pgEnum("transcript_source", ["whisper", "creator_provided"]);
export const transcriptVisibility = pgEnum("transcript_visibility", ["private", "public"]);
export const summaryBasis = pgEnum("summary_basis", ["metadata", "transcript"]);
const time = (name: string) => timestamp(name, { withTimezone: true });

export const interests = pgTable("interests", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
});
export const subtopics = pgTable(
  "subtopics",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    interestId: integer("interest_id")
      .notNull()
      .references(() => interests.id, { onDelete: "restrict" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
  },
  (t) => [uniqueIndex("subtopics_parent_slug").on(t.interestId, t.slug)],
);
export const videos = pgTable(
  "videos",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    youtubeId: text("youtube_id").notNull().unique(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    channelId: text("channel_id").notNull(),
    channelTitle: text("channel_title").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    publishedAt: time("published_at").notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    viewCount: bigint("view_count", { mode: "bigint" }),
    defaultAudioLanguage: text("default_audio_language"),
    embeddable: boolean("embeddable").notNull(),
    madeForKids: boolean("made_for_kids"),
    languageStatus: languageStatus("language_status")
      .notNull()
      .default("unverified"),
    format: text("format"),
    difficulty: difficulty("difficulty").notNull().default("unassessed"),
    estimatedDifficulty: difficulty("estimated_difficulty"),
    difficultyEstimateNote: text("difficulty_estimate_note"),
    difficultyEstimateMethod: text("difficulty_estimate_method"),
    summary: text("summary"),
    summaryBasis: summaryBasis("summary_basis"),
    summarySharingPermission: sharingPermission("summary_sharing_permission").notNull().default("unknown"),
    summaryPermissionNote: text("summary_permission_note"),
    status: videoStatus("status").notNull().default("candidate"),
    reviewedAt: time("reviewed_at"),
    reviewNote: text("review_note"),
    collectedAt: time("collected_at").notNull().defaultNow(),
    metadataUpdatedAt: time("metadata_updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("youtube_id_valid", sql`youtube_id ~ '^[A-Za-z0-9_-]{11}$'`),
    check("duration_positive", sql`duration_seconds > 0`),
    check("views_nonnegative", sql`view_count IS NULL OR view_count >= 0`),
    check(
      "format_valid",
      sql`format IS NULL OR format IN ('review','tutorial','vlog','interview','other')`,
    ),
    check("estimate_assessed", sql`estimated_difficulty IS NULL OR estimated_difficulty <> 'unassessed'`),
    check("estimate_evidence", sql`estimated_difficulty IS NULL OR (length(trim(difficulty_estimate_note)) > 0 AND length(trim(difficulty_estimate_method)) > 0 AND difficulty_estimate_note IS NOT NULL AND difficulty_estimate_method IS NOT NULL)`),
    check("summary_grant_evidence", sql`summary_sharing_permission <> 'granted' OR (summary IS NOT NULL AND length(trim(summary)) > 0 AND summary_basis IS NOT NULL AND summary_permission_note IS NOT NULL AND length(trim(summary_permission_note)) > 0)`),
    index("videos_status_publication").on(t.status, t.publishedAt),
    index("videos_status_views").on(t.status, t.viewCount),
  ],
);
export const transcripts = pgTable(
  "transcripts",
  {
    videoId: integer("video_id").primaryKey().references(() => videos.id, { onDelete: "cascade" }),
    source: transcriptSource("source").notNull(),
    visibility: transcriptVisibility("visibility").notNull().default("private"),
    sharingPermission: sharingPermission("sharing_permission").notNull().default("unknown"),
    segments: jsonb("segments").$type<TranscriptSegment[]>().notNull(),
    permissionNote: text("permission_note"),
    attribution: text("attribution"),
    licenseUrl: text("license_url"),
    createdAt: time("created_at").notNull().defaultNow(),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  () => [
    check("transcript_segments_array", sql`jsonb_typeof(segments) = 'array'`),
    check("transcript_grant_evidence", sql`sharing_permission <> 'granted' OR (permission_note IS NOT NULL AND length(trim(permission_note)) > 0)`),
    check("transcript_public_attribution", sql`visibility <> 'public' OR (attribution IS NOT NULL AND length(trim(attribution)) > 0)`),
  ],
);
export const videoInterests = pgTable(
  "video_interests",
  {
    videoId: integer("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    interestId: integer("interest_id")
      .notNull()
      .references(() => interests.id, { onDelete: "restrict" }),
    source: membershipSource("source").notNull(),
    reviewed: boolean("reviewed").notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.videoId, t.interestId] }),
    index("video_interests_interest_video").on(t.interestId, t.videoId),
  ],
);
export const videoSubtopics = pgTable(
  "video_subtopics",
  {
    videoId: integer("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    subtopicId: integer("subtopic_id")
      .notNull()
      .references(() => subtopics.id, { onDelete: "restrict" }),
  },
  (t) => [primaryKey({ columns: [t.videoId, t.subtopicId] })],
);
export const ingestionRuns = pgTable("ingestion_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: runKind("kind").notNull(),
  startedAt: time("started_at").notNull().defaultNow(),
  completedAt: time("completed_at"),
  status: runStatus("status").notNull().default("running"),
  queryCount: integer("query_count").notNull().default(0),
  requestCount: integer("request_count").notNull().default(0),
  candidatesCount: integer("candidates_count").notNull().default(0),
  insertedCount: integer("inserted_count").notNull().default(0),
  updatedCount: integer("updated_count").notNull().default(0),
  duplicateCount: integer("duplicate_count").notNull().default(0),
  rejectedCount: integer("rejected_count").notNull().default(0),
  deletedCount: integer("deleted_count").notNull().default(0),
  errorMessage: text("error_message"),
});
export const videoSources = pgTable(
  "video_sources",
  {
    videoId: integer("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    ingestionRunId: uuid("ingestion_run_id")
      .notNull()
      .references(() => ingestionRuns.id, { onDelete: "cascade" }),
    sourceKind: sourceKind("source_kind").notNull(),
    sourceKey: text("source_key").notNull(),
    queryText: text("query_text"),
    interestId: integer("interest_id").references(() => interests.id, {
      onDelete: "restrict",
    }),
    discoveredAt: time("discovered_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("video_source_run_key").on(
      t.videoId,
      t.ingestionRunId,
      t.sourceKey,
    ),
  ],
);
