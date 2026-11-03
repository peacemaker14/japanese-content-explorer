"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { VideoCard } from "@/components/VideoCard";
import { useBookmarks } from "@/lib/use-bookmarks";
import { resolveSavedVideos, type SavedVideosResult } from "./actions";
import { Button } from "@/components/ui/button";

const pageSize = 20;

export function SavedVideos() {
  const { ids, hydrated, error, retry } = useBookmarks();
  const [requestedPage, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [response, setResponse] = useState<{ key: string; result: SavedVideosResult } | null>(null);
  const totalPages = Math.max(1, Math.ceil(ids.length / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const pageIds = ids.slice((page - 1) * pageSize, page * pageSize);
  const idsKey = JSON.stringify(pageIds);
  const requestKey = `${idsKey}:${attempt}`;

  useEffect(() => {
    if (!hydrated || error || idsKey === "[]") return;
    let active = true;
    const requestedIds: string[] = JSON.parse(idsKey);
    void resolveSavedVideos(requestedIds).then(
      (result) => { if (active) setResponse({ key: requestKey, result }); },
      () => {
        if (active) setResponse({ key: requestKey, result: { status: "error", message: "Saved video information could not be loaded. Your saved IDs are unchanged. Please retry." } });
      },
    );
    return () => { active = false; };
  }, [hydrated, error, idsKey, requestKey]);

  if (!hydrated) return <p className="saved-status" role="status">Loading saved videos from this browser…</p>;
  if (error) {
    return (
      <section className="empty-state">
        <h2>Browser storage is unavailable</h2>
        <p className="saved-status" role="alert">{error}</p>
        <Button variant="outline" type="button" onClick={retry}>Retry browser storage</Button>
      </section>
    );
  }
  if (ids.length === 0) {
    return (
      <section className="empty-state">
        <h2>Save videos you want to come back to.</h2>
        <p>Use the bookmark button on a video to keep it here.</p>
        <Button asChild variant="outline"><Link href="/">Discover videos</Link></Button>
      </section>
    );
  }

  const result = response?.key === requestKey ? response.result : null;
  const unavailable = result?.status === "ok" ? pageIds.length - result.items.length : 0;
  return (
    <>
      <p className="saved-status">{ids.length} saved {ids.length === 1 ? "video" : "videos"} in this browser</p>
      {!result ? <p className="saved-status" role="status">Loading current video information…</p> : null}
      {result?.status === "consent-required" ? (
        <section className="empty-state">
          <h2>Privacy acknowledgment needed</h2>
          <p>{result.message}</p>
          <Button asChild variant="outline"><Link href="/welcome?next=%2Fsaved">Review privacy and terms</Link></Button>
        </section>
      ) : null}
      {result?.status === "error" ? (
        <section className="empty-state">
          <h2>Saved videos could not be loaded</h2>
          <p className="saved-status" role="alert">{result.message}</p>
          <Button variant="outline" type="button" onClick={() => setAttempt((value) => value + 1)}>Retry loading videos</Button>
        </section>
      ) : null}
      {result?.status === "ok" ? (
        <>
          {unavailable > 0 ? (
            <p className="saved-status" role="status">
              {unavailable} saved {unavailable === 1 ? "video on this page is" : "videos on this page are"} currently unavailable. Hidden, removed, or out-of-date video information is not shown. Their IDs remain saved in this browser.
            </p>
          ) : null}
          {unavailable > 0 && result.items.length > 0 ? (
            <Button variant="outline" type="button" onClick={() => setAttempt((value) => value + 1)}>Retry unavailable videos</Button>
          ) : null}
          {result.items.length > 0 ? (
            <div className="video-grid">
              {result.items.map((video) => <VideoCard key={video.youtubeId} video={video} returnTo="/saved" />)}
            </div>
          ) : (
            <section className="empty-state">
              <h2>No available videos on this page</h2>
              <p>Your saved IDs are unchanged. You can retry later or discover other videos.</p>
              <Button variant="outline" type="button" onClick={() => setAttempt((value) => value + 1)}>Retry loading videos</Button>
              <Button asChild variant="outline"><Link href="/">Discover videos</Link></Button>
            </section>
          )}
        </>
      ) : null}
      {totalPages > 1 ? (
        <nav className="saved-pagination" aria-label="Saved video pages">
          <Button variant="outline" type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span aria-live="polite">Page {page} of {totalPages}</span>
          <Button variant="outline" type="button" disabled={page === totalPages} onClick={() => setPage(page + 1)}>Next</Button>
        </nav>
      ) : null}
    </>
  );
}
