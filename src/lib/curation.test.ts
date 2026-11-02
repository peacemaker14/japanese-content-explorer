import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { hasTestDatabase, withTestDatabase } from "../../tests/database";
import {
  applyCuration,
  catalogReport,
  exportCuration,
  validateCuration,
  type CurationDecision,
} from "./curation";
import { getVideo, listVideos } from "./catalog-core";
import { parseCatalogFilters } from "./catalog-filters";
function decision(overrides: Partial<CurationDecision> = {}): CurationDecision {
  return {
    youtubeId: "abcdefghijk",
    status: "published",
    interests: ["gaming"],
    subtopics: ["gaming/reviews"],
    format: "review",
    languageStatus: "verified_ja",
    difficulty: "unassessed",
    reviewNote:
      "I watched the introduction and heard the presenter speaking Japanese.",
    ...overrides,
  };
}
async function video(pool: Pool, id = "abcdefghijk") {
  await pool.query(
    `INSERT INTO videos(youtube_id,title,description,channel_id,channel_title,published_at,duration_seconds,view_count,embeddable,made_for_kids,default_audio_language,language_status)
    VALUES ($1,'Original title','Original description','channel','Original channel',now(),600,9007199254740993,true,false,'ja','likely_ja')`,
    [id],
  );
}
describe("curation validation", () => {
  it.each([
    decision({ interests: ["unknown"] }),
    decision({ subtopics: ["gaming/unknown"] }),
    decision({ interests: ["food-cooking"] }),
    decision({ reviewNote: "  " }),
    decision({ languageStatus: "unverified" }),
    decision({ interests: [], subtopics: [] }),
    { ...decision(), status: "automatic" },
    { ...decision(), format: "lesson" },
    { ...decision(), youtubeId: "" },
    { ...decision(), languageStatus: "japanese-title" },
    { ...decision(), difficulty: "fluent" },
  ])("rejects invalid decisions %j", (entry) => {
    expect(() => validateCuration([entry])).toThrow();
  });
  it("rejects duplicate IDs", () => {
    expect(() => validateCuration([decision(), decision()])).toThrow(
      "Duplicate video ID",
    );
  });
});
describe.skipIf(!hasTestDatabase)("atomic database curation", () => {
  it("validates an entire file before mutation, including absent IDs and DB-backed eligibility", async () => {
    await withTestDatabase(async (pool) => {
      await video(pool);
      await expect(
        applyCuration(
          [decision(), decision({ youtubeId: "zzzzzzzzzzz" })],
          pool,
        ),
      ).rejects.toThrow("Unknown video ID");
      expect(
        (await pool.query("SELECT status,reviewed_at FROM videos")).rows[0],
      ).toMatchObject({ status: "candidate", reviewed_at: null });
      expect(
        (await pool.query("SELECT * FROM video_interests")).rows,
      ).toHaveLength(0);
      await expect(
        applyCuration(
          [
            decision(),
            decision({ youtubeId: "zzzzzzzzzzz", interests: ["unknown"] }),
          ],
          pool,
        ),
      ).rejects.toThrow();
      expect(
        (await pool.query("SELECT status FROM videos")).rows[0].status,
      ).toBe("candidate");
      await video(pool, "zzzzzzzzzzz");
      await pool.query(
        `UPDATE videos SET metadata_updated_at=now()-interval '29 days' WHERE youtube_id='zzzzzzzzzzz'`,
      );
      await expect(
        applyCuration(
          [decision(), decision({ youtubeId: "zzzzzzzzzzz" })],
          pool,
        ),
      ).rejects.toThrow("stale");
      expect(
        (
          await pool.query(
            `SELECT count(*)::integer AS count FROM videos WHERE status='published'`,
          )
        ).rows[0].count,
      ).toBe(0);
    });
  });
  it("requires actual API language metadata for likely Japanese and current embeddability", async () => {
    await withTestDatabase(async (pool) => {
      await video(pool);
      await pool.query("UPDATE videos SET default_audio_language=NULL");
      await expect(
        applyCuration([decision({ languageStatus: "likely_ja" })], pool),
      ).rejects.toThrow("creator-provided");
      await pool.query("UPDATE videos SET embeddable=false");
      await expect(applyCuration([decision()], pool)).rejects.toThrow(
        "not embeddable",
      );
      await applyCuration(
        [decision({ status: "hidden", languageStatus: "unverified" })],
        pool,
      );
      expect(
        (await pool.query("SELECT status FROM videos")).rows[0].status,
      ).toBe("hidden");
    });
  });
  it("is membership-idempotent, ignores contextual writes, and hides from listing and detail", async () => {
    await withTestDatabase(async (pool) => {
      await video(pool);
      const input = [
        {
          ...decision(),
          context: { title: "Tampered" },
          title: "Tampered",
        },
      ];
      expect(await applyCuration(input, pool)).toEqual({ applied: 1 });
      expect(await applyCuration(input, pool)).toEqual({ applied: 1 });
      expect(
        (await pool.query("SELECT * FROM video_interests")).rows,
      ).toHaveLength(1);
      expect(
        (await pool.query("SELECT * FROM video_subtopics")).rows,
      ).toHaveLength(1);
      expect(
        (await pool.query("SELECT source,reviewed FROM video_interests"))
          .rows[0],
      ).toEqual({ source: "manual", reviewed: true });
      expect((await pool.query("SELECT title FROM videos")).rows[0]).toEqual({
        title: "Original title",
      });
      expect((await listVideos(parseCatalogFilters({}), pool)).total).toBe(1);
      expect(await getVideo("abcdefghijk", pool)).not.toBeNull();
      const exported = (await exportCuration(
        "published",
        pool,
      )) as (CurationDecision & {
        context: { title: string; watchUrl: string };
      })[];
      expect(exported[0]).toMatchObject({
        status: "published",
        interests: ["gaming"],
        subtopics: ["gaming/reviews"],
        context: {
          title: "Original title",
          watchUrl: "https://www.youtube.com/watch?v=abcdefghijk",
        },
      });
      await applyCuration([decision({ status: "hidden" })], pool);
      expect((await listVideos(parseCatalogFilters({}), pool)).total).toBe(0);
      expect(await getVideo("abcdefghijk", pool)).toBeNull();
    });
  });
  it("applies difficulty assessments atomically and can withdraw them without unpublishing", async () => {
    await withTestDatabase(async (pool) => {
      await video(pool);
      await video(pool, "zzzzzzzzzzz");
      await expect(
        applyCuration(
          [
            decision({ difficulty: "beginner" }),
            { ...decision({ youtubeId: "zzzzzzzzzzz" }), difficulty: "fluent" },
          ],
          pool,
        ),
      ).rejects.toThrow();
      expect(
        (await pool.query("SELECT DISTINCT difficulty,status FROM videos"))
          .rows,
      ).toEqual([{ difficulty: "unassessed", status: "candidate" }]);
      const missing: Partial<CurationDecision> = decision();
      delete missing.difficulty;
      await expect(applyCuration([missing], pool)).rejects.toThrow();
      await applyCuration([decision({ difficulty: "intermediate" })], pool);
      expect(await getVideo("abcdefghijk", pool)).toMatchObject({
        difficulty: "intermediate",
      });
      expect((await exportCuration("published", pool))[0]).toMatchObject({
        difficulty: "intermediate",
      });
      expect(
        (
          await listVideos(
            parseCatalogFilters({ difficulty: "intermediate" }),
            pool,
          )
        ).items.map((v) => v.youtubeId),
      ).toEqual(["abcdefghijk"]);
      await applyCuration([decision({ difficulty: "unassessed" })], pool);
      expect(
        (
          await listVideos(
            parseCatalogFilters({ difficulty: "intermediate" }),
            pool,
          )
        ).total,
      ).toBe(0);
      expect(
        (
          await listVideos(
            parseCatalogFilters({ difficulty: "unassessed" }),
            pool,
          )
        ).items.map((v) => v.youtubeId),
      ).toEqual(["abcdefghijk"]);
    });
  });
  it("reports distinct publication totals separately from memberships and channel repetition", async () => {
    await withTestDatabase(async (pool) => {
      await video(pool);
      await video(pool, "zzzzzzzzzzz");
      await applyCuration(
        [
          decision({ interests: ["gaming", "food-cooking"] }),
          decision({ youtubeId: "zzzzzzzzzzz" }),
        ],
        pool,
      );
      const report = await catalogReport(pool);
      expect(report.distinctVideos).toEqual({
        candidate: 0,
        published: 2,
        hidden: 0,
      });
      expect(
        report.publishedByInterest.find((row) => row.slug === "gaming")
          .publishedVideos,
      ).toBe(2);
      expect(
        report.publishedByInterest.find((row) => row.slug === "food-cooking")
          .publishedVideos,
      ).toBe(1);
      expect(report.channelRepetition).toEqual([
        {
          interest: "gaming",
          channelId: "channel",
          channelTitle: "Original channel",
          publishedVideos: 2,
        },
      ]);
    });
  });
});
