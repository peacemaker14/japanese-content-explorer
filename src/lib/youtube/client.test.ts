import { describe, expect, it, vi } from "vitest";
import { YouTubeClient, sanitizeError } from "./client";

const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

describe("official YouTube API client", () => {
  it("retries transport, 429 and 5xx at most three total attempts", async () => {
    for (const failure of ["transport", "429", "503"]) {
      const delays: number[] = [];
      const fetcher = vi.fn<typeof fetch>(async () => {
        if (failure === "transport")
          throw new Error("DO NOT LOG https://secret.example/?key=secret");
        return json(
          { error: { errors: [{ reason: "backendError" }] } },
          Number(failure),
        );
      });
      const client = new YouTubeClient({
        apiKey: "test-only",
        fetch: fetcher,
        sleep: async (ms) => {
          delays.push(ms);
        },
      });
      await expect(client.videos(["abcdefghijk"])).rejects.toThrow(
        failure === "transport" ? "transportFailure" : "backendError",
      );
      expect(fetcher).toHaveBeenCalledTimes(3);
      expect(delays).toEqual([1000, 2000]);
      expect(client.requestCount).toBe(3);
    }
  });
  it.each([
    "quotaExceeded",
    "dailyLimitExceeded",
    "keyInvalid",
    "accessNotConfigured",
  ])(
    "stops immediately on %s and sanitizes remote messages",
    async (reason) => {
      const fetcher = vi.fn<typeof fetch>(async () =>
        json(
          { error: { message: "secret-url-key", errors: [{ reason }] } },
          429,
        ),
      );
      const client = new YouTubeClient({ apiKey: "test-only", fetch: fetcher });
      const error = await client
        .videos(["abcdefghijk"])
        .catch((error) => error);
      expect(sanitizeError(error)).toBe(`YouTube API: ${reason}`);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(sanitizeError(new Error("secret-url-key"))).not.toContain(
        "secret-url-key",
      );
    },
  );
  it("honors Retry-After only when it fits the absolute deadline", async () => {
    let now = 0;
    const delays: number[] = [];
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({}, 429, { "retry-after": "4" }))
      .mockResolvedValueOnce(json({ items: [] }));
    const client = new YouTubeClient({
      apiKey: "test-only",
      fetch: fetcher,
      now: () => now,
      sleep: async (ms) => {
        delays.push(ms);
        now += ms;
      },
    });
    expect(await client.videos(["abcdefghijk"], { deadline: 5000 })).toEqual(
      [],
    );
    expect(delays).toEqual([4000]);
    const tooLate = vi.fn<typeof fetch>(async () =>
      json({}, 503, { "retry-after": "30" }),
    );
    const bounded = new YouTubeClient({
      apiKey: "test-only",
      fetch: tooLate,
      now: () => 0,
      sleep: async () => {
        throw new Error("must not delay");
      },
    });
    await expect(
      bounded.videos(["abcdefghijk"], { deadline: 1000 }),
    ).rejects.toThrow("deadlineExceeded");
    expect(tooLate).toHaveBeenCalledTimes(1);
  });
  it("retries transport failures while consuming a successful response body", async () => {
    const delays: number[] = [];
    const brokenBody = new Response(
      new ReadableStream({
        start(controller) {
          controller.error(
            new TypeError("Connection reset while reading body"),
          );
        },
      }),
    );
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(brokenBody)
      .mockResolvedValueOnce(json({ items: [] }));
    const client = new YouTubeClient({
      apiKey: "test-only",
      fetch: fetcher,
      sleep: async (ms) => {
        delays.push(ms);
      },
    });
    await client.videos(["abcdefghijk"]);
    expect(delays).toEqual([1000]);
    expect(client.requestCount).toBe(2);
  });
  it("does no work past the deadline or for an invalid batch, and rejects malformed successful responses", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => json({ unexpected: [] }));
    const client = new YouTubeClient({
      apiKey: "test-only",
      fetch: fetcher,
      now: () => 100,
    });
    await expect(
      client.videos(["abcdefghijk"], { deadline: 100 }),
    ).rejects.toThrow("deadlineExceeded");
    await expect(client.videos(Array(51).fill("abcdefghijk"))).rejects.toThrow(
      "invalidVideoIds",
    );
    expect(fetcher).not.toHaveBeenCalled();
    await expect(client.videos(["abcdefghijk"])).rejects.toThrow(
      "invalidResponse",
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("aborts a request at the remaining deadline rather than waiting ten seconds", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
        const { promise, reject } = Promise.withResolvers<Response>();
        init?.signal?.addEventListener(
          "abort",
          () => reject(new Error("aborted")),
          { once: true },
        );
        return promise;
      });
      const start = Date.now();
      const client = new YouTubeClient({ apiKey: "test-only", fetch: fetcher });
      const request = expect(
        client.videos(["abcdefghijk"], { deadline: start + 50 }),
      ).rejects.toThrow("deadlineExceeded");
      await vi.advanceTimersByTimeAsync(50);
      await request;
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
