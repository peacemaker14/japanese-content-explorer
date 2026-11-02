import Link from "next/link";
import type { VideoCardData } from "@/lib/catalog-types";
import { VideoThumbnail } from "@/components/VideoThumbnail";

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
        <VideoThumbnail src={video.thumbnailUrl} />
        <h2 className="video-title" lang="ja">
          {video.title}
        </h2>
      </Link>
      <p className="video-channel" lang="ja">
        {video.channelTitle}
      </p>
      <div className="video-card-meta">
        <span
          aria-label={`Duration ${Math.floor(video.durationSeconds / 60)} minutes ${video.durationSeconds % 60} seconds`}
        >
          {formatDuration(video.durationSeconds)}
        </span>
        <span>From YouTube</span>
      </div>
      <ul className="topic-list" aria-label="Reviewed interests">
        {video.interests.map((interest) => (
          <li key={interest.slug}>{interest.name}</li>
        ))}
      </ul>
    </article>
  );
}
