# Yorimichi

A separate Japanese immersion-learning app: find authentic YouTube videos by category and curator-rated learning difficulty, then watch in a video-first workspace. Next.js App Router, TypeScript, Tailwind, Hallmark, Neon PostgreSQL and Drizzle. The owner-selected study-workspace reference informs the forest rail, ivory canvas, lime accents and Rethink Sans typography; its course content and unsupported controls are not copied. Tombo is unchanged; its public Japanese video IDs are an optional fresh-enrichment input, never a runtime dependency.

## Run locally

Use Node 22 and npm. `npm ci`, copy `.env.example` to `.env.local`, and provide your own server-only values. Then:

```sh
npm run db:migrate
npm run db:seed
npm run dev
```

`DATABASE_URL` is a pooled Neon TLS connection. `DATABASE_URL_UNPOOLED` is the direct connection used only by operator migration commands. Prefer `sslmode=verify-full` explicitly. `SITE_URL` is the site's canonical origin. `YOUTUBE_API_KEY` must be restricted to YouTube Data API v3; `CRON_SECRET` authenticates maintenance. No secrets have a `NEXT_PUBLIC_` name. Missing configuration fails the operation needing it; browsing never substitutes fake videos or an empty result for a database failure. Builds do not connect to the database or run migrations.

## Collection and explicit publication review

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

The five interests are Cars & Driving, Fitness & Movement, Gaming, Food & Cooking, and Travel & Culture, each with four qualified subtopics. Collection runs two Japanese queries per selected interest, 50 hits/page, bounded to 1–3 pages/query. Enrichment batches at most 50 IDs. Only public, embeddable, 240–1200-second videos with valid essential metadata are retained. Optional metadata stays null; view counts remain exact decimal strings. The runtime collector never scrapes, downloads media, transcribes, classifies with AI or publishes automatically. Owner-delegated assistant metadata review is a separate explicit curation operation, not a listening review.

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

Publishing requires a nonempty review note, at least one interest, matching subtopic parents, Japanese evidence and metadata fresher than 29 days. The entire file is validated before writes, affected rows are locked, and all decisions apply atomically. Export published or hidden records to revise/unpublish them. Reapplying decisions is membership-idempotent. An untouched export intentionally cannot publish itself: explicit review decisions and honest reviewer provenance are required.

### Learning difficulty

Every curation decision must explicitly include `difficulty`: `unassessed`, `beginner`, `intermediate`, or `advanced`. Missing/unsupported values reject the whole file. These categories describe the language in a video, not a learner's ability and not JLPT certification:

- **Not assessed:** no genuine curator difficulty assessment yet.
- **Beginner:** clear, slower language, common vocabulary and strong visual context.
- **Intermediate:** natural-paced language, broader vocabulary and some implicit context.
- **Advanced:** fast, dense or specialist language with substantial assumed context.

Assess the actual speech or substantive on-video text and document the judgment in `reviewNote`. A topic, title, creator-provided language tag or view count is not difficulty evidence. Collection and metadata refresh never assign or overwrite difficulty. Assessments can be revised or withdrawn independently of publication.

Every decision must include difficulty; old exports without it are rejected. Current private production exports are `.local/production-pending-reviewed.json` (160 held candidates, with reasons) and `.local/production-published-reviewed.json` (361 publications). Development's export is `.local/review-with-difficulty.json`. Earlier snapshots, including `production-review-with-difficulty.json`, were preserved; never apply an outdated snapshot as current decisions.

`.local/` and all real environment files are ignored. Review exports contain API data: keep them private and delete them before 30 days (including backups/copies). Never commit responses, credentials, private Tombo data or curator exports. Targets are 200 distinct reviewed publications, around 40 memberships/interest and a preference for at most 3/channel/interest—not fabricated totals or automatic approvals.

## Public journey and privacy

