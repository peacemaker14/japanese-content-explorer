# Yorimichi

A Japanese immersion-learning app for discovering authentic YouTube videos about things you already love. Next.js App Router, TypeScript, Tailwind, Hallmark, Neon PostgreSQL and Drizzle. Video-first discovery uses a warm canvas, restrained forest/lime accents and self-hosted Rethink Sans. Tombo remains unchanged; its transcript interactions inform the reader, and the private transcription workflow reuses its existing local Whisper installation.

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

- **Unrated:** no curator assessment or sufficiently supported machine estimate.
- **Beginner:** clear, slower language, common vocabulary and strong visual context.
- **Intermediate:** natural-paced language, broader vocabulary and some implicit context.
- **Hard** (stored as `advanced`): fast, dense or specialist language with substantial assumed context.

Assess the actual speech or substantive on-video text and document the judgment in `reviewNote`. A topic, title, creator-provided language tag or view count is not difficulty evidence. Collection and metadata refresh never assign or overwrite difficulty. Assessments can be revised or withdrawn independently of publication.

Machine estimates are separate nullable fields, never curator ratings. The operator-only `npm run learning:apply -- --file .local/learning-decisions.json` validates the complete file and applies it atomically. Records contain `youtubeId`, `estimatedDifficulty` (`beginner|intermediate|advanced|null`), `estimateNote`, and `estimateMethod`; clearing requires all three estimate fields to be null. Assessed manual ratings take precedence in cards, detail and filtering. Ingestion/metadata refresh do not overwrite either kind of judgment. No runtime LLM is called.

The current estimates review actual beginning/middle/end Whisper text windows, not titles or topic stereotypes. Two licensed city walks were reviewed from their full machine transcripts. They assess vocabulary, syntax and implied context, not speaking pace, accents, visuals, audio accuracy or JLPT. Insufficient/noisy/uncertain evidence stays Unrated. All 378 manual difficulty fields remain `unassessed`; 311 videos have separate stored estimates and 67 remain Unrated, including the 15 latest additions. Thumbnail chips show the effective level without a source qualifier; the assessment basis remains in video notes.

Every curation decision still requires manual difficulty; old exports without it are rejected. The current publication export is `.local/production-published-cc-924c4d45.json` (378). `.local/production-published-with-demo.json` preserves the earlier 363-publication snapshot and `.local/production-published-reviewed.json` the earlier 361. The original 160 held decisions remain in `.local/production-pending-reviewed.json`; the held Akita candidate and two approved city walks are in `.local/cc-demo-reviewed.json`. The latest 15 explicit metadata decisions are in `.local/cc-expansion-924c4d45-curation.json`. Development's export remains `.local/review-with-difficulty.json`. Never apply a historical snapshot as current decisions.

`.local/` and all real environment files are ignored. Review exports contain API data: keep them private and delete them before 30 days (including backups/copies). Never commit responses, credentials, private Tombo data or curator exports. Targets are 200 distinct reviewed publications, around 40 memberships/interest and a preference for at most 3/channel/interest—not fabricated totals or automatic approvals.

## Public journey and privacy

