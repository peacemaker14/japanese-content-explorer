# Japanese Content Explorer

A separate Japanese immersion-learning app: find authentic YouTube videos by interest and curator-rated learning difficulty, then watch on the video detail page. Next.js App Router, TypeScript, Tailwind, Hallmark app-screen conventions, Neon PostgreSQL and Drizzle. The user-selected visual direction is based on HENNGE's neutral background and sans-serif typography, not its branding or illustrations. Tombo is unchanged; its public Japanese video IDs are an optional fresh-enrichment input, never a runtime dependency.

## Run locally

Use Node 22 and npm. `npm ci`, copy `.env.example` to `.env.local`, and provide your own server-only values. Then:

```sh
npm run db:migrate
npm run db:seed
npm run dev
```

`DATABASE_URL` is a pooled Neon TLS connection. `DATABASE_URL_UNPOOLED` is the direct connection used only by operator migration commands. Prefer `sslmode=verify-full` explicitly. `SITE_URL` is the site's canonical origin. `YOUTUBE_API_KEY` must be restricted to YouTube Data API v3; `CRON_SECRET` authenticates maintenance. No secrets have a `NEXT_PUBLIC_` name. Missing configuration fails the operation needing it; browsing never substitutes fake videos or an empty result for a database failure. Builds do not connect to the database or run migrations.

## Collection and human publication

Enable YouTube Data API v3 and check the project's actual quota first. This project's console showed 100 search calls/day and a separate 10,000-query daily allowance when checked on 2 November 2026. Do not assume every project has identical quota.

```sh
npm run ingest -- --interest all --pages-per-query 1
npm run ingest -- --interest cars-driving --pages-per-query 1
npm run import:tombo -- --manifest /path/to/tombo/server/data/catalog.json
npm run curate:export -- --status candidate --out .local/review-with-difficulty.json
# Review actual videos/metadata. Copy only completed decisions into a separate file.
npm run curate:apply -- --file .local/approved.json
npm run catalog:report
```

The five interests are Cars & Driving, Fitness & Movement, Gaming, Food & Cooking, and Travel & Culture, each with four qualified subtopics. Collection runs two Japanese queries per selected interest, 50 hits/page, bounded to 1–3 pages/query. Enrichment batches at most 50 IDs. Only public, embeddable, 240–1200-second videos with valid essential metadata are retained. Optional metadata stays null; view counts remain exact decimal strings. No scraping, transcription, media downloads or AI classification.

A new record is a **candidate**, never automatically published. Collection preserves curator decisions and records all query/manifest provenance. A partial run preserves committed batches, records sanitized errors/counts and exits nonzero. Retries are bounded to three attempts and absolute deadlines. Query-side interest suggestions are not reviewed categories.

The editable curation file is a JSON array. Read-only `context` is ignored for writes:

```json
[{
  "youtubeId": "REAL_11CHAR_ID",
  "status": "published",
  "interests": ["food-cooking"],
  "subtopics": ["food-cooking/home-cooking"],
  "format": "tutorial",
  "languageStatus": "likely_ja",
  "difficulty": "unassessed",
  "reviewNote": "Your actual review and selection rationale."
}]
```

Replace the illustrative ID with a collected real ID; the illustration is not runnable data. Formats: `review`, `tutorial`, `vlog`, `interview`, `other`, or null. `likely_ja` requires current creator-provided Japanese audio-language metadata. `verified_ja` requires genuine curator observation of Japanese speech or substantive on-video Japanese text, documented in the note; a Japanese title is not that evidence. Never claim a listening review that did not happen.

Publishing requires a nonempty review note, at least one interest, matching subtopic parents, Japanese evidence and metadata fresher than 29 days. The entire file is validated before writes, affected rows are locked, and all decisions apply atomically. Export published or hidden records to revise/unpublish them. Reapplying decisions is membership-idempotent. An untouched export intentionally cannot publish itself: review notes and human decisions are required.

### Learning difficulty

