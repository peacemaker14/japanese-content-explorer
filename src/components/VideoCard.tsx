import Link from "next/link";
import type { VideoCardData } from "@/lib/catalog-types";
import { VideoThumbnail } from "@/components/VideoThumbnail";
import { DifficultyBadge } from "@/components/DifficultyBadge";
import { BookmarkButton } from "@/components/BookmarkButton";

export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function VideoCard({
  video,
  returnTo,
}: {
  video: VideoCardData;
  returnTo: string;
}) {
  const href = `/videos/${video.youtubeId}?${new URLSearchParams({ returnTo })}`;
  return (
    <article className="video-card">
      <Link className="video-card-link" href={href}>
        <div className="video-thumbnail-wrap">
          <VideoThumbnail src={video.thumbnailUrl} />
          <span
            className="video-duration"
            aria-label={`Duration ${Math.floor(video.durationSeconds / 60)} minutes ${video.durationSeconds % 60} seconds`}
          >
            {formatDuration(video.durationSeconds)}
          </span>
        </div>
        <h2 className="video-title" lang="ja">
          {video.title}
        </h2>
      </Link>
      <p className="video-channel" lang="ja">
        {video.channelTitle}
      </p>
      <div className="video-details">
        <DifficultyBadge
          difficulty={video.difficulty}
          estimatedDifficulty={video.estimatedDifficulty}
        />
        <span className="video-source">YouTube</span>
      </div>
      <BookmarkButton youtubeId={video.youtubeId} title={video.title} />
    </article>
  );
}