- `/welcome`: acknowledgment before any catalog/thumbnail/player request. An httpOnly, sameSite=lax `jce.consent=1` cookie lasts up to one year; secure in production. Footer reset deletes it. `/privacy` and `/terms` remain accessible without acknowledgment.
- `/`: Discover, with the curiosity headline, real videos, search, topic chips, a prominent With transcript toggle and lightweight filter disclosure. Infinite scrolling fetches 20-video batches; window virtualization mounts visible responsive rows plus an overscan buffer instead of retaining every loaded card in the DOM. Loading adds two responsive rows of thumbnail/title/metadata shimmers, with a separate screen-reader announcement and static reduced-motion fallback; failures preserve loaded cards and offer explicit Retry. Default Featured first promotes authorized shared transcripts, then orders by date/ID. No category-picture portal, persistent sidebar or page-number navigation. Search covers stored title/channel and reviewed manual interest/subtopic names/slugs, not discovery-query guesses. Shared URLs win over local preferences.
- Repeated `interest`/`subtopic`, literal `q`, `difficulty=all|unassessed|beginner|intermediate|advanced`, `transcript=all|available|unavailable`, `sort=featured|newest|popular`, and `duration=all|under-10|10-plus` are supported. The Hard label keeps the existing `advanced` value for stored ratings and URLs. Transcript flags/filtering/promotion require authorized shared text, never a private operator/browser file. Unsupported/repeated scalars show Invalid filters. Counts and rows are snapshot-consistent within each batch. Positive `page` is internal batch-fetch state, not public discovery navigation.
- `/saved`: IDs-only localStorage key `yorimichi.saved.v1`; the same VideoCard is used here and on Discover. A consent-guarded, read-only server action resolves current public metadata for at most 50 IDs, with 20 saved IDs/page. No server-side profile, account, cross-device sync or transcript upload. Unavailable saves remain locally recorded without exposing hidden/stale metadata. Storage/read failures have explicit retry states.
- `/interests`: compact topic selection using the existing `jce.interests.v1` key, explicit Use my interests, Explore everything and Reset preferences controls. Preferences never silently override a shared URL or trap a visitor in personalized results.
- `/videos/[youtubeId]`: the same public visibility guard as listing/metadata. Player first, title/save/difficulty below; authorized synchronized transcript beside it on desktop and beneath it on mobile. Permitted machine summaries and detailed evidence stay here, not on cards. Full creator descriptions remain escaped, disclosed as metadata. Back links accept validated root catalog URLs or exact `/saved`.
- `/explore`: permanent redirect to the equivalent root query, preserving existing repeated/shareable filters rather than maintaining a second discovery screen.

Public visibility requires published status, current embeddable metadata, Japanese evidence and a reviewed manual interest. Thumbnails load directly from allowlisted `i.ytimg.com` without a server retention proxy cache; missing thumbnails have a labeled fallback. Native YouTube playback never autoplays. Embeds use youtube-nocookie.com and explicit origin/referrer policy; Made-for-Kids or unknown designations get original links instead. No account, arbitrary transcript endpoint or viewing analytics.

The new specification retains forest `#14251d`, restrained lime `#d7f45b`, warm canvas `#fafaf4`, self-hosted Rethink Sans and Japanese-capable system fallback. Thumbnails stay 16:9; the grid is 3/2/1 columns. Opaque 14px bold level chips use lime for Beginner, blue for Intermediate, orange for Hard and neutral for Unrated; the separate Transcript chip uses forest with ivory text. Labels remain visible so color is not the only distinction. Native selects retain a 12px decorative-chevron inset and 32px text-end reservation; phone refinements use one column so long options remain readable. Focus, reduced motion, 44px controls, source links, consent and privacy boundaries remain. Repository/domain identifiers are intentionally unchanged.

### Shared and personal transcripts

Transcript availability, source, visibility and sharing permission are separate. `Transcript` contains `videoId`, `source` (`whisper|creator_provided`), `visibility` (`private|public`), `sharingPermission` (`unknown|granted`) and timed `segments` (`start,end,text`). Operator imports default to **private/unknown**, including creator-provided material. `npm run transcripts:apply -- --file .local/transcript-decisions.json` validates the whole file, locks affected videos and atomically replaces content/rights; replacement never silently inherits a grant. Public queries require **both public and granted**, plus the normal fresh/reviewed/published video guard. Private segments and permission notes are never selected into public responses.

Sentence highlighting follows the actual YouTube IFrame clock, including gaps/overlaps/exclusive ends. Clicking a timestamp seeks without starting paused playback. Clicking a word opens its dictionary details without seeking or changing playback. Auto-follow is explicit, initially off, and pauses on manual reader interaction. The native YouTube player retains its own controls and policies; it can choose an automatic dub, so select Japanese/original audio in its playback settings when needed for immersion.

