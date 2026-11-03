export interface YouTubePlayer {
  destroy(): void;
  getCurrentTime(): number;
  getPlayerState(): number;
  getIframe(): HTMLIFrameElement;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  pauseVideo(): void;
  cueVideoById(options: { videoId: string; startSeconds: number }): void;
}

export interface PlayerEvent {
  target: YouTubePlayer;
}

export interface PlayerStateEvent extends PlayerEvent {
  data: number;
}

export const PLAYER_STATE = {
  unstarted: -1,
  ended: 0,
  playing: 1,
  paused: 2,
  buffering: 3,
  cued: 5,
} as const;

/** Clear the active line after native playback ends, even with rounded clocks. */
export function readPlayerTime(player: YouTubePlayer): number | null {
  try {
    if (player.getPlayerState() === PLAYER_STATE.ended) return null;
    const seconds = player.getCurrentTime();
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
  } catch {
    return null;
  }
}

/**
 * A transcript click is a seek, never an instruction to start playback.
 * Cueing an unstarted/ended video avoids seekTo's implicit playback there.
 */
export function seekPlayerTo(
  player: YouTubePlayer,
  videoId: string,
  seconds: number,
): boolean {
  if (!Number.isFinite(seconds) || seconds < 0) return false;
  try {
    const state = player.getPlayerState();
    if (
      state === PLAYER_STATE.unstarted ||
      state === PLAYER_STATE.ended ||
      state === PLAYER_STATE.cued
    ) {
      player.cueVideoById({ videoId, startSeconds: seconds });
    } else {
      player.seekTo(seconds, true);
      if (state !== PLAYER_STATE.playing && state !== PLAYER_STATE.buffering)
        player.pauseVideo();
    }
    return true;
  } catch {
    return false;
  }
}

export interface YouTubeApi {
  Player: new (
    element: HTMLElement,
    options: {
      host: string;
      width: string;
      height: string;
      videoId: string;
      playerVars: { autoplay: 0; controls: 1; playsinline: 1; origin: string };
      events: {
        onReady: (e: PlayerEvent) => void;
        onStateChange: (e: PlayerStateEvent) => void;
        onError: (e: PlayerStateEvent) => void;
        onAutoplayBlocked: () => void;
      };
    },
  ) => YouTubePlayer;
}
declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}
let pending: Promise<YouTubeApi> | undefined;
export function loadYouTubeIframeApi(): Promise<YouTubeApi> {
  if (typeof window === "undefined")
    return Promise.reject(new Error("The YouTube player needs a browser."));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (pending) return pending;
  pending = new Promise<YouTubeApi>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.referrerPolicy = "strict-origin-when-cross-origin";
    const timer = setTimeout(failed, 15000);
    function cleanup() {
      clearTimeout(timer);
      script.removeEventListener("error", failed);
      if (window.onYouTubeIframeAPIReady === ready)
        window.onYouTubeIframeAPIReady = previous;
    }
    function failed() {
      cleanup();
      script.remove();
      pending = undefined;
      reject(
        new Error(
          "The YouTube player could not load. Check your connection and content blockers.",
        ),
      );
    }
    function ready() {
      if (!window.YT?.Player) {
        failed();
        return;
      }
      cleanup();
      resolve(window.YT);
      previous?.();
    }
    window.onYouTubeIframeAPIReady = ready;
    script.addEventListener("error", failed, { once: true });
    document.head.append(script);
  });
  return pending;
}
