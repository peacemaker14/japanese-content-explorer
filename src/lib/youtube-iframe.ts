export interface YouTubePlayer {
  destroy(): void;
  getCurrentTime(): number;
  getPlayerState(): number;
}
export interface PlayerEvent {
  target: YouTubePlayer;
  data: number;
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
        onError: (e: PlayerEvent) => void;
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
