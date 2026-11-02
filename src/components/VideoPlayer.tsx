"use client";
import { useEffect, useRef, useState } from "react";
import { loadYouTubeIframeApi, type YouTubePlayer } from "@/lib/youtube-iframe";
const errors: Record<number, string> = {
  100: "This video is unavailable, private or removed.",
  101: "This video does not allow embedded playback.",
  150: "This video does not allow embedded playback.",
  153: "YouTube could not verify the player origin. Check your browser privacy settings or open the original video.",
  2: "YouTube could not load this video ID.",
};
export function VideoPlayer({
  youtubeId,
  madeForKids,
}: {
  youtubeId: string;
  madeForKids: boolean | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState("Loading the YouTube player…");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (madeForKids !== false) return;
    let active = true;
    let player: YouTubePlayer | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const valid = () => active;
    function failure(message: string) {
      if (valid()) {
        clearTimeout(timeout);
        setStatus(message);
        setFailed(true);
      }
    }
    function offline() {
      failure(
        "You are offline. Reconnect, then retry or open the original video.",
      );
    }
    window.addEventListener("offline", offline);
    if (!navigator.onLine) offline();
    else
      loadYouTubeIframeApi()
        .then((api) => {
          if (!valid() || !container.current) return;
          const node = document.createElement("div");
          container.current.replaceChildren(node);
          timeout = setTimeout(
            () =>
              failure(
                "The player is blocked or taking too long. Check your connection and privacy settings.",
              ),
            15000,
          );
          player = new api.Player(node, {
            host: "https://www.youtube-nocookie.com",
            width: "100%",
            height: "100%",
            videoId: youtubeId,
            playerVars: {
              autoplay: 0,
              controls: 1,
              playsinline: 1,
              origin: window.location.origin,
            },
            events: {
              onReady: () => {
                if (valid()) {
                  clearTimeout(timeout);
                  setStatus("");
                }
              },
              onError: (e) =>
                failure(
                  errors[e.data] ??
                    "Playback failed. Check your connection and browser playback settings.",
                ),
              onAutoplayBlocked: () =>
                failure(
                  "Playback was blocked. Use the native play button or open YouTube.",
                ),
            },
          });
        })
        .catch((e) =>
          failure(
            e instanceof Error ? e.message : "The player could not load.",
          ),
        );
    return () => {
      active = false;
      clearTimeout(timeout);
      window.removeEventListener("offline", offline);
      player?.destroy();
    };
  }, [youtubeId, madeForKids, attempt]);
  if (madeForKids !== false)
    return (
      <div className="player-notice">
        <h2>Watch on YouTube</h2>
        <p>
          {madeForKids
            ? "This video is designated Made for Kids."
            : "The creator’s Made-for-Kids designation is unavailable."}{" "}
          We do not embed it here.
        </p>
        <a
          className="btn"
          href={"https://www.youtube.com/watch?v=" + youtubeId}
          target="_blank"
          rel="noreferrer"
        >
          Open original video
        </a>
      </div>
    );
  return (
    <section aria-label="YouTube video player">
      <div
        className="player-frame"
        style={{ aspectRatio: "16/9", minWidth: 200, minHeight: 200 }}
        ref={container}
      />
      {status && <p role={failed ? "alert" : "status"}>{status}</p>}
      {failed && (
        <button
          className="btn"
          type="button"
          onClick={() => {
            setFailed(false);
            setStatus("Loading the YouTube player…");
            setAttempt((n) => n + 1);
          }}
        >
          Retry player
        </button>
      )}
    </section>
  );
}
export default VideoPlayer;
