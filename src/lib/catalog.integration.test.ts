import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { hasTestDatabase, withTestDatabase } from "../../tests/database";
import { getSavedVideos, getVideo, listCategories, listVideos } from "./catalog-core";
import { parseCatalogFilters } from "./catalog-filters";
import type { Difficulty } from "./difficulty";
import { applyTranscripts } from "./transcripts-core";

async function fixture(
  pool: Pool,
  n: number,
  options: {
    duration?: number;
    views?: string | null;
    title?: string;
    age?: number;
    status?: string;
    interests?: string[];
    subtopic?: string;
    manual?: boolean;
    embeddable?: boolean;
    difficulty?: Difficulty;
    publishedAt?: string;
  } = {},
) {
  const youtubeId = `v${String(n).padStart(10, "0")}`;
  const {
    rows: [row],
  } = await pool.query(
    `INSERT INTO videos (youtube_id,title,description,channel_id,channel_title,published_at,duration_seconds,view_count,status,embeddable,metadata_updated_at,default_audio_language,language_status,made_for_kids,difficulty)
    VALUES ($1,$2,'Description','channel','Channel',$9, $3,$4,$5,$6,now()-($7::integer * interval '1 day'),'ja','likely_ja',false,$8) RETURNING id`,
    [
      youtubeId,
      options.title ?? `Video ${n}`,
      options.duration ?? 600,
      options.views === undefined ? "10" : options.views,
      options.status ?? "published",
      options.embeddable ?? true,
      options.age ?? 0,
      options.difficulty ?? "unassessed",
      options.publishedAt ?? "2026-01-01",
    ],
  );
  for (const slug of options.interests ?? ["gaming"])
    await pool.query(
      `INSERT INTO video_interests (video_id,interest_id,source,reviewed) SELECT $1,id,$3,$4 FROM interests WHERE slug=$2`,
      [
        row.id,
        slug,
        options.manual === false ? "query" : "manual",
        options.manual !== false,
      ],
    );
  if (options.subtopic)
    await pool.query(
      `INSERT INTO video_subtopics(video_id,subtopic_id) SELECT $1,s.id FROM subtopics s JOIN interests i ON i.id=s.interest_id WHERE i.slug || '/' || s.slug=$2`,
      [row.id, options.subtopic],
    );
  return youtubeId;
}
describe.skipIf(!hasTestDatabase)("public catalog database behavior", () => {
  it("counts distinct videos across memberships and clamps pages with stable tied ordering", async () => {
    await withTestDatabase(async (pool) => {
      for (let n = 1; n <= 21; n++)
        await fixture(pool, n, { interests: ["gaming", "food-cooking"] });
      const first = await listVideos(
        parseCatalogFilters({ interest: ["gaming", "food-cooking"] }),
        pool,
      );
      expect(first.total).toBe(21);
      expect(first.items).toHaveLength(20);
      expect(first.pageSize).toBe(20);
      expect(first.totalPages).toBe(2);
      expect(first.items[0].youtubeId).toBe("v0000000001");
      const last = await listVideos(parseCatalogFilters({ page: "99" }), pool);
      expect(last.page).toBe(2);
      expect(last.items.map((v) => v.youtubeId)).toEqual(["v0000000021"]);
      expect(first.items[0].publishedAt).toBe("2026-01-01T00:00:00.000Z");
      expect(first.items[0].interests).toHaveLength(2);
    });
  });
  it("sorts exact bigint popularity with nulls last and stable ID tie breaks", async () => {
    await withTestDatabase(async (pool) => {
      await fixture(pool, 1, { views: null });
      await fixture(pool, 2, { views: "9007199254740993" });
      await fixture(pool, 3, { views: "9007199254740993" });
      const result = await listVideos(
        parseCatalogFilters({ sort: "popular" }),
        pool,
      );
      expect(result.items.map((v) => v.youtubeId)).toEqual([
        "v0000000002",
        "v0000000003",
        "v0000000001",
      ]);
      expect(result.items[0].viewCount).toBe("9007199254740993");
      expect(result.items[2].viewCount).toBeNull();
    });
  });
  it("features only public granted transcripts with stable date/ID ties and leaves explicit sorts unchanged", async () => {
    await withTestDatabase(async (pool) => {
      const absent = await fixture(pool, 1, { publishedAt: "2026-05-01", views: "1000" });
      const privateUnknown = await fixture(pool, 2, { publishedAt: "2026-04-01", views: "900" });
      const privateGranted = await fixture(pool, 3, { publishedAt: "2026-03-01", views: "800" });
      const publicUnknown = await fixture(pool, 4, { publishedAt: "2026-02-01", views: "700" });
      const shared = await fixture(pool, 5);
      const sharedTie = await fixture(pool, 6);
      const sharedOlder = await fixture(pool, 7, {
        publishedAt: "2025-12-01",
        interests: ["food-cooking"],
        subtopic: "food-cooking/coffee",
        duration: 599,
        difficulty: "beginner",
      });
      const transcript = (videoId: string) => ({
        videoId,
        source: "creator_provided",
        segments: [{ start: 0, end: 2, text: "Test transcript body, not card data" }],
      });
      await applyTranscripts([
        transcript(privateUnknown),
        { ...transcript(privateGranted), sharingPermission: "granted", permissionNote: "Test-only rights evidence" },
        { ...transcript(publicUnknown), visibility: "public", attribution: "Test creator" },
        ...[shared, sharedTie, sharedOlder].map((id) => ({
          ...transcript(id), visibility: "public", sharingPermission: "granted",
          permissionNote: "Test-only rights evidence", attribution: "Test creator",
        })),
      ], pool);

      const featured = await listVideos(parseCatalogFilters({}), pool);
      expect(featured.items.map((video) => [video.youtubeId, video.hasSharedTranscript])).toEqual([
        [shared, true], [sharedTie, true], [sharedOlder, true],
        [absent, false], [privateUnknown, false], [privateGranted, false], [publicUnknown, false],
      ]);
      expect(featured.total).toBe(7);
      for (const sort of ["newest", "popular"]) {
        const explicit = await listVideos(parseCatalogFilters({ sort }), pool);
        expect(explicit.items.map((video) => video.youtubeId)).toEqual([
          absent, privateUnknown, privateGranted, publicUnknown, shared, sharedTie, sharedOlder,
        ]);
      }
      expect((await listVideos(parseCatalogFilters({ transcript: "available" }), pool)).items.map((video) => video.youtubeId))
        .toEqual([shared, sharedTie, sharedOlder]);
      expect((await listVideos(parseCatalogFilters({ transcript: "unavailable" }), pool)).items.map((video) => video.youtubeId))
        .toEqual([absent, privateUnknown, privateGranted, publicUnknown]);
      const combined = parseCatalogFilters({
        transcript: "available", interest: "food-cooking", subtopic: "food-cooking/coffee",
        duration: "under-10", difficulty: "beginner", q: "Video 7",
      });
      expect((await listVideos(combined, pool)).items.map((video) => video.youtubeId)).toEqual([sharedOlder]);
      expect((await listVideos({ ...combined, transcript: "unavailable" }, pool)).total).toBe(0);
      const saved = await getSavedVideos([publicUnknown, sharedOlder, privateGranted, sharedTie, privateUnknown, shared, absent], pool);
      expect(saved.map((video) => video.hasSharedTranscript)).toEqual([false, true, false, true, false, true, false]);
      for (const video of [...featured.items, ...saved]) {
        expect(video).not.toHaveProperty("segments");
        expect(video).not.toHaveProperty("permissionNote");
        expect(JSON.stringify(video)).not.toContain("Test transcript body");
        expect(JSON.stringify(video)).not.toContain("Test-only rights evidence");
      }

      await applyTranscripts([transcript(shared)], pool);
      expect((await listVideos(parseCatalogFilters({}), pool)).items.map((video) => video.youtubeId))
        .toEqual([sharedTie, sharedOlder, absent, privateUnknown, privateGranted, publicUnknown, shared]);
      expect((await getSavedVideos([shared], pool))[0].hasSharedTranscript).toBe(false);
    });
  });
  it("applies OR within groups, AND across groups, literal keyword escaping and 600-second boundary", async () => {
    await withTestDatabase(async (pool) => {
      await fixture(pool, 1, {
        title: "100% _ \\ coffee",
        interests: ["food-cooking"],
        subtopic: "food-cooking/coffee",
        duration: 599,
      });
      await fixture(pool, 2, {
        title: "100X other",
        interests: ["food-cooking"],
        subtopic: "food-cooking/cafes",
        duration: 600,
      });
      await fixture(pool, 3, {
        title: "Other",
        interests: ["gaming"],
        subtopic: "gaming/reviews",
        duration: 600,
      });
      for (const q of ["%", "_", "\\"]) {
        const result = await listVideos(parseCatalogFilters({ q }), pool);
        expect(result.items.map((v) => v.youtubeId)).toEqual(["v0000000001"]);
      }
      const result = await listVideos(
        parseCatalogFilters({
          interest: ["gaming", "food-cooking"],
          subtopic: ["food-cooking/coffee", "food-cooking/cafes"],
          duration: "10-plus",
        }),
        pool,
      );
      expect(result.items.map((v) => v.youtubeId)).toEqual(["v0000000002"]);
      const short = await listVideos(
        parseCatalogFilters({ duration: "under-10" }),
        pool,
      );
      expect(short.items.map((v) => v.youtubeId)).toEqual(["v0000000001"]);
      expect(
        (
          await listVideos(
            parseCatalogFilters({
              interest: "gaming",
              subtopic: "food-cooking/coffee",
            }),
            pool,
          )
        ).total,
      ).toBe(0);
    });
  });
  it("uses the same publication boundary for detail and list, with qualified reviewed labels", async () => {
    await withTestDatabase(async (pool) => {
      const visible = await fixture(pool, 1, { subtopic: "gaming/reviews" });
      const hidden = [
        await fixture(pool, 2, { status: "candidate" }),
        await fixture(pool, 3, { status: "hidden" }),
        await fixture(pool, 4, { age: 29 }),
        await fixture(pool, 5, { manual: false }),
        await fixture(pool, 6, { embeddable: false }),
        await fixture(pool, 7, { interests: [] }),
      ];
      const result = await listVideos(parseCatalogFilters({}), pool);
      expect(result.total).toBe(1);
      const detail = await getVideo(visible, pool);
      expect(detail?.subtopics).toEqual([
        { slug: "gaming/reviews", name: "Reviews" },
      ]);
      expect(detail?.madeForKids).toBe(false);
      expect(detail?.languageStatus).toBe("likely_ja");
      for (const id of [...hidden, "malformed", "xxxxxxxxxxx"])
        expect(await getVideo(id, pool)).toBeNull();
      const empty = await listVideos(
        parseCatalogFilters({ q: "no matches", page: "99" }),
        pool,
      );
      expect(empty).toMatchObject({
        total: 0,
        page: 1,
        totalPages: 0,
        items: [],
      });
    });
  });
  it("keeps category counts and subtopics inside reviewed public memberships", async () => {
    await withTestDatabase(async (pool) => {
      await fixture(pool, 1, {
        interests: ["gaming", "food-cooking"],
        subtopic: "gaming/reviews",
      });
      await fixture(pool, 2, { subtopic: "gaming/retro-games" });
      await fixture(pool, 3, { status: "candidate" });
      await fixture(pool, 4, { status: "hidden" });
      await fixture(pool, 5, { age: 29 });
      await fixture(pool, 6, { manual: false });
      await fixture(pool, 7, { embeddable: false });
      await fixture(pool, 8);
      await fixture(pool, 9, { interests: [], subtopic: "gaming/reviews" });
      await pool.query(
        "UPDATE videos SET language_status='unverified' WHERE youtube_id='v0000000008'",
      );
      await pool.query(`
        INSERT INTO video_interests(video_id, interest_id, source, reviewed)
        SELECT v.id, i.id, 'query', false FROM videos v CROSS JOIN interests i
        WHERE v.youtube_id='v0000000002' AND i.slug='food-cooking'
      `);
      await pool.query(`
        INSERT INTO video_subtopics(video_id, subtopic_id)
        SELECT v.id, s.id FROM videos v CROSS JOIN subtopics s
        JOIN interests i ON i.id=s.interest_id
        WHERE v.youtube_id='v0000000002' AND i.slug='food-cooking' AND s.slug='coffee'
      `);
      const categories = await listCategories(pool);
      const gaming = categories.find((category) => category.slug === "gaming")!;
      expect(gaming.videoCount).toBe(2);
      expect(
        gaming.subtopics.find((topic) => topic.slug === "gaming/reviews")
          ?.videoCount,
      ).toBe(1);
      expect(
        gaming.subtopics.find((topic) => topic.slug === "gaming/retro-games")
          ?.videoCount,
      ).toBe(1);
      const food = categories.find(
        (category) => category.slug === "food-cooking",
      )!;
      expect(food.videoCount).toBe(1);
      expect(
        food.subtopics.find((topic) => topic.slug === "food-cooking/coffee")
          ?.videoCount,
      ).toBe(0);
      const cars = categories.find(
        (category) => category.slug === "cars-driving",
      )!;
      expect(cars.videoCount).toBe(0);
      expect(cars.subtopics.every((topic) => topic.videoCount === 0)).toBe(
        true,
      );
    });
  });
  it("filters assessed and unassessed language difficulty without losing counts or other facets", async () => {
    await withTestDatabase(async (pool) => {
      for (let n = 1; n <= 21; n++)
        await fixture(pool, n, {
          difficulty: "beginner",
          interests: ["gaming", "food-cooking"],
          subtopic: "gaming/reviews",
        });
      await fixture(pool, 22, { difficulty: "intermediate" });
      await fixture(pool, 23, { difficulty: "advanced" });
      await fixture(pool, 24, { difficulty: "unassessed" });
      await fixture(pool, 25, { difficulty: "beginner", status: "candidate" });
      expect((await listVideos(parseCatalogFilters({}), pool)).total).toBe(24);
      const first = await listVideos(
        parseCatalogFilters({
          difficulty: "beginner",
          interest: "food-cooking",
          subtopic: "gaming/reviews",
          duration: "10-plus",
          q: "Video",
        }),
        pool,
      );
      expect(first).toMatchObject({ total: 21, page: 1, totalPages: 2 });
      expect(first.items.map((v) => v.difficulty)).toEqual(
        Array(20).fill("beginner"),
      );
      const second = await listVideos(
        parseCatalogFilters({ difficulty: "beginner", page: "2" }),
        pool,
      );
      expect(second.items.map((v) => v.youtubeId)).toEqual(["v0000000021"]);
      for (const [difficulty, id] of [
        ["intermediate", "v0000000022"],
        ["advanced", "v0000000023"],
        ["unassessed", "v0000000024"],
      ] as const) {
        const result = await listVideos(
          parseCatalogFilters({ difficulty }),
          pool,
        );
        expect(result.items.map((v) => v.youtubeId)).toEqual([id]);
        expect(await getVideo(id, pool)).toMatchObject({ difficulty });
      }
      expect(
        (
          await listVideos(
            parseCatalogFilters({
              difficulty: "intermediate",
              interest: "food-cooking",
            }),
            pool,
          )
        ).total,
      ).toBe(0);
    });
  });
  it("withdraws visibility when refreshed metadata no longer supports Japanese", async () => {
    await withTestDatabase(async (pool) => {
      const id = await fixture(pool, 1);
      await pool.query(
        "UPDATE videos SET language_status='unverified',default_audio_language=NULL WHERE youtube_id=$1",
        [id],
      );
      expect((await listVideos(parseCatalogFilters({}), pool)).total).toBe(0);
      expect(await getVideo(id, pool)).toBeNull();
    });
  });
  it("searches reviewed topic names and slugs without exposing unreviewed suggestions", async () => {
    await withTestDatabase(async (pool) => {
      const gaming = await fixture(pool, 1, { title: "Unrelated" });
      const coffee = await fixture(pool, 2, { title: "Unrelated", interests: ["food-cooking"], subtopic: "food-cooking/coffee" });
      const suggested = await fixture(pool, 3, { title: "Unrelated" });
      await pool.query(`INSERT INTO video_interests(video_id,interest_id,source,reviewed)
        SELECT v.id,i.id,'query',false FROM videos v CROSS JOIN interests i
        WHERE v.youtube_id=$1 AND i.slug='food-cooking'`, [suggested]);
      await pool.query(`INSERT INTO video_subtopics(video_id,subtopic_id)
        SELECT v.id,s.id FROM videos v CROSS JOIN subtopics s JOIN interests i ON i.id=s.interest_id
        WHERE v.youtube_id=$1 AND i.slug='food-cooking' AND s.slug='coffee'`, [suggested]);
      for (const q of ["Food & Cooking", "food-cooking", "Coffee", "coffee", "food-cooking/coffee"])
        expect((await listVideos(parseCatalogFilters({ q }), pool)).items.map((v) => v.youtubeId)).toEqual([coffee]);
      expect((await listVideos(parseCatalogFilters({ q: "Gaming" }), pool)).items.map((v) => v.youtubeId)).toEqual([gaming, suggested]);
    });
  });
  it("uses assessed manual difficulty before an estimate and preserves both in output", async () => {
    await withTestDatabase(async (pool) => {
      const manual = await fixture(pool, 1, { difficulty: "advanced" });
      const estimated = await fixture(pool, 2);
      const unrated = await fixture(pool, 3);
      await pool.query(`UPDATE videos SET estimated_difficulty='beginner',difficulty_estimate_note='Sampled speech evidence',difficulty_estimate_method='Human sample review'
        WHERE youtube_id=ANY($1::text[])`, [[manual, estimated]]);
      for (const [difficulty, id] of [["advanced", manual], ["beginner", estimated], ["unassessed", unrated]]) {
        const result = await listVideos(parseCatalogFilters({ difficulty }), pool);
        expect(result.items.map((v) => v.youtubeId)).toEqual([id]);
      }
      expect(await getVideo(manual, pool)).toMatchObject({ difficulty: "advanced", estimatedDifficulty: "beginner" });
      expect(await getVideo(estimated, pool)).toMatchObject({ difficulty: "unassessed", estimatedDifficulty: "beginner", difficultyEstimateMethod: "Human sample review" });
    });
  });
  it("resolves saved IDs in input order with the exact public guard, omitting unavailable rows", async () => {
    await withTestDatabase(async (pool) => {
      const first = await fixture(pool, 1);
      const second = await fixture(pool, 2);
      const unavailable = [
        await fixture(pool, 3, { status: "candidate" }),
        await fixture(pool, 4, { status: "hidden" }),
        await fixture(pool, 5, { age: 29 }),
        await fixture(pool, 6, { embeddable: false }),
        await fixture(pool, 7, { manual: false }),
        await fixture(pool, 8, { interests: [] }),
        await fixture(pool, 9),
      ];
      await pool.query("UPDATE videos SET language_status='unverified' WHERE youtube_id=$1", [unavailable.at(-1)]);
      const rows = await getSavedVideos([second, ...unavailable, "xxxxxxxxxxx", first], pool);
      expect(rows.map((v) => v.youtubeId)).toEqual([second, first]);
      expect(rows[0]).not.toHaveProperty("description");
      await pool.query("UPDATE videos SET status='hidden' WHERE youtube_id=$1", [second]);
      expect((await getSavedVideos([second, first], pool)).map((v) => v.youtubeId)).toEqual([first]);
    });
  });
});
