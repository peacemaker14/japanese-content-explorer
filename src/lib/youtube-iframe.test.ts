import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { PLAYER_STATE, readPlayerTime, seekPlayerTo, type YouTubeApi, type YouTubePlayer } from "./youtube-iframe";

function playerAt(state: number) {
  return {
    getPlayerState: vi.fn(() => state),
    seekTo: vi.fn(),
    pauseVideo: vi.fn(),
    cueVideoById: vi.fn(),
    destroy: vi.fn(),
    getCurrentTime: vi.fn(() => 0),
    getIframe: vi.fn(),
  } satisfies YouTubePlayer;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("native transcript seeking", () => {
  it("seeks a paused player and explicitly keeps it paused, with no play instruction", () => {
    const player = playerAt(PLAYER_STATE.paused);
    expect(seekPlayerTo(player, "abcdefghijk", 12.5)).toBe(true);
    expect(player.seekTo).toHaveBeenCalledWith(12.5, true);
    expect(player.pauseVideo).toHaveBeenCalledOnce();
    expect(player.cueVideoById).not.toHaveBeenCalled();
  });

  it.each([PLAYER_STATE.unstarted, PLAYER_STATE.ended, PLAYER_STATE.cued])("cues rather than starting a nonplaying video in state %s", (state) => {
    const player = playerAt(state);
    expect(seekPlayerTo(player, "abcdefghijk", 8)).toBe(true);
    expect(player.cueVideoById).toHaveBeenCalledWith({ videoId: "abcdefghijk", startSeconds: 8 });
    expect(player.seekTo).not.toHaveBeenCalled();
  });

  it.each([PLAYER_STATE.playing, PLAYER_STATE.buffering])("preserves native playback on a seek in state %s", (state) => {
    const player = playerAt(state);
    expect(seekPlayerTo(player, "abcdefghijk", 3)).toBe(true);
    expect(player.seekTo).toHaveBeenCalledWith(3, true);
    expect(player.pauseVideo).not.toHaveBeenCalled();
  });

  it("does nothing for invalid cue times and reports an unavailable native instance", () => {
    const player = playerAt(PLAYER_STATE.paused);
    for (const time of [NaN, Infinity, -1])
      expect(seekPlayerTo(player, "abcdefghijk", time)).toBe(false);
    expect(player.getPlayerState).not.toHaveBeenCalled();
    player.getPlayerState.mockImplementation(() => { throw new Error("destroyed"); });
    expect(seekPlayerTo(player, "abcdefghijk", 0)).toBe(false);
  });

  it("uses the actual iframe clock, clearing an ended, invalid or destroyed clock", () => {
    const player = playerAt(PLAYER_STATE.playing);
    player.getCurrentTime.mockReturnValue(12.75);
    expect(readPlayerTime(player)).toBe(12.75);
    player.getPlayerState.mockReturnValue(PLAYER_STATE.ended);
    expect(readPlayerTime(player)).toBeNull();
    player.getPlayerState.mockReturnValue(PLAYER_STATE.paused);
    for (const value of [NaN, Infinity, -1]) {
      player.getCurrentTime.mockReturnValue(value);
      expect(readPlayerTime(player)).toBeNull();
    }
    player.getCurrentTime.mockImplementation(() => { throw new Error("destroyed"); });
    expect(readPlayerTime(player)).toBeNull();
  });
});

function browserFixture() {
  const scripts: Array<{
    src: string;
    async: boolean;
    referrerPolicy: string;
    remove: Mock;
    listeners: Map<string, () => void>;
    addEventListener: (name: string, handler: () => void) => void;
    removeEventListener: (name: string) => void;
  }> = [];
  const win: { YT?: YouTubeApi; onYouTubeIframeAPIReady?: () => void } = {};
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", {
    createElement: () => {
      const listeners = new Map<string, () => void>();
      return {
        src: "", async: false, referrerPolicy: "", remove: vi.fn(), listeners,
        addEventListener: (name: string, handler: () => void) => listeners.set(name, handler),
        removeEventListener: (name: string) => listeners.delete(name),
      };
    },
    head: { append: (script: typeof scripts[number]) => scripts.push(script) },
  });
  return { win, scripts };
}

// Fresh imports intentionally reset the loader's module-scoped singleton;
// a static import cannot exercise independent script-failure lifecycles.
describe("IFrame API lifecycle", () => {
  it("shares one script/readiness promise and restores a prior global callback", async () => {
    vi.resetModules();
    const { loadYouTubeIframeApi } = await import("./youtube-iframe");
    const { win, scripts } = browserFixture();
    const previous = vi.fn();
    win.onYouTubeIframeAPIReady = previous;
    const pending = loadYouTubeIframeApi();
    expect(loadYouTubeIframeApi()).toBe(pending);
    expect(scripts).toHaveLength(1);
    expect(scripts[0].referrerPolicy).toBe("strict-origin-when-cross-origin");
    const api = { Player: vi.fn() } as unknown as YouTubeApi;
    win.YT = api;
    win.onYouTubeIframeAPIReady?.();
    await expect(pending).resolves.toBe(api);
    expect(win.onYouTubeIframeAPIReady).toBe(previous);
    expect(previous).toHaveBeenCalledOnce();
    expect(scripts[0].listeners.has("error")).toBe(false);
  });

  it("removes a failed script and allows an explicit retry", async () => {
    vi.resetModules();
    const { loadYouTubeIframeApi } = await import("./youtube-iframe");
    const { scripts } = browserFixture();
    const first = loadYouTubeIframeApi();
    const rejection = expect(first).rejects.toThrow(/content blockers/);
    scripts[0].listeners.get("error")?.();
    await rejection;
    expect(scripts[0].remove).toHaveBeenCalledOnce();
    const second = loadYouTubeIframeApi();
    expect(second).not.toBe(first);
    const secondRejection = expect(second).rejects.toThrow(/could not load/);
    scripts[1].listeners.get("error")?.();
    await secondRejection;
  });

  it("times out a blocked loader rather than leaving a permanent pending state", async () => {
    vi.useFakeTimers();
    vi.resetModules();
    const { loadYouTubeIframeApi } = await import("./youtube-iframe");
    const { scripts } = browserFixture();
    const pending = loadYouTubeIframeApi();
    const rejection = expect(pending).rejects.toThrow(/could not load/);
    await vi.advanceTimersByTimeAsync(15_000);
    await rejection;
    expect(scripts[0].remove).toHaveBeenCalledOnce();
  });
});
