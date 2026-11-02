import { sql } from "drizzle-orm";
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
    index("videos_status_publication").on(t.status, t.publishedAt),
    index("videos_status_views").on(t.status, t.viewCount),
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