Personal JSON/Whisper JSON, VTT and SRT files up to 5 MiB are parsed on-device, always forced private/unknown, and stored per video in browser IndexedDB. Imported public/granted claims are ignored. No file/text upload, server action or model request occurs. Reload restores the local file; confirmed removal deletes it. Blocked/quota storage is reported honestly; an unsaved in-page file is explicitly identified as not persistent.

Public summaries are independently permission-gated and identified as transcript- or metadata-based. Learning records optionally include `summary`, `summaryBasis`, `summarySharingPermission` and private `summaryPermissionNote`; changing summary text resets its grant unless the replacement explicitly supplies real evidence. Source access and ASR generation are not redistribution permission.

### On-device reading aids and dictionary

Furigana and Romaji are independent, initially-off controls; their booleans persist under localStorage key `yorimichi.reader.v1`. If storage is blocked, current-page controls still work with an explicit persistence warning. Ruby annotates known kanji readings; romanization follows Tombo’s WanaKana rules, including borrowed long vowels and small-tsu boundaries. Unknown readings remain unannotated instead of inventing pronunciation.

Tokenization and exact-form/lemma lookup run in a dedicated browser worker, not the web server. Activating a reading aid downloads versioned Kuromoji/IPADIC assets; the first word lookup additionally downloads one fixed full-English dictionary pack. Downloads contain public language data only. Original cue text, source spans and clicked words are passed locally to the worker, never included in network URLs/bodies or sent to a dictionary provider. Recognition and automatic readings can be wrong, especially for names; dictionary senses are not sentence translations.

The reader separates seek controls from lexical word buttons, preserves original cue text/UTF-16 spans and offers arrow/Home/End word navigation. Close/Escape returns focus to the selected word. Dictionary loading, unknown words and failed downloads have distinct states with explicit retry. Readings/word details never overlay or replace the native YouTube player.

