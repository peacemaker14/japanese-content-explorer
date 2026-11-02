import { describe, it, expect } from "vitest";
import type { Pool } from "pg";
import { withTestDatabase, hasTestDatabase } from "../../tests/database";
import { refreshMetadata } from "./metadata-maintenance";
import { GET } from "../app/api/cron/refresh-metadata/route";

const video = (id: string) => ({
  id,
  snippet: {
    title: "更新した日本語動画",
    description: "Description",
    channelId: "UCfixture",
    channelTitle: "Channel",
    publishedAt: "2026-01-01T00:00:00Z",
    defaultAudioLanguage: "ja",
  },
  contentDetails: { duration: "PT10M" },
  statistics: { viewCount: "9007199254740993" },
  status: { privacyStatus: "public", embeddable: true, madeForKids: false },
});
async function insert(pool: Pool, id: string, age: number) {
  await pool.query(
    "INSERT INTO videos(youtube_id,title,description,channel_id,channel_title,published_at,duration_seconds,embeddable,made_for_kids,language_status,status,format,review_note,metadata_updated_at) VALUES($1,'Original','Description','UCfixture','Channel',now(),600,true,false,'verified_ja','hidden','review','Observed Japanese speech',clock_timestamp()-$2*interval '1 day')",
    [id, age],
  );
}

describe.skipIf(!hasTestDatabase)(
  "metadata maintenance with PostgreSQL",
  () => {
    it("deletes successful omissions and cascades membership", async () =>
      withTestDatabase(async (pool) => {
        await insert(pool, "abcdefghijk", 8);
        await pool.query(
          "INSERT INTO video_interests(video_id,interest_id,source,reviewed) SELECT v.id,i.id,'manual',true FROM videos v CROSS JOIN interests i LIMIT 1",
        );
        const result = await refreshMetadata({
          pool,
          client: { requestCount: 1, videos: async () => [] },
        });
        expect(result).toMatchObject({ status: "succeeded", deletedCount: 1 });
        expect((await pool.query("SELECT * FROM videos")).rowCount).toBe(0);
        expect(
          (await pool.query("SELECT * FROM video_interests")).rowCount,
        ).toBe(0);
      }));
    it("purges expired records even when API requests fail, retaining fresher rows", async () =>
      withTestDatabase(async (pool) => {
        await insert(pool, "abcdefghijk", 8);
        await insert(pool, "12345678901", 30);
        const result = await refreshMetadata({
          pool,
          client: {
            requestCount: 1,
            videos: async () => {
              throw new Error("API unavailable");
            },
          },
        });
        expect(result).toMatchObject({ status: "partial", deletedCount: 1 });
        expect(
          (await pool.query("SELECT youtube_id FROM videos")).rows,
        ).toEqual([{ youtube_id: "abcdefghijk" }]);
        expect(
          (await pool.query("SELECT status FROM ingestion_runs")).rows,
        ).toEqual([{ status: "partial" }]);
      }));
    it("refreshes exact microsecond timestamps without changing editorial fields", async () =>
      withTestDatabase(async (pool) => {
        await insert(pool, "abcdefghijk", 8);
        await pool.query(
          "UPDATE videos SET metadata_updated_at='2026-01-01T01:02:03.123456Z'",
        );
        const result = await refreshMetadata({
          pool,
          client: {
            requestCount: 1,
            videos: async () => [video("abcdefghijk")],
          },
        });
        expect(result).toMatchObject({ updatedCount: 1, deletedCount: 0 });
        const row = (
          await pool.query(
            "SELECT title,status,format,review_note,language_status,view_count::text FROM videos",
          )
        ).rows[0];
        expect(row).toEqual({
          title: "更新した日本語動画",
          status: "hidden",
          format: "review",
          review_note: "Observed Japanese speech",
          language_status: "verified_ja",
          view_count: "9007199254740993",
        });
      }));
    it("does not delete metadata refreshed concurrently after selection", async () =>
      withTestDatabase(async (pool) => {
        await insert(pool, "abcdefghijk", 8);
        const result = await refreshMetadata({
          pool,
          client: {
            requestCount: 1,
            videos: async () => {
              await pool.query(
                "UPDATE videos SET metadata_updated_at=clock_timestamp(),title='Newer ingestion'",
              );
              return [];
            },
          },
        });
        expect(result).toMatchObject({ deletedCount: 0 });
        expect((await pool.query("SELECT title FROM videos")).rows).toEqual([
          { title: "Newer ingestion" },
        ]);
      }));
    it("skips a competing maintenance invocation without creating a run", async () =>
      withTestDatabase(async (pool) => {
        const lock = await pool.connect();
        try {
          await lock.query("BEGIN");
          await lock.query("SELECT pg_advisory_xact_lock(72654321)");
          expect(await refreshMetadata({ pool })).toEqual({ skipped: true });
          expect(
            (await pool.query("SELECT * FROM ingestion_runs")).rowCount,
          ).toBe(0);
        } finally {
          await lock.query("ROLLBACK");
          lock.release();
        }
      }));
    it("does not count mutations rolled back by a later batch error", async () =>
      withTestDatabase(async (pool) => {
        await insert(pool, "abcdefghijk", 8);
        await insert(pool, "12345678901", 8);
        await pool.query(
          "CREATE FUNCTION reject_second_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.youtube_id='12345678901' THEN RAISE EXCEPTION 'Isolated rollback scenario'; END IF; RETURN NEW; END $$",
        );
        await pool.query(
          "CREATE TRIGGER reject_second_update BEFORE UPDATE ON videos FOR EACH ROW EXECUTE FUNCTION reject_second_update()",
        );
        await expect(
          refreshMetadata({
            pool,
            client: {
              requestCount: 1,
              videos: async () => [video("abcdefghijk"), video("12345678901")],
            },
          }),
        ).rejects.toThrow("Isolated rollback scenario");
        expect(
          (await pool.query("SELECT DISTINCT title FROM videos")).rows,
        ).toEqual([{ title: "Original" }]);
        expect(
          (
            await pool.query(
              "SELECT status,updated_count,deleted_count FROM ingestion_runs",
            )
          ).rows,
        ).toEqual([{ status: "failed", updated_count: 0, deleted_count: 0 }]);
      }));
  },
);

it("rejects unauthenticated cron before database configuration is needed", async () => {
  const response = await GET(
    new Request("http://localhost/api/cron/refresh-metadata"),
  );
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: "Unauthorized" });
});