Every curation decision must explicitly include `difficulty`: `unassessed`, `beginner`, `intermediate`, or `advanced`. Missing/unsupported values reject the whole file. These categories describe the language in a video, not a learner's ability and not JLPT certification:

- **Not assessed:** no genuine curator difficulty assessment yet.
- **Beginner:** clear, slower language, common vocabulary and strong visual context.
- **Intermediate:** natural-paced language, broader vocabulary and some implicit context.
- **Advanced:** fast, dense or specialist language with substantial assumed context.

Assess the actual speech or substantive on-video text and document the judgment in `reviewNote`. A topic, title, creator-provided language tag or view count is not difficulty evidence. Collection and metadata refresh never assign or overwrite difficulty. Assessments can be revised or withdrawn independently of publication.

This is a curation contract change: old review exports without `difficulty` are not silently accepted. Fresh exports are `.local/review-with-difficulty.json` (development) and `.local/production-review-with-difficulty.json` (production). Existing exports were preserved; carry over any human decisions and add the explicit difficulty field rather than discarding your review work.

`.local/` and all real environment files are ignored. Review exports contain API data: keep them private and delete them before 30 days (including backups/copies). Never commit responses, credentials, private Tombo data or curator exports. Targets are 200 distinct reviewed publications, around 40 memberships/interest and a preference for at most 3/channel/interest—not fabricated totals or automatic approvals.

## Public journey and privacy

- `/welcome`: acknowledgment before any catalog/thumbnail/player request. An httpOnly, sameSite=lax `jce.consent=1` cookie lasts up to one year; secure in production. Footer reset deletes it. `/privacy` and `/terms` remain accessible without acknowledgment.
- `/`: five interest choices; optional localStorage key `jce.interests.v1` initializes only this picker after mount. Corrupt/blocked storage is harmless. Explore Everything opens an unfiltered catalog.
- `/explore`: native GET form with repeated `interest`/`subtopic`, literal title/channel `q`, `difficulty=all|unassessed|beginner|intermediate|advanced`, `sort=newest|popular`, `duration=all|under-10|10-plus`, and positive `page`. Unsupported/repeated scalar filters render Invalid filters. Difficulty combines with the other facets; filters reset pagination and links preserve state. Twenty distinct videos/page, stable tie-breaking, snapshot-consistent count/rows, canonical page clamping. Shared URLs always win over local preferences.
- `/videos/[youtubeId]`: uses the same visibility predicate as listing and metadata generation. Hidden/candidate/stale/unverified/unreviewed/unknown videos share a not-found surface. Back links accept only a validated `/explore` URL. Descriptions are escaped text, not HTML.

Public visibility requires published status, current embeddable metadata, Japanese evidence and a reviewed manual interest. Thumbnails load directly from allowlisted `i.ytimg.com` without a server retention proxy cache; missing thumbnails have a labeled fallback. Native YouTube playback never autoplays. Embeds use youtube-nocookie.com and explicit origin/referrer policy; Made-for-Kids or unknown designations get original links instead. No account, arbitrary transcript endpoint or viewing analytics.

The visual reference is https://recruit.hennge.com/en and its same-origin `app.bundle.css`: live computed styles confirmed `#f8f8f8` background, white header/surfaces, `#222222` text and Helvetica Neue / Arial / Japanese-capable system sans. The previous cream, green, condensed display and serif prose styling was removed. No reference-site logo, illustration or content is copied. Routes, native video-thumbnail grid, 44px controls, loading/empty/error/full states, visible focus and reduced-motion support are preserved.

## Metadata retention and deployment

```sh
npm run metadata:refresh
```

`vercel.json` defines exactly one daily job, `0 3 * * *`, calling `GET /api/cron/refresh-metadata`. Vercel supplies `Authorization: Bearer <CRON_SECRET>`. Missing/incorrect authorization returns 401 **before** DB/API work. The job refreshes existing rows only; it never searches, classifies or publishes.