The dictionary derives from the full English [JMdict Simplified](https://github.com/scriptin/jmdict-simplified) release `3.6.2+20261102210542`, originally [JMdict/EDRDG](https://www.edrdg.org/jmdict/j_jmdict.html), under [CC BY-SA 4.0](https://www.edrdg.org/edrdg/licence.html). Every dictionary display credits the source. Kuromoji is Apache-2.0, IPADIC has its own required notices, and WanaKana is MIT; the prepared public language assets include distribution notices.

Regenerate the pinned language assets with `npm run language:prepare`. The preparation script verifies the upstream archive SHA-256 before transforming it. The current full-English source archive is 11,540,505 bytes, SHA-256 `bc1c5240dbdb755a00db488dc74ebfc6c33ffc014d261d64b605fd45cc1dbbb5`. Language data is separate from the 30-day YouTube metadata-retention policy. The operator must check for upstream dictionary updates at least monthly, update the release pin/checksum and asset version, regenerate the data, verify actual readings/lookups, and deploy the new version; no automatic dictionary-update schedule is claimed.

The original public demo used three creator-designated Creative Commons Attribution travelogues from 都市タビch: [Changbai border travelogue](https://japanese-content-explorer-p14.vercel.app/videos/c6C46r9cpZc), [Nagasaki city walk](https://japanese-content-explorer-p14.vercel.app/videos/wpqI3dl-rWY), and [Kumamoto city walk](https://japanese-content-explorer-p14.vercel.app/videos/BeJY7fn3Vfc). Official `videos.list status.license=creativeCommon` evidence was captured on 3 November 2026; [YouTube's licensing documentation](https://support.google.com/youtube/answer/2797468?hl=en) explains the creator-selected CC BY reuse grant and attribution requirements. These are license-based permissions, not invented direct creator agreements. Attribution, source, changes and license links accompany the shared text; no endorsement is claimed. Local evidence/decisions remain ignored under `.local/`.

The initial audit found only three CC-designated videos among the original 361. Two workout ASR outputs contained insufficient substantive speech and were excluded from public text/summary publication. A bounded two-query CC/channel search found the two additional narrated city walks; each was freshly enriched and explicitly metadata-reviewed before publication. The other 360 transcripts from that 363-video snapshot remain private.

The 3 November expansion used the existing ten Japanese topic queries with an official Creative Commons search filter: 489 distinct results, 483 new candidates and six refreshed records across 20 API requests. Fifteen candidates received explicit metadata publication review and local Whisper processing. Full machine-text screening approved nine additional transcripts (three cars, three fitness, two gaming and one food); five were held for severe recognition defects and one for unresolved promotional-script authorship. Sponsorship alone is not a disqualification. No bad cues were silently deleted or invented corrections substituted.

The [With transcript catalog](https://japanese-content-explorer-p14.vercel.app/?transcript=available) now has **12 shared transcripts across all five interests**, including 1,724 new cues. Each approved video's official CC/public/embeddable/non-Made-for-Kids/Japanese-audio metadata was checked again immediately before the atomic import. Existing 363 publications and the original three shared transcript hashes were preserved; a nonlicensed negative case remained unavailable. This is machine-output screening, not listening verification, exact subtitle accuracy, an independent ownership audit or a license over music/game assets. Private quality decisions, fresh evidence and verification are `.local/cc-expansion-924c4d45-quality-decisions.json`, `.local/cc-expansion-924c4d45-final-license-evidence.json` and `.local/cc-expansion-924c4d45-verification.json`.

## Local Whisper transcription

The owner's later request adds a separate private operator workflow, not a public transcript endpoint. `scripts/transcribe-local.py` reuses Tombo's installed **mlx-whisper 0.4.3**, **yt-dlp 2026.8.19**, existing ffmpeg/ffprobe and its already-cached `mlx-community/whisper-large-v3-turbo` revision `a4aaeec0636e6fef84abdcbe3544cb2bf7e9f6fb`. It never imports Tombo application code, reads its database/environment/transcripts, or installs another model. Inference is local with the Hugging Face hub forced offline; only audio acquisition contacts YouTube.

```sh
/Users/bayu/nightgig/tombo/server/.venv/bin/python scripts/transcribe-local.py \
  --manifest .local/production-published-cc-924c4d45.json
```

The current manifest contains 378 publications. The latest run resumed 363 completed pairs and generated the 15 additions; one failed Japanese-tagged format selector was recovered explicitly using its listed original, untagged M4A format `140`. Optional `--only YOUTUBE_ID` selects one published video. Output defaults to ignored `.local/transcripts/`: one timestamped JSON and WebVTT file per video, plus `batch.json` with actual per-ID outcomes for the last invocation. Matching pairs resume without downloading/inference again. Temporary audio/downloader metadata are deleted after each attempt. Retries are explicit; no browser-cookie extraction, access bypass or hidden retry loop. A YouTube bot challenge stops the run and leaves pending entries visible.

An explicit `--audio-format 'bestaudio[language^=ja][ext=m4a]'` can select an available original Japanese M4A track when a default audio asset fails. The selector fails if no matching track is available; it does not add automatic retries, cookies or access bypasses. Existing JSON/VTT pairs are left intact on resume; only a missing VTT is regenerated.

JSON includes word timings, model provenance, `machineGenerated: true` and `humanReviewed: false`; WebVTT identifies machine origin. Requested Japanese decoding is not detected-language verification. Empty model results are labeled `no_speech_detected`, never invented text. Recognition may contain errors/hallucinations. Transcription itself never changes publication, language evidence or curator difficulty. Files remain private by default; only separately authorized text copies enter the website. No transcripts/audio enter Git and no media is hosted by the website.

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

### Exercised evidence — local reading and infinite discovery

- All **250 tests passed across 25 files** against the dedicated direct test branch, with no skipped database suites. TypeScript, ESLint and the production build passed. Generated vendor JavaScript is excluded from source linting; the worker's TypeScript remains checked.
- Preparation verified the pinned archive and produced the complete **219,009-entry / 253,928-English-sense** dictionary. Reading data is 17,791,956 bytes; the separately lazy-loaded dictionary is 9,309,045 bytes and the worker is 89,525 bytes. Real browser output included 日本語 / にほんご / nihongo → “Japanese (language)” and 食べ → 食べる → “to eat”. Unknown 𠮷𠮷 received neither invented readings nor definitions.
- Independent toggles survived reload; blocked localStorage retained working current-page controls with a warning. Lookup also worked while seeking was unavailable. An actually blocked worker dictionary request produced the error state; explicit Retry then loaded genuine definitions.
- Native content playback advanced past one second. Word lookup left paused playback at exactly 1.055908 seconds and retained the same iframe; timestamp seeking moved to exactly 15 seconds while remaining paused, followed by the correct active highlight. Arrow/Home/End and Escape restored the expected word focus. No visible Current sentence label remains.
- A four-cue personal file deliberately claiming public/granted was forced browser-private. All original text, supplementary characters and emoji reconstructed exactly after enrichment. Thirty observed requests contained none of its unique marker or source-sentence needles; language downloads used only fixed versioned paths. Reload restored the local cues; confirmed removal plus reload restored the 200 shared cues with no private marker.
- The default first three videos were exactly the authorized shared demos, each tagged Transcript. The next three fetched batches contained 60 distinct IDs and no extra shared flags/private fields. The prominent filter returned three tagged videos and the genuine end state. A real failed infinite request retained loaded cards; Retry continued loading. Hard filtering returned 29 matches. Switching to Gaming reset the feed and detail/back navigation preserved that filter. Saved used the same absolute level/transcript chips.
- Phone/tablet/desktop layouts used the correct 1/2/3 columns with no document overflow at 360/390/768/1280px. Reading controls remained 44px and the smallest native frame was 328×200px. Keyboard Tab crossed an unmounted grid-row boundary with visible focus preserved. A reproduced off-screen dictionary panel now reveals its heading/definition inside the reader without moving page scroll.
- `/api/catalog` returned 401 without acknowledgment, 400 for invalid sort and no-store responses. Four actual public HTML/JSON responses and twelve first-party scripts contained none of five configured sensitive values; the local smoke-file URL returned 404. Hallmark's final rendered sweep reported **0 failures, 0 Reflex findings and 4 reviewed warnings**: three inherited-nowrap static false positives and the pressed-state recipes for independent reader controls.
- After garbage collection, one desktop Chromium worker reported approximately 142 MB JavaScript heap and 94 MB backing storage with the full tokenizer/dictionary loaded. This is an observed local sample, not a low-memory mobile guarantee; keeping all lookup text on-device requires the complete local pack.

Observed mounted-card footprint:

| Browser scenario | Videos loaded | Cards mounted |
| --- | ---: | ---: |
| Desktop infinite feed | 100 | 21 |
| Phone infinite feed | 40 | 7 |


### Exercised evidence — 3 November 2026 specification

- All **194 tests passed** with the dedicated direct Neon test environment, with no skipped database suites. Coverage includes permission combinations/revocation/cascade, whole-file atomicity, summary rights, manual-first estimates, reviewed-topic search, Saved consent/batch/public guards, local bookmark transitions, personal-file parsing/storage and cue timing boundaries. TypeScript, ESLint and the optimized build passed.
- Actual production-built browser proof exercised topic keyword search plus difficulty/duration/transcript/popularity GET state, reload and legacy redirect preservation. The authorized filter returned the three real licensed demos. Discover has 20 actual cards, no sidebar/category portal, no nested card buttons; measured 3/2/1 columns and 16:9 thumbnails.
- Bookmark save → reload → Saved → detail → Back to saved videos worked. Preferences reset → choose Gaming/Food → explicit application → reload restoration → Explore everything worked without silently overriding URLs.
- Actual native content playback advanced from paused/time zero to 1.004938 seconds, duration 535.521 seconds, without an ad. Clicking the 1:59 sentence sought to exactly 119.54 seconds while remaining paused; the corresponding Japanese sentence became current and the iframe was not recreated.
- A personal JSON deliberately claiming public/granted was displayed as browser-private. Two cues survived reload through IndexedDB; 25 observed network requests contained no unique private-text marker. Confirmed removal followed by reload left zero personal cues.
- Phone overflow from an absolutely positioned screen-reader label in the scrolling topic rail was reproduced and fixed by containing it in the rail. Corrected Discover document widths equal 360, 390, 768 and 1280px viewports. Watch layouts at 360/390/1280 likewise had no page overflow; the smallest actual player frame was 328×200px.
- Canvas contrast is 15.73:1 for primary text and 4.94:1 for muted text; stronger input boundaries are 3.40:1. Native controls preserve keyboard operation and 44px bookmark targets.
- Final measurements covered all four main routes at 360/390/768/1280px with zero document overflow. All four native selectors were 44px high, retained 12px chevron inset/32px text reservation, and fit every option. Keyboard Tab moved from Sort to Apply filters with a visible 2px outline.
- Auto-follow moved only the transcript list (0→8,509px) while page scroll stayed at 0 and focus stayed on its toggle; a real wheel event disabled follow. Reduced-motion emulation yielded effectively zero transition duration and automatic, not smooth, scrolling.
- Real blocked localStorage produced the Saved storage-error/retry state, not an invented empty list. Blocked IndexedDB produced an explicit warning while all 200 shared cues remained readable. The acknowledgment surface made zero third-party requests and contained zero media elements.
- A real unavailable database produced the distinct error surface. Restoring access then clicking Next 16’s re-fetching `retry` recovered 20 cards/363 matches; `reset` alone was reproduced as insufficient and is not used. Empty/invalid filters and both reset links also recovered correctly.
- Three actual HTML responses and ten first-party client scripts contained none of five configured secret values/passwords. A non-shared detail serialized `transcript:null`, private evidence was absent, and the operator transcript file URL returned 404.
- Hallmark’s Chromium render ran five captures: **0 failures, 0 Reflex findings, 4 reviewed warnings**. Three are static false positives for inherited `nowrap` (including an invisible new-tab announcement); the other counts the Auto-follow pressed state as another primary CTA across different screens. Its isolated captures show the consent surface; separate consented browser captures cover the actual application. Fresh-context visual review accepted final phone discovery and desktop playback/reader screens.
- One warmed local production-build sample measured LCP 356ms, CLS 0 and no long tasks. This is an observed local sample, not a field-performance guarantee.

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

The initial 361-video output audit (before the two licensed city walks) was:

| Check | Verified result |
| --- | ---: |
| Published videos in snapshot | 361 |
| Complete JSON/WebVTT pairs | 361 |
| Failed or pending videos | 0 |
| Spoken cues | 70,771 |
| Input audio hours | 73.36 |
| Temporary audio files retained | 0 |

The first pass completed 357 videos. Explicit recovery processed only unfinished inputs; existing completed pairs were not transcribed again. Two forbidden media responses succeeded with fresh ordinary downloads; the last unhealthy audio asset succeeded using its listed original Japanese M4A track. One model `avg_logprob` was non-finite: its transcript now retains the speech and valid cues, with that optional score explicitly `null` and flagged in `qualityWarnings`.

Six offline exporter regression tests pass. The initial recovered WebVTT was parsed by ffprobe with 130 packets; that snapshot audit is `.local/transcripts/validation.json`, and `batch-initial.json` preserves the first pass. The later city-walk run completed 363 pairs. The latest expansion completed all **378 JSON/WebVTT pairs**: `.local/transcripts/batch-cc-924c4d45-initial.json` preserves the full run before its one explicit format recovery, and `.local/transcripts/batch.json` records that recovery. Source files/reports remain ignored and private; only separately authorized, quality-screened copies are public as documented above. Completion is not human accuracy, listening or proficiency verification.



### Deployment and operations

- Source: https://github.com/peacemaker14/japanese-content-explorer . Public app: https://japanese-content-explorer-p14.vercel.app . Local runtime uses Neon development; tests use a separate direct test branch.
- Production now contains **378 published videos, 629 held candidates and 0 hidden**: Cars & Driving 85, Fitness & Movement 71, Gaming 83, Food & Cooking 80, Travel & Culture 59. The original 200-total/~40-per-interest targets remain met. Channel variety remains a preference rather than a hard three-per-channel cap; new publications include some existing creators. Development remains separate.
- Original owner approvals remain in `.local/approved-production-first-five.json`. All 516 subsequent decisions are in `.local/assistant-reviewed-production-decisions.json`; `.local/assistant-review-outcomes.json` records rationale and second-pass adjustments. Held reasons overlap: 49 non-Japanese audio tags, 87 missing audio tags, 30 uncertain language content, 9 outside categories, 4 nonverbal and 1 uncertain category. Never describe metadata-only judgments as listening verification.
- Vercel's personal `p14` Hobby deployment has separate Production/Preview credentials and deploys GitHub `main`. Direct migration credentials stay with the operator, not the web deployment. The new permission/learning migration was explicitly applied to development and production before release; builds do not connect to the database. Earlier release evidence is retained above as historical, not a description of the new navigation.
- The production build and live feature checks passed for `627dbfc`: the first three shared videos had absolute thumbnail chips, the public feed loaded another batch through the virtualized grid, and the real public reader displayed 北朝鮮 / きたちょうせん / kitachousen with the JMdict definition “North Korea”. The live catalog API returned 401 without acknowledgment.
- The loading/badge refinement passed TypeScript, ESLint, all 250 tests/25 files against the direct test branch, and the production build. Real delayed API requests showed six desktop/two phone card shimmers, 20→40 loaded items, no visible loading paragraph, bounded virtualized mounts, and no overflow. Failure removed shimmers without losing cards; Retry recovered. Reduced-motion mode had no animation and a hidden shimmer overlay. Level text contrast measured 12.94:1/8.51:1/8.42:1; the narrowest two-column level/transcript pair retained a 45px gap. Hallmark's rendered audit found 0 failures/0 Reflex/4 reviewed warnings; fresh-context source and completed-thumbnail mobile/desktop review returned **ship**.
- The live maintenance endpoint returned 401 without authorization and 200 with a count-only success response using the configured secret. A new successful production refresh row completed after the request's database-clock baseline, with matching response counts and no error. No rows were due, so this invocation made no YouTube requests.
- The authenticated Vercel dashboard confirmed Cron Jobs **Enabled** with `/api/cron/refresh-metadata` scheduled at `0 3 * * *` UTC; Hobby uses a flexible one-hour execution window. Existing Deployment Failures notification channels were all checked, including web/email; no preferences were changed. Configuration does not prove scheduled execution or notification delivery, and deployment-failure notifications are not a claim of runtime cron-failure alerting. Manual maintenance is also available with `node --env-file=.local/production.env node_modules/tsx/dist/cli.mjs scripts/refresh-metadata.ts`. The CLI remains unauthenticated; the dashboard was accessed through an owned browser tab.
- Disposable PostgreSQL/browser fixtures and render captures were removed after proof; real private review exports and operator environment files are retained. Delete API-bearing exports before 30 days. No Tombo application files were changed.
