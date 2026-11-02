import { describe, expect, it, vi } from "vitest";
import { hasTestDatabase, withTestDatabase } from "../../tests/database";
import {
  collectVideos,
  importTomboManifest,
  tomboJapaneseIds,
  validateCollectionOptions,
  type IngestionClient,
} from "./ingestion";
import { YouTubeApiError } from "./youtube/client";

function raw(id: string, title = "APIの元のタイトル") {
  return {
    id,
    snippet: {
      title,
      description: "API description",
      channelId: "UCtest",
      channelTitle: "Channel",
      publishedAt: "2026-01-01T00:00:00Z",
      defaultAudioLanguage: "ja",
    },
    contentDetails: { duration: "PT10M" },
    statistics: { viewCount: "9007199254740993" },
    status: { privacyStatus: "public", embeddable: true, madeForKids: false },
  };
}
function clientWith(ids: string[]): IngestionClient {
  return {
    requestCount: 0,
    async search() {
      this.requestCount++;
      return { ids };
    },
    async videos(requested) {
      this.requestCount++;
      return requested.map((id) => raw(id));
    },
  };
}

describe("collection inputs", () => {
  it("rejects unsupported interests and page bounds before work", () => {
    expect(() => validateCollectionOptions("unknown", 1)).toThrow(
      "Unknown interest",
    );
    for (const pages of [0, 4, 1.5, NaN])
      expect(() => validateCollectionOptions("all", pages)).toThrow(
        "integer from 1 to 3",
      );
    expect(() => validateCollectionOptions("gaming", 3)).not.toThrow();
  });
  it("allowlists only Japanese public reference IDs, retaining occurrences for accounting", () => {
    expect(
      tomboJapaneseIds([
        { language: "en", youtube_id: "not-valid" },
        {
          language: "ja",
          youtube_id: "abcdefghijk",
          title: "old title",
          levels: ["N1"],
          curation: { ignored: true },
        },
        { language: "ja", youtube_id: "abcdefghijk" },
      ]),
    ).toEqual(["abcdefghijk", "abcdefghijk"]);
    expect(() => tomboJapaneseIds([{ language: "ja" }])).toThrow(
      "invalid youtube_id",
    );
    expect(() => tomboJapaneseIds({ videos: [] })).toThrow("array");
  });
});