Maintenance selects up to 500 oldest records at least seven days old, in 50-ID batches. A transaction-level advisory lock prevents overlap through Neon's transaction pooler; one reserved lock-only connection plus one working connection fit the runtime pool limit of two. External work is bounded to 40 seconds of a 60-second invocation. Successful omission/unavailability removes a video and cascading links. API failures retain otherwise fresh data. Timestamp guards protect concurrent newer ingestion, retaining PostgreSQL microsecond precision.

Every invocation purges records/source rows at 29 days even when API refresh fails. Public queries also hide stale records, but hiding is **not** a substitute for physical deletion. Run logs contain aggregate outcomes and sanitized errors, not raw API history. Count-only responses: 200 success/lock skip, 502 incomplete API refresh after purge, 500 DB failure. A failed or unrun job is an operational incident: inspect persisted refresh runs and enable Vercel failure notifications.

For Vercel, set Node 22 and production `DATABASE_URL`, `YOUTUBE_API_KEY`, `CRON_SECRET`, `SITE_URL`. Keep the direct migration URL local to the operator. Run migrations/seeding explicitly before deployment; never during web startup. Preview deployments use a separate development branch. After deployment verify 401 without authorization, a successful authenticated invocation, persisted counts, enabled daily cron and failure notifications. Do not claim deployment complete before these checks. Set `SITE_URL` to the final canonical deployment origin.

## Verification

```sh
npm run typecheck
npm run test                         # pure checks; DB suites skip without explicit test access
TEST_DATABASE_URL='DIRECT_TEST_BRANCH_URL' npm run test
npm run build
npm run start
```

Integration tests require an explicit **direct**, nonproduction `TEST_DATABASE_URL`, never fallback to `DATABASE_URL`. The harness creates a random schema, applies real migrations/taxonomy there and drops only that schema. The direct connection is necessary for PostgreSQL `search_path`; Neon's pooled endpoint rejects that startup parameter. Test and application branches must differ. Tests never call live YouTube.

Behavioral coverage includes normalization boundaries and exact bigints, retry/deadline/stream failures, distinct-ID provenance, manual-state preservation, partial-batch rollback, atomic curation, publication transitions, literal search, AND/OR filters, pagination/sorts, retention deletion, timestamp races, advisory lock exclusion and cron authentication.

### Exercised evidence — 2 November 2026