- `/welcome`: acknowledgment before any catalog/thumbnail/player request. An httpOnly, sameSite=lax `jce.consent=1` cookie lasts up to one year; secure in production. Footer reset deletes it. `/privacy` and `/terms` remain accessible without acknowledgment.
- `/`: category cards with real public counts, actual covers and descriptions; the existing interest-mix picker remains below them. Optional localStorage key `jce.interests.v1` initializes only the picker after mount. Corrupt/blocked storage is harmless. Explore Everything opens an unfiltered catalog.
- `/explore`: active category, category-specific subtopic counts, native GET filters and stable pagination. Repeated `interest`/`subtopic`, literal title/channel `q`, `difficulty=all|unassessed|beginner|intermediate|advanced`, `sort=newest|popular`, `duration=all|under-10|10-plus`, and positive `page` are supported. Unsupported/repeated scalars render Invalid filters. Category switches preserve scalar refinements and clear old subtopics/page; Clear filters retains the category. Twenty distinct videos/page, snapshot-consistent count/rows and canonical page clamping. Shared URLs always win over local preferences.
- `/videos/[youtubeId]`: the same visibility predicate as listing and metadata generation. Hidden/candidate/stale/unverified/unreviewed/unknown videos share a not-found surface. Native player, source link, honest metadata notes and a creator-description disclosure; descriptions remain escaped complete text. Back links accept only a validated `/explore` URL.

Public visibility requires published status, current embeddable metadata, Japanese evidence and a reviewed manual interest. Thumbnails load directly from allowlisted `i.ytimg.com` without a server retention proxy cache; missing thumbnails have a labeled fallback. Native YouTube playback never autoplays. Embeds use youtube-nocookie.com and explicit origin/referrer policy; Made-for-Kids or unknown designations get original links instead. No account, arbitrary transcript endpoint or viewing analytics.

The latest Hallmark redesign supersedes the earlier HENNGE restyle: sampled ivory `#f3f0e6`, paper `#fcfcf5`, forest `#131f19`, lime `#d9f05e`, self-hosted Rethink Sans and Japanese-capable system sans. A desktop category rail becomes a native mobile menu; the detail workspace places the native player beside real metadata, not invented quizzes or study notes. Empty categories have no fake thumbnail slots. Mobile category/subtopic rails scroll within the page. Existing routes, consent boundaries, preference keys, source links, visible focus and reduced-motion support remain. Repository/domain identifiers are intentionally unchanged.

## Local Whisper transcription

The owner's later request adds a separate private operator workflow, not a public transcript endpoint. `scripts/transcribe-local.py` reuses Tombo's installed **mlx-whisper 0.4.3**, **yt-dlp 2026.8.19**, existing ffmpeg/ffprobe and its already-cached `mlx-community/whisper-large-v3-turbo` revision `a4aaeec0636e6fef84abdcbe3544cb2bf7e9f6fb`. It never imports Tombo application code, reads its database/environment/transcripts, or installs another model. Inference is local with the Hugging Face hub forced offline; only audio acquisition contacts YouTube.

```sh
/Users/bayu/nightgig/tombo/server/.venv/bin/python scripts/transcribe-local.py \
  --manifest .local/production-published-reviewed.json
```

The input is the current 361-publication snapshot. Optional `--only YOUTUBE_ID` exercises one actual published video. Output defaults to ignored `.local/transcripts/`: one timestamped JSON and WebVTT file per video, plus `batch.json` with every ID's actual status and counts. Finished matching transcripts resume without downloading or inference again. Temporary audio and downloader metadata are deleted after each attempt. Re-running is an explicit retry of failed/pending records; no hidden retries, browser-cookie extraction or access bypass occurs. A YouTube bot challenge stops the run and leaves remaining entries visibly pending.

An explicit `--audio-format 'bestaudio[language^=ja][ext=m4a]'` can select an available original Japanese M4A track when a default audio asset fails. The selector fails if no matching track is available; it does not add automatic retries, cookies or access bypasses. Existing JSON/VTT pairs are left intact on resume; only a missing VTT is regenerated.