describe.skipIf(!hasTestDatabase)("collection with isolated PostgreSQL", () => {
  it("deduplicates enrichment, retains both sources and never undoes manual correction/publication", async () => {
    await withTestDatabase(async (pool) => {
      const client = clientWith(["abcdefghijk"]);
      const videos = vi.spyOn(client, "videos");
      const first = await collectVideos({
        pool,
        client,
        interest: "cars-driving",
      });
      expect(first).toMatchObject({
        status: "succeeded",
        queryCount: 2,
        requestCount: 3,
        candidatesCount: 2,
        insertedCount: 1,
        updatedCount: 0,
        duplicateCount: 1,
        rejectedCount: 0,
      });
      expect(videos).toHaveBeenCalledTimes(1);
      expect(videos.mock.calls[0][0]).toEqual(["abcdefghijk"]);
      const {
        rows: [video],
      } = await pool.query("SELECT * FROM videos");
      expect(video).toMatchObject({
        status: "candidate",
        view_count: "9007199254740993",
        difficulty: "unassessed",
        language_status: "likely_ja",
      });
      expect(
        (await pool.query("SELECT count(*)::int AS count FROM video_sources"))
          .rows[0].count,
      ).toBe(2);
      await pool.query("DELETE FROM video_interests WHERE video_id=$1", [
        video.id,
      ]);
      await pool.query(
        `INSERT INTO video_interests(video_id,interest_id,source,reviewed) SELECT $1,id,'manual',true FROM interests WHERE slug='gaming'`,
        [video.id],
      );
      await pool.query(
        `INSERT INTO video_subtopics(video_id,subtopic_id) SELECT $1,s.id FROM subtopics s JOIN interests i ON i.id=s.interest_id WHERE i.slug='gaming' AND s.slug='reviews'`,
        [video.id],
      );
      await pool.query(
        `UPDATE videos SET status='published', language_status='verified_ja', difficulty='intermediate', format='review', reviewed_at=now(),review_note='Observed Japanese speech.' WHERE id=$1`,
        [video.id],
      );
      client.videos = async (ids) => {
        client.requestCount++;
        return ids.map((id) => ({
          ...raw(id, "Updated API title"),
          snippet: {
            ...raw(id).snippet,
            title: "Updated API title",
            defaultAudioLanguage: "en",
          },
        }));
      };
      const rerun = await collectVideos({
        pool,
        client,
        interest: "cars-driving",
      });
      expect(rerun).toMatchObject({
        status: "succeeded",
        insertedCount: 0,
        updatedCount: 1,
        candidatesCount: 2,
        duplicateCount: 1,
      });
      expect((await pool.query("SELECT * FROM videos")).rows[0]).toMatchObject({
        title: "Updated API title",
        status: "published",
        language_status: "verified_ja",
        format: "review",
        review_note: "Observed Japanese speech.",
        difficulty: "intermediate",
      });
      expect(
        (
          await pool.query(
            "SELECT i.slug,vi.source,vi.reviewed FROM video_interests vi JOIN interests i ON i.id=vi.interest_id",
          )
        ).rows,
      ).toEqual([{ slug: "gaming", source: "manual", reviewed: true }]);
      expect(
        (await pool.query("SELECT count(*)::int AS count FROM video_subtopics"))
          .rows[0].count,
      ).toBe(1);
      expect(
        (await pool.query("SELECT count(*)::int AS count FROM video_sources"))
          .rows[0].count,
      ).toBe(4);
    });
  });
  it("defaults to exactly ten seeded searches, bounds pages and keeps unique query provenance", async () => {
    await withTestDatabase(async (pool) => {
      const empty = clientWith([]);
      const search = vi.spyOn(empty, "search");
      const videos = vi.spyOn(empty, "videos");
      const first = await collectVideos({ pool, client: empty });
      expect(first).toMatchObject({
        status: "succeeded",
        queryCount: 10,
        requestCount: 10,
        candidatesCount: 0,
      });
      expect(search).toHaveBeenCalledTimes(10);
      expect(videos).not.toHaveBeenCalled();
      const paginated = clientWith(["abcdefghijk"]);
      paginated.search = async () => {
        paginated.requestCount++;
        return { ids: ["abcdefghijk"], nextPageToken: "more-pages" };
      };
      const bounded = await collectVideos({
        pool,
        client: paginated,
        interest: "cars-driving",
        pagesPerQuery: 3,
      });
      expect(bounded).toMatchObject({
        queryCount: 6,
        candidatesCount: 6,
        insertedCount: 1,
        duplicateCount: 5,
        requestCount: 7,
      });
      expect(
        (
          await pool.query(
            "SELECT source_key,query_text FROM video_sources ORDER BY query_text",
          )
        ).rows,
      ).toHaveLength(2);
    });
  });
  it("uses fresh metadata for imported IDs, no query suggestions and distinct rejection counts", async () => {
    await withTestDatabase(async (pool) => {
      const client = clientWith([]);
      client.videos = async () => {
        client.requestCount++;
        return [
          raw("abcdefghijk"),
          { ...raw("outofrange1"), contentDetails: { duration: "PT21M" } },
        ];
      };
      const result = await importTomboManifest(
        [
          {
            language: "ja",
            youtube_id: "abcdefghijk",
            title: "DO NOT IMPORT",
            topics: ["cars-driving"],
            language_status: "verified_ja",
          },
          { language: "ja", youtube_id: "abcdefghijk" },
          { language: "ja", youtube_id: "outofrange1" },
          { language: "ja", youtube_id: "unavailable" },
          { language: "en", youtube_id: "english0001" },
        ],
        { pool, client },
      );
      expect(result).toMatchObject({
        status: "succeeded",
        candidatesCount: 4,
        duplicateCount: 1,
        insertedCount: 1,
        rejectedCount: 2,
        queryCount: 0,
        requestCount: 1,
      });
      expect(
        (await pool.query("SELECT title,status,language_status FROM videos"))
          .rows,
      ).toEqual([
        {
          title: "APIの元のタイトル",
          status: "candidate",
          language_status: "likely_ja",
        },
      ]);
      expect((await pool.query("SELECT * FROM video_interests")).rows).toEqual(
        [],
      );
      expect(
        (
          await pool.query(
            "SELECT source_kind,source_key,query_text,interest_id FROM video_sources",
          )
        ).rows,
      ).toEqual([
        {
          source_kind: "tombo_manifest",
          source_key: "tombo:catalog.json",
          query_text: null,
          interest_id: null,
        },
      ]);
    });
  });
  it("preserves committed batches and persists sanitized partial outcomes on later API failure", async () => {
    await withTestDatabase(async (pool) => {
      const ids = Array.from(
        { length: 51 },
        (_, index) => `v${String(index).padStart(10, "0")}`,
      );
      const client = clientWith([]);
      client.videos = async (requested) => {
        client.requestCount++;
        if (client.requestCount === 2)
          throw new YouTubeApiError("quotaExceeded", 403);
        return requested.map((id) => raw(id));
      };
      const result = await importTomboManifest(
        ids.map((youtube_id) => ({ language: "ja", youtube_id })),
        { pool, client },
      );
      expect(result).toMatchObject({
        status: "partial",
        candidatesCount: 51,
        insertedCount: 50,
        rejectedCount: 0,
        requestCount: 2,
        errorMessage: "YouTube API: quotaExceeded",
      });
      expect(
        (await pool.query("SELECT count(*)::int AS count FROM videos")).rows[0]
          .count,
      ).toBe(50);
      const run = (
        await pool.query("SELECT * FROM ingestion_runs WHERE id=$1", [
          result.runId,
        ])
      ).rows[0];
      expect(run).toMatchObject({
        status: "partial",
        candidates_count: 51,
        inserted_count: 50,
        request_count: 2,
        error_message: "YouTube API: quotaExceeded",
      });
      expect(run.completed_at).not.toBeNull();
    });
  });
  it("rolls back every write in a failing batch and does not count uncommitted inserts", async () => {
    await withTestDatabase(async (pool) => {
      await pool.query(
        `CREATE FUNCTION reject_test_video() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.youtube_id='reject00001' THEN RAISE EXCEPTION 'secret database message'; END IF; RETURN NEW; END $$`,
      );
      await pool.query(
        "CREATE TRIGGER reject_test_video BEFORE INSERT ON videos FOR EACH ROW EXECUTE FUNCTION reject_test_video()",
      );
      const result = await importTomboManifest(
        [
          { language: "ja", youtube_id: "abcdefghijk" },
          { language: "ja", youtube_id: "reject00001" },
        ],
        { pool, client: clientWith([]) },
      );
      expect(result).toMatchObject({
        status: "failed",
        insertedCount: 0,
        updatedCount: 0,
        rejectedCount: 0,
      });
      expect(result.errorMessage).not.toContain("secret");
      expect((await pool.query("SELECT * FROM videos")).rows).toHaveLength(0);
      expect(
        (await pool.query("SELECT * FROM video_sources")).rows,
      ).toHaveLength(0);
    });
  });
});