- PostgreSQL migrations and repeated seeding produced exactly 5 interests/20 subtopics. Neon production and development migrations/seeding also succeeded.
- All **78 tests passed against the dedicated Neon test branch**, including difficulty filtering, atomic rating validation/writes, rating withdrawal and preservation through ingestion/maintenance. TypeScript, ESLint and the optimized production build passed.
- Live official collection into Neon development: the first 10 searches accepted 500 distinct candidates. A later Cars & Driving search had 100 raw hits, 1 duplicate occurrence, 78 metadata updates and 21 new IDs—live results genuinely changed. Tombo import accepted 21 of 34 Japanese references and rejected 13. Current development inventory: **542 candidates, 0 published**, exported privately to `.local/review-with-difficulty.json`. This is a review backlog, not 200 approved videos.
- In a disposable smoke database only, 25 real freshly enriched references were explicitly marked as test fixtures (not curator approvals). Browser proof covered acknowledgment, repeated-interest navigation, picker persistence, literal Japanese keyword + subtopic/duration/sort, 20/5 pagination, shared-state reload, empty/reset and invalid-filter states. Hiding a fixture via the actual CLI removed it from listing and detail.
- Native playback advanced past 1 second only after a native user click, both in development and the optimized production build. Initial state was paused at time 0. Unknown Made-for-Kids designation rendered an original-link explanation with no iframe. This does not certify every embed.
- Initial-theme browser proof covered nine screen captures at 360×800, 390×844, 1280×800: zero horizontal overflow or off-screen main elements; smallest player 328×200. Independent review prompted denser mobile filters and balanced Japanese headings; six corrected captures confirmed those changes. At that stage the first thumbnail started at y=593px on the checked 390px phone. Chromium confirmed a real Hiragino Japanese sans face rather than an assumed fallback. The later reference-inspired layout is recorded below.
- Browser checks also exercised blocked storage reads and writes, a missing thumbnail, a visible 2px keyboard focus ring, reduced-motion CSS, and zero external requests on the acknowledgment page. An intentionally invalid development connection produced the recoverable error UI without losing filters.
- Actual HTTP cron proof: unauthorized requests returned 401 even against an unavailable DB; authenticated requests with that broken DB returned count-free 500. Actual CLI/API refresh of an eight-day-old isolated fixture made one request and one metadata update while preserving editorial state.
- Hallmark's Chrome/Puppeteer render sweep ran for all three URLs: **0 Floor failures, 0 warnings, 2 justified dismissed label findings**. Its isolated browser has no consent setup hook, so those automated captures were the consent surface, **not** consented catalog/detail proof; separate session-browser captures cover the actual functional screens.
- New immersion/difficulty browser proof used a random schema in the dedicated test branch, never production ratings: 21 Beginner fixtures paginated 20/1; Unknown/JLPT-like filters were rejected; shared URLs and detail back links preserved difficulty/page. The actual curation CLI changed a fixture to Advanced, and the application moved it between categories. All demonstration ratings were explicitly marked as fixtures, not genuine assessments.
- Reference-inspired restyle: all nine screen/viewport combinations had zero horizontal overflow, and the smallest player stayed 328×200. Final compact topic disclosures moved the first phone thumbnail to y=661.5px at both 360px and 390px widths. Browser-computed background/font matched the requested reference. The final Hallmark sweep reported 0 failures, 0 warnings and two justified dismissed label findings; its consent-render limitation remains as described above.

### Deployment and remaining operator prerequisites

- Source: https://github.com/peacemaker14/japanese-content-explorer . Public app: https://japanese-content-explorer-p14.vercel.app . Local runtime uses Neon development; tests use a separate direct test branch.
- Production has **521 genuine candidates, 0 published**, now exported privately to `.local/production-review-with-difficulty.json`. Development has 542 candidates; the difference is a later live-search rerun, not data loss. No genuine difficulty ratings were invented.
- Human review is still required before publication. Copy only completed, difficulty-aware decisions into `.local/approved-production.json`; never blanket-publish. Apply against production explicitly with `node --env-file=.local/production.env node_modules/tsx/dist/cli.mjs scripts/curate-apply.ts --file .local/approved-production.json`.
- Vercel deployment in the personal `p14` Hobby workspace succeeded; the immersion/difficulty redesign (`c1f0da1`) is live. Production-only secrets and a separate Preview database were configured; no direct migration URL was supplied to Vercel.
- Public browser verification confirmed the learning headline, computed `#f8f8f8` background, HENNGE-inspired system-sans stack and no horizontal overflow at 390px. The native Beginner filter survived submission and reload. Unsupported difficulty was rejected, and an unpublished candidate remained unavailable. The live catalog is correctly empty until genuine review/publication.
- The live maintenance endpoint returned 401 without authorization and 200 with a count-only success response using the configured secret. A new successful production refresh row completed after the request's database-clock baseline, with matching response counts and no error. No rows were due, so this invocation made no YouTube requests.
- The cron schedule is committed in `vercel.json`. Dashboard confirmation of active scheduling and failure-notification settings remains unverified: the authenticated browser relay disconnected and the CLI is logged out. No scheduled execution or alert configuration is claimed. Until those operational checks are completed, local maintenance remains available with `node --env-file=.local/production.env node_modules/tsx/dist/cli.mjs scripts/refresh-metadata.ts`.
- Disposable PostgreSQL/browser fixtures and render captures were removed after proof; real private review exports and operator environment files are retained. Delete API-bearing exports before 30 days. No Tombo application files were changed.
