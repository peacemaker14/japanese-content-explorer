import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getVideo } from "@/lib/catalog";
import { validateReturnTo } from "@/lib/catalog-filters";
import { youtubeIdPattern } from "@/lib/taxonomy";
import { VideoWorkspace } from "@/components/VideoWorkspace";
import { BookmarkButton } from "@/components/BookmarkButton";
import { DifficultyBadge } from "@/components/DifficultyBadge";
import { formatDuration } from "@/components/VideoCard";
import { difficultyGuidance, presentDifficulty } from "@/lib/difficulty";
import { getPublicTranscript } from "@/lib/transcripts";
import { Button } from "@/components/ui/button";

type DetailProps = {
  params: Promise<{ youtubeId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
const publicVideo = cache(async (youtubeId: string) =>
  youtubeIdPattern.test(youtubeId) ? getVideo(youtubeId) : null,
);
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function generateMetadata({
  params,
}: DetailProps): Promise<Metadata> {
  const { youtubeId } = await params;
  const video = await publicVideo(youtubeId);
  if (!video)
    return {
      title: "Video unavailable",
      robots: { index: false, follow: false },
    };
  return {
    title: video.title,
    alternates: { canonical: `/videos/${video.youtubeId}` },
    description: `Japanese immersion with ${video.channelTitle}. Explore videos by interest and learning difficulty.`,
  };
}

export default async function VideoDetailPage({
  params,
  searchParams,
}: DetailProps) {
  const [{ youtubeId }, query] = await Promise.all([params, searchParams]);
  const video = await publicVideo(youtubeId);
  if (!video) notFound();
  const transcript = await getPublicTranscript(youtubeId);
  const difficulty = presentDifficulty(video.difficulty, video.estimatedDifficulty);
  const returnTo = validateReturnTo(query.returnTo);
  const publishedDate = new Date(video.publishedAt).toLocaleDateString(
    "en-GB",
    { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" },
  );
  const languageEvidence =
    video.languageStatus === "verified_ja"
      ? "Japanese verified by a curator"
      : video.languageStatus === "likely_ja"
        ? "Likely Japanese, based on creator-provided audio metadata"
        : "Japanese not verified";
  return (
    <article className="detail-screen">
      <Button asChild variant="link" className="back-link">
      <Link href={returnTo}>
        {returnTo === "/saved" ? "Back to saved videos" : "Back to Discover"}
      </Link>
      </Button>
      <VideoWorkspace
        youtubeId={video.youtubeId}
        madeForKids={video.madeForKids}
        transcript={transcript}
      >
      <header className="detail-heading">
        <h1 className="japanese-title" lang="ja">
          {video.title}
        </h1>
        <p className="detail-channel" lang="ja">
          {video.channelTitle}
        </p>
        <div className="detail-meta">
          <time dateTime={video.publishedAt}>{publishedDate}</time>
          <span>{formatDuration(video.durationSeconds)}</span>
          {video.viewCount !== null ? (
            <span>{BigInt(video.viewCount).toLocaleString("en-US")} views</span>
          ) : null}
        </div>
        <div className="detail-actions">
          <DifficultyBadge
            difficulty={video.difficulty}
            estimatedDifficulty={video.estimatedDifficulty}
          />
          <BookmarkButton youtubeId={video.youtubeId} title={video.title} />
        </div>
      </header>
        <div className="detail-source">
          <span>Source: YouTube</span>
          <Button asChild variant="outline">
          <a
            href={`https://www.youtube.com/watch?v=${video.youtubeId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Watch on YouTube
            <span className="visually-hidden"> (opens a new tab)</span>
          </a>
          </Button>
        </div>
        <div className="detail-information">
          {video.summary ? (
            <section className="detail-summary" aria-labelledby="summary-heading">
              <h2 id="summary-heading">Video summary</h2>
              <p>{video.summary}</p>
              <p className="helper">
                {video.summaryBasis === "transcript"
                  ? "Machine-generated from the transcript; not verified against the recording."
                  : "Based on video metadata, not a listening review."}
              </p>
            </section>
          ) : null}
          <section className="detail-description">
            <h2>About this video</h2>
            <details className="description-disclosure">
              <summary>Read creator description (video metadata)</summary>
              {video.description ? (
                <p className="source-description" lang="ja">
                  {video.description}
                </p>
              ) : (
                <p className="muted">No description supplied by the creator.</p>
              )}
            </details>
          </section>
          <section className="detail-facts">
            <h2>Video notes</h2>
            <dl>
              <div>
                <dt>Interests</dt>
                <dd>
                  <ul className="plain-topic-list">
                    {video.interests.map((interest) => (
                      <li key={interest.slug}>
                        <Button asChild variant="link">
                        <Link
                          href={`/?${new URLSearchParams({ interest: interest.slug })}`}
                        >
                          {interest.name}
                        </Link>
                        </Button>
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
              {video.subtopics.length > 0 ? (
                <div>
                  <dt>Subtopics</dt>
                  <dd>
                    <ul className="plain-topic-list">
                      {video.subtopics.map((subtopic) => (
                        <li key={subtopic.slug}>
                          <Button asChild variant="link">
                          <Link
                            href={`/?${new URLSearchParams({ subtopic: subtopic.slug })}`}
                          >
                            {subtopic.name}
                          </Link>
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </dd>
                </div>
              ) : null}
              <div>
                <dt>Language evidence</dt>
                <dd>{languageEvidence}</dd>
              </div>
              {video.defaultAudioLanguage ? (
                <div>
                  <dt>API audio language</dt>
                  <dd>{video.defaultAudioLanguage}</dd>
                </div>
              ) : null}
              <div>
                <dt>Difficulty basis</dt>
                <dd>
                  <p>
                    {difficulty.isEstimate
                      ? video.difficultyEstimateNote
                      : difficultyGuidance[video.difficulty]}
                  </p>
                  {video.difficulty !== "unassessed" ? (
                    <p className="helper">Curator assessment; not a JLPT level.</p>
                  ) : null}
                </dd>
              </div>
              {video.format ? (
                <div>
                  <dt>Format</dt>
                  <dd className="format-label">{video.format}</dd>
                </div>
              ) : null}
            </dl>
          </section>
        </div>
      </VideoWorkspace>
    </article>
  );
}
