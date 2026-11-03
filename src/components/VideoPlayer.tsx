"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  loadYouTubeIframeApi,
  readPlayerTime,
  seekPlayerTo,
  type YouTubePlayer,
} from "@/lib/youtube-iframe";

const errors: Record<number, string> = {
  100: "This video is unavailable, private or removed.",
  101: "This video does not allow embedded playback.",
  150: "This video does not allow embedded playback.",
  153: "YouTube could not verify the player origin. Check your browser privacy settings or open the original video.",
  2: "YouTube could not load this video ID.",
};

export interface VideoPlayerHandle {
  seekTo(seconds: number): boolean;
}

interface VideoPlayerProps {
  youtubeId: string;
  madeForKids: boolean | null;
  onTimeChange?: (seconds: number | null) => void;
  onReadyChange?: (ready: boolean) => void;
}

export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  function VideoPlayer(
    { youtubeId, madeForKids, onTimeChange, onReadyChange },
    ref,
  ) {
    const container = useRef<HTMLDivElement>(null);
    const instance = useRef<YouTubePlayer | null>(null);
    const ready = useRef(false);
    const callbacks = useRef({ onTimeChange, onReadyChange });
    const [attempt, setAttempt] = useState(0);
    const generation = `${youtubeId}:${madeForKids}:${attempt}`;
    const [feedback, setFeedback] = useState(() => ({
      generation,
      message: "Loading the YouTube player…",
      failed: false,
    }));
    const { message: status, failed } = feedback.generation === generation
      ? feedback
      : { message: "Loading the YouTube player…", failed: false };

    useEffect(() => {
      callbacks.current = { onTimeChange, onReadyChange };
    }, [onTimeChange, onReadyChange]);

    useImperativeHandle(
      ref,
      () => ({
        seekTo(seconds) {
          if (!ready.current || !instance.current) return false;
          return seekPlayerTo(instance.current, youtubeId, seconds);
        },
      }),
      [youtubeId],
    );

    // Cue/highlight updates never recreate the native player. Only a new video,
    // explicit retry or a changed embed designation replaces this instance.
    useEffect(() => {
      if (madeForKids !== false) return;
      let active = true;
      let failedGeneration = false;
      let player: YouTubePlayer | undefined;
      let timeout: number | undefined;
      let clock: number | undefined;
      ready.current = false;
      callbacks.current.onReadyChange?.(false);

      function stopClock() {
        clearInterval(clock);
        clock = undefined;
      }

      function tick() {
        if (!active || !ready.current || !player || document.hidden) return;
        callbacks.current.onTimeChange?.(readPlayerTime(player));
      }

      function visibilityChanged() {
        stopClock();
        if (active && ready.current && !document.hidden) {
          tick();
          clock = window.setInterval(tick, 250);
        }
      }

      function failure(message: string) {
        if (!active) return;
        failedGeneration = true;
        clearTimeout(timeout);
        stopClock();
        ready.current = false;
        callbacks.current.onReadyChange?.(false);
        setFeedback({ generation, message, failed: true });
      }

      function offline() {
        failure(
          "You are offline. Reconnect, then retry or open the original video.",
        );
      }

      window.addEventListener("offline", offline);
      document.addEventListener("visibilitychange", visibilityChanged);
      if (!navigator.onLine) offline();
      else {
        loadYouTubeIframeApi()
          .then((api) => {
            if (!active || failedGeneration || !container.current || !navigator.onLine) return;
            const node = document.createElement("div");
            container.current.replaceChildren(node);
            timeout = window.setTimeout(
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
                onReady: (event) => {
                  if (!active || failedGeneration || !navigator.onLine) return;
                  clearTimeout(timeout);
                  instance.current = event.target;
                  player = event.target;
                  const iframe = event.target.getIframe();
                  iframe.referrerPolicy = "strict-origin-when-cross-origin";
                  iframe.title = "YouTube video player";
                  ready.current = true;
                  setFeedback({ generation, message: "", failed: false });
                  callbacks.current.onReadyChange?.(true);
                  visibilityChanged();
                },
                onStateChange: tick,
                onError: (event) =>
                  failure(
                    errors[event.data] ??
                      "Playback failed. Check your connection and browser playback settings.",
                  ),
                onAutoplayBlocked: () => {
                  if (active && !failedGeneration)
                    setFeedback({
                      generation,
                      message: "Playback was blocked. Use the native play button or open YouTube.",
                      failed: false,
                    });
                },
              },
            });
          })
          .catch(() =>
            failure(
              "The YouTube player could not load. Check your connection and content blockers.",
            ),
          );
      }

      return () => {
        active = false;
        ready.current = false;
        instance.current = null;
        clearTimeout(timeout);
        stopClock();
        window.removeEventListener("offline", offline);
        document.removeEventListener("visibilitychange", visibilityChanged);
        callbacks.current.onReadyChange?.(false);
        try {
          player?.destroy();
        } catch {
          // A removed or browser-blocked iframe may already be destroyed.
        }
      };
    }, [youtubeId, madeForKids, attempt, generation]);

    if (madeForKids !== false)
      return (
        <div className="player-notice">
          <h2>Watch on YouTube</h2>
          <p>
            {madeForKids
              ? "This video is designated Made for Kids."
              : "The creator’s Made-for-Kids designation is unavailable."}{" "}
            We do not embed it here. Transcript seeking is unavailable.
          </p>
          <a
            className="btn"
            href={`https://www.youtube.com/watch?v=${youtubeId}`}
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
          <div className="player-actions">
            <button
              className="btn"
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Retry player
            </button>
            <a
              href={`https://www.youtube.com/watch?v=${youtubeId}`}
              target="_blank"
              rel="noreferrer"
            >
              Open original video
            </a>
          </div>
        )}
      </section>
    );
  },
);

export default VideoPlayer;