JSON includes word timings, model provenance, `machineGenerated: true` and `humanReviewed: false`; WebVTT identifies its machine-generated origin. Japanese is a requested decoding language, not detected-language verification. Empty model results are labeled `no_speech_detected`, never invented text. Outputs can contain recognition errors or hallucinations; they never change publication, language evidence or difficulty. Keep them private unless you have the necessary publication rights. No transcripts/audio enter Git or the public website.

Unavailable non-finite optional confidence/word-alignment measurements are stored as `null` with per-segment `qualityWarnings`, never fabricated as zero or emitted as invalid JSON. Spoken cue timestamps remain strictly finite, nonnegative and positive-duration. Recognized text is preserved even when an optional model measurement is unavailable.

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
python3 -m unittest discover -s scripts -p test_transcribe_local.py
npm run build
npm run start
```

Integration tests require an explicit **direct**, nonproduction `TEST_DATABASE_URL`, never fallback to `DATABASE_URL`. The harness creates a random schema, applies real migrations/taxonomy there and drops only that schema. The direct connection is necessary for PostgreSQL `search_path`; Neon's pooled endpoint rejects that startup parameter. Test and application branches must differ. Tests never call live YouTube.

Behavioral coverage includes normalization boundaries and exact bigints, retry/deadline/stream failures, distinct-ID provenance, manual-state preservation, partial-batch rollback, atomic curation, publication transitions, literal search, AND/OR filters, pagination/sorts, retention deletion, timestamp races, advisory lock exclusion and cron authentication.

### Exercised evidence — 2 November 2026

- PostgreSQL migrations and repeated seeding produced exactly 5 interests/20 subtopics. Neon production and development migrations/seeding also succeeded.
- All **79 tests passed against the dedicated direct Neon test branch**, including public category counts/covers/subtopics, privacy guards, difficulty filtering, atomic rating writes, rating withdrawal and preservation through ingestion/maintenance. TypeScript, ESLint and the optimized production build passed. To load the explicit test environment use `node --env-file=.local/test.env node_modules/vitest/vitest.mjs run`; `node --env-file=… --run test` does not reliably propagate these variables to npm's child.
- Live official collection into Neon development: the first 10 searches accepted 500 distinct candidates. A later Cars & Driving search had 100 raw hits, 1 duplicate occurrence, 78 metadata updates and 21 new IDs—live results genuinely changed. Tombo import accepted 21 of 34 Japanese references and rejected 13. Current development inventory: **542 candidates, 0 published**, exported privately to `.local/review-with-difficulty.json`. This is a review backlog, not 200 approved videos.
- In a disposable smoke database only, 25 real freshly enriched references were explicitly marked as test fixtures (not curator approvals). Browser proof covered acknowledgment, repeated-interest navigation, picker persistence, literal Japanese keyword + subtopic/duration/sort, 20/5 pagination, shared-state reload, empty/reset and invalid-filter states. Hiding a fixture via the actual CLI removed it from listing and detail.
- Native playback advanced past 1 second only after a native user click, both in development and the optimized production build. Initial state was paused at time 0. Unknown Made-for-Kids designation rendered an original-link explanation with no iframe. This does not certify every embed.
- Initial-theme browser proof covered nine screen captures at 360×800, 390×844, 1280×800: zero horizontal overflow or off-screen main elements; smallest player 328×200. Independent review prompted denser mobile filters and balanced Japanese headings; six corrected captures confirmed those changes. At that stage the first thumbnail started at y=593px on the checked 390px phone. Chromium confirmed a real Hiragino Japanese sans face rather than an assumed fallback. The later reference-inspired layout is recorded below.
- Browser checks also exercised blocked storage reads and writes, a missing thumbnail, a visible 2px keyboard focus ring, reduced-motion CSS, and zero external requests on the acknowledgment page. An intentionally invalid development connection produced the recoverable error UI without losing filters.
- Actual HTTP cron proof: unauthorized requests returned 401 even against an unavailable DB; authenticated requests with that broken DB returned count-free 500. Actual CLI/API refresh of an eight-day-old isolated fixture made one request and one metadata update while preserving editorial state.
- Hallmark's Chrome/Puppeteer render sweep ran for all three URLs: **0 Floor failures, 0 warnings, 2 justified dismissed label findings**. Its isolated browser has no consent setup hook, so those automated captures were the consent surface, **not** consented catalog/detail proof; separate session-browser captures cover the actual functional screens.
- New immersion/difficulty browser proof used a random schema in the dedicated test branch, never production ratings: 21 Beginner fixtures paginated 20/1; Unknown/JLPT-like filters were rejected; shared URLs and detail back links preserved difficulty/page. The actual curation CLI changed a fixture to Advanced, and the application moved it between categories. All demonstration ratings were explicitly marked as fixtures, not genuine assessments.
- Reference-inspired restyle: all nine screen/viewport combinations had zero horizontal overflow, and the smallest player stayed 328×200. Final compact topic disclosures moved the first phone thumbnail to y=661.5px at both 360px and 390px widths. Browser-computed background/font matched the requested reference. The final Hallmark sweep reported 0 failures, 0 warnings and two justified dismissed label findings; its consent-render limitation remains as described above.
- First real production publication: the owner explicitly approved five presented title/channel/source/category matches, one per interest. The actual curation CLI applied exactly those five atomically. All remain `likely_ja` from creator-provided audio metadata and `unassessed` difficulty; no listening verification, subtopics or formats were invented.
- Public browser proof then showed all five genuine publications. A native GET search for `焼き味噌` combined with Food & Cooking, Not assessed, Most viewed and 10+ minutes returned the approved cooking video; reload and the detail back link preserved those filters. Its actual native YouTube play button advanced playback beyond 1 second from paused/time 0; a later native pause confirmed real content playback without an ad. This does not certify the other four embeds. Both live catalog and detail had zero overflow/off-screen main elements at 360px, 390px and 1280px; the smallest player remained 328×200. Two live HTML responses and ten first-party script responses contained none of the configured production credential values.
- The owner then delegated review of every remaining production candidate. All 516 actual complete title/description records were reviewed, with a focused second pass on ambiguous category matches. The real atomic CLI applied 356 additional publications and 160 explicitly held decisions; a fresh export matched every applied decision and preserved the original five exactly. These are assistant metadata reviews, not human listening verification. Every publication remains `likely_ja` and every difficulty remains `unassessed`.
- Real category runtime proof: Gaming Reviews paginated 20/20 with no overlap; category switching preserved scalar refinements and cleared old subtopics/page; a literal title search, detail return URL and category-preserving reset worked. Development's genuine empty inventory showed five categories and no media. A deliberately unavailable database showed a distinct recoverable error; restarting with the real development connection let the actual retry action recover.
- Yorimichi's nine home/category/detail combinations at 360px, 390px and 1280px had no page overflow. Native iframes measured 294×200 and 324×200 on phones. Actual content playback advanced from paused/time 0 to 1.010215 seconds, readyState 4, duration 621.761, without an ad. Keyboard opening pushed content down rather than overlaying it; current-page navigation closed the menu and restored summary focus. The real creator-description disclosure exposed 4,562 characters including its summary.
- Fresh-context image review accepted the video workspace and found mobile hierarchy and misleading empty thumbnail slots; both were corrected. Hallmark's kept-wiring sweep retained 25/25 links, 9/9 fields, 4/4 handlers and 1/1 headings. Its two Finish findings are explicitly answered: reference-derived metadata capsules and the outlined/shadowed outer frame. Consent-only automated renders remain separate from actual consented browser proof.
- Corrected mobile category views now lead with their heading at y=102px and the first video at y=472.39px at both 360px and 390px. Scroll rails contain their screen-reader labels; document width matches viewport width. Corrected empty categories render five real category links, zero images/iframes and zero pretend thumbnail slots. The new-font acknowledgment page had zero media and only first-party requests before acknowledgment.
- Local Whisper proof used the real cooking video's entire 621.761-second audio and the existing cached model. Its 105 raw records contained five empty zero-duration decoder records; normalization now omits empty records before validating spoken cue timestamps, preserving every recognized character. The resulting JSON and VTT contain 100 spoken cues, and ffprobe parsed all 100 WebVTT packets. Five offline regression tests passed. An isolated real-output resume completed with `PATH=/nonexistent`, proving that completed transcripts need neither downloading nor media tools again. The full 361-ID batch's actual coverage is recorded in private `.local/transcripts/batch.json`; the target size is not a completion claim.
- The deployed Yorimichi HTML/client audit checked two actual HTML responses and ten first-party script responses; none contained configured production credential values.

### Local Whisper batch outcome

Final output audit against the exact published snapshot:

| Check | Verified result |
| --- | ---: |
| Published videos in snapshot | 361 |
| Complete JSON/WebVTT pairs | 361 |
| Failed or pending videos | 0 |
| Spoken cues | 70,771 |
| Input audio hours | 73.36 |
| Temporary audio files retained | 0 |

The first pass completed 357 videos. Explicit recovery processed only unfinished inputs; existing completed pairs were not transcribed again. Two forbidden media responses succeeded with fresh ordinary downloads; the last unhealthy audio asset succeeded using its listed original Japanese M4A track. One model `avg_logprob` was non-finite: its transcript now retains the speech and valid cues, with that optional score explicitly `null` and flagged in `qualityWarnings`.

Six offline exporter regression tests pass. The final recovered WebVTT was parsed by ffprobe with 130 packets. Every snapshot ID has matching provenance, strict JSON, positive finite cue ranges and matching JSON/VTT cue counts. `.local/transcripts/batch.json` is the final run report; `.local/transcripts/validation.json` is the complete output audit; `batch-initial.json` preserves the first-pass outcome. These files and all transcripts remain private. This is machine-generated recognition, not a human accuracy or difficulty assessment.



### Deployment and remaining operator prerequisites

- Source: https://github.com/peacemaker14/japanese-content-explorer . Public app: https://japanese-content-explorer-p14.vercel.app . Local runtime uses Neon development; tests use a separate direct test branch.
- Production contains **361 published videos, 160 held candidates and 0 hidden**: Cars & Driving 82, Fitness & Movement 68, Gaming 80, Food & Cooking 77, Travel & Culture 54. The 200-total/~40-per-interest targets are met. Channel variety remains imperfect: 19 channel/category groups exceed the preferred three, with a largest group of 17; this is not a hard publication cap. Development remains separate.
- Original owner approvals remain in `.local/approved-production-first-five.json`. All 516 subsequent decisions are in `.local/assistant-reviewed-production-decisions.json`; `.local/assistant-review-outcomes.json` records rationale and second-pass adjustments. Held reasons overlap: 49 non-Japanese audio tags, 87 missing audio tags, 30 uncertain language content, 9 outside categories, 4 nonverbal and 1 uncertain category. Never describe metadata-only judgments as listening verification.
- Vercel's personal `p14` Hobby deployment and separate Production/Preview credentials are configured; no direct migration URL was supplied. Yorimichi release `44cfba8` deployed successfully. The actual canonical public site showed the new title/font, all five correct category counts and Gaming's 80 videos; the 390px public category view had matching document/viewport width and its first video at y=472.39px.
- The live maintenance endpoint returned 401 without authorization and 200 with a count-only success response using the configured secret. A new successful production refresh row completed after the request's database-clock baseline, with matching response counts and no error. No rows were due, so this invocation made no YouTube requests.
- The cron schedule is committed in `vercel.json`. Dashboard confirmation of active scheduling and failure-notification settings remains unverified: the authenticated browser relay disconnected and the CLI is logged out. No scheduled execution or alert configuration is claimed. Until those operational checks are completed, local maintenance remains available with `node --env-file=.local/production.env node_modules/tsx/dist/cli.mjs scripts/refresh-metadata.ts`.
- Disposable PostgreSQL/browser fixtures and render captures were removed after proof; real private review exports and operator environment files are retained. Delete API-bearing exports before 30 days. No Tombo application files were changed.
