import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeJapanese, lookupJapanese, resetJapaneseTools } from "./japanese-tools";
import type { JapaneseWorkerRequest, JapaneseWorkerResponse } from "./japanese-tools-types";

class LocalWorker {
  static instances: LocalWorker[] = [];
  posted: JapaneseWorkerRequest[] = [];
  onmessage: ((event: MessageEvent<JapaneseWorkerResponse>) => void) | null = null;
  onerror: ((event: { preventDefault: () => void }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminate = vi.fn();
  constructor(readonly url: string) { LocalWorker.instances.push(this); }
  postMessage(message: JapaneseWorkerRequest) { this.posted.push(message); }
  reply(message: JapaneseWorkerResponse) { this.onmessage?.({ data: message } as MessageEvent<JapaneseWorkerResponse>); }
}

beforeEach(() => {
  resetJapaneseTools();
  LocalWorker.instances = [];
  vi.stubGlobal("window", {});
  vi.stubGlobal("Worker", LocalWorker);
});
afterEach(() => { resetJapaneseTools(); vi.unstubAllGlobals(); });

describe("lazy private-text Japanese worker boundary", () => {
  it("creates no worker on import/empty work and fails honestly outside a browser", async () => {
    expect(LocalWorker.instances).toHaveLength(0);
    expect(await analyzeJapanese([])).toEqual([]);
    expect(LocalWorker.instances).toHaveLength(0);
    vi.stubGlobal("window", undefined);
    await expect(analyzeJapanese(["猫"])).rejects.toThrow(/browser/u);
    expect(LocalWorker.instances).toHaveLength(0);
  });

  it("activates one fixed same-origin worker and multiplexes request IDs", async () => {
    const first = analyzeJapanese(["猫"]);
    const second = analyzeJapanese(["犬"]);
    expect(LocalWorker.instances).toHaveLength(1);
    const worker = LocalWorker.instances[0];
    expect(worker.url).toBe("/language/ja-20261102-r1/worker.js");
    const [a, b] = worker.posted;
    expect(a.id).not.toBe(b.id);
    worker.reply({ id: b.id, kind: "analyze", result: [[]] });
    worker.reply({ id: a.id, kind: "analyze", result: [[], []] });
    expect(await first).toEqual([[], []]);
    expect(await second).toEqual([[]]);
  });

  it("does not activate for an already-aborted operation or an invalid clicked span", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(analyzeJapanese(["private"], controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    await expect(lookupJapanese({ text: "😀猫", start: 1, end: 2 })).rejects.toThrow(/exact word span/u);
    expect(LocalWorker.instances).toHaveLength(0);
  });

  it("cancels the last consumer by termination and rejects stale results", async () => {
    const controller = new AbortController();
    const work = analyzeJapanese(["private"], controller.signal);
    const rejected = expect(work).rejects.toMatchObject({ name: "AbortError" });
    const oldWorker = LocalWorker.instances[0];
    const id = oldWorker.posted[0].id;
    controller.abort();
    await rejected;
    expect(oldWorker.terminate).toHaveBeenCalledOnce();
    oldWorker.reply({ id, kind: "analyze", result: [[]] });
    const next = analyzeJapanese(["new"]);
    expect(LocalWorker.instances).toHaveLength(2);
    const current = LocalWorker.instances[1];
    current.reply({ id: current.posted[0].id, kind: "analyze", result: [[]] });
    expect(await next).toEqual([[]]);
  });

  it("lets an unrelated pending consumer finish when one cue request aborts", async () => {
    const controller = new AbortController();
    const first = analyzeJapanese(["private old"], controller.signal);
    const rejected = expect(first).rejects.toMatchObject({ name: "AbortError" });
    const second = analyzeJapanese(["public current"]);
    const worker = LocalWorker.instances[0];
    const id = worker.posted[1].id;
    controller.abort();
    await rejected;
    expect(worker.terminate).not.toHaveBeenCalled();
    expect(worker.posted.at(-1)).toMatchObject({ kind: "cancel" });
    worker.reply({ id, kind: "analyze", result: [[]] });
    expect(await second).toEqual([[]]);
  });

  it("reports load failure without a retry loop, and an explicit later activation can retry", async () => {
    const work = analyzeJapanese(["猫"]);
    const rejected = expect(work).rejects.toThrow(/could not load/u);
    const failed = LocalWorker.instances[0];
    failed.onerror?.({ preventDefault: vi.fn() });
    await rejected;
    expect(failed.terminate).toHaveBeenCalledOnce();
    expect(LocalWorker.instances).toHaveLength(1);
    const retry = analyzeJapanese(["猫"]);
    const current = LocalWorker.instances[1];
    current.reply({ id: current.posted[0].id, kind: "analyze", result: [[]] });
    expect(await retry).toEqual([[]]);
  });
});
