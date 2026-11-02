import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";
import { env } from "../env";
import { youtubeIdPattern } from "../taxonomy";

export class YouTubeApiError extends Error {
  constructor(
    public readonly reason: string,
    public readonly httpStatus?: number,
  ) {
    super(`YouTube API: ${reason}`);
    this.name = "YouTubeApiError";
  }
}

/** Never include arbitrary remote messages, fetch errors, URLs or credentials. */
export function sanitizeError(error: unknown): string {
  if (error instanceof YouTubeApiError) return error.message;
  if (
    error instanceof Error &&
    /^(?:Missing|Invalid) configuration: (?:DATABASE_URL|DATABASE_URL_UNPOOLED|YOUTUBE_API_KEY|CRON_SECRET|SITE_URL)$/.test(
      error.message,
    )
  )
    return error.message;
  return "Operation failed; inspect configuration and database availability.";
}

const envelope = z.object({
  items: z.array(z.unknown()),
  nextPageToken: z.string().optional(),
});
const searchItem = z.object({
  id: z.object({ videoId: z.string().regex(youtubeIdPattern) }),
});
const errorEnvelope = z.object({
  error: z.object({
    errors: z.array(z.object({ reason: z.string() })).optional(),
    status: z.string().optional(),
  }),
});
const immediateReasons: Record<string, true> = {
  quotaExceeded: true,
  dailyLimitExceeded: true,
  dailyLimitExceededUnreg: true,
  keyInvalid: true,
  accessNotConfigured: true,
  ipRefererBlocked: true,
  forbidden: true,
  authError: true,
  unauthorized: true,
  insufficientPermissions: true,
  API_KEY_INVALID: true,
  PERMISSION_DENIED: true,
  UNAUTHENTICATED: true,
  RESOURCE_EXHAUSTED: true,
};

export interface YouTubeClientOptions {
  apiKey?: string;
  fetch?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
}
export interface SearchOptions {
  query: string;
  pageToken?: string;
  deadline?: number;
}
export interface SearchResult {
  ids: string[];
  nextPageToken?: string;
}
export interface RequestOptions {
  deadline?: number;
}

export class YouTubeClient {
  requestCount = 0;
  private readonly fetcher: typeof fetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly now: () => number;
  private readonly apiKey?: string;

  constructor(options: YouTubeClientOptions = {}) {
    this.apiKey = options.apiKey;
    this.fetcher = options.fetch ?? fetch;
    this.sleep = options.sleep ?? sleep;
    this.now = options.now ?? Date.now;
  }

  async search({
    query,
    pageToken,
    deadline,
  }: SearchOptions): Promise<SearchResult> {
    const data = await this.request(
      "search",
      {
        part: "snippet",
        type: "video",
        relevanceLanguage: "ja",
        regionCode: "JP",
        maxResults: "50",
        order: "relevance",
        videoDuration: "medium",
        videoEmbeddable: "true",
        safeSearch: "moderate",
        q: query,
        ...(pageToken ? { pageToken } : {}),
      },
      deadline,
    );
    const parsed = z.array(searchItem).safeParse(data.items);
    if (!parsed.success) throw new YouTubeApiError("invalidSearchResponse");
    return {
      ids: parsed.data.map((item) => item.id.videoId),
      nextPageToken: data.nextPageToken,
    };
  }

  async videos(
    ids: string[],
    { deadline }: RequestOptions = {},
  ): Promise<unknown[]> {
    if (ids.length === 0) return [];
    if (ids.length > 50 || ids.some((id) => !youtubeIdPattern.test(id))) {
      throw new YouTubeApiError("invalidVideoIds");
    }
    return (
      await this.request(
        "videos",
        { part: "snippet,contentDetails,statistics,status", id: ids.join(",") },
        deadline,
      )
    ).items;
  }

  private async request(
    endpoint: "search" | "videos",
    parameters: Record<string, string>,
    externalDeadline?: number,
  ) {
    const deadline = externalDeadline ?? this.now() + 35_000;
    const key = this.apiKey ?? env("YOUTUBE_API_KEY");
    if (!key.trim()) throw new Error("Missing configuration: YOUTUBE_API_KEY");
    const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
    url.search = new URLSearchParams({ ...parameters, key }).toString();

    for (let attempt = 0; attempt < 3; attempt++) {
      const remaining = deadline - this.now();
      if (remaining <= 0) throw new YouTubeApiError("deadlineExceeded");
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        Math.min(10_000, remaining),
      );
      let response: Response;
      let body: unknown;
      try {
        this.requestCount++;
        response = await this.fetcher(url, {
          signal: controller.signal,
          cache: "no-store",
        });
        try {
          body = await response.json();
        } catch (error) {
          if (!(error instanceof SyntaxError)) throw error;
          if (response.ok) throw new YouTubeApiError("invalidResponse");
        }
      } catch (error) {
        if (error instanceof YouTubeApiError) throw error;
        clearTimeout(timer);
        if (attempt === 2) throw new YouTubeApiError("transportFailure");
        await this.delay(1000 * (attempt + 1), deadline);
        continue;
      } finally {
        clearTimeout(timer);
      }

      if (response.ok) {
        const parsed = envelope.safeParse(body);
        if (!parsed.success) throw new YouTubeApiError("invalidResponse");
        return parsed.data;
      }
      const parsedError = errorEnvelope.safeParse(body);
      const remoteReason = parsedError.success
        ? (parsedError.data.error.errors?.[0]?.reason ??
          parsedError.data.error.status)
        : undefined;
      // Google reason identifiers are tokens, never free-form messages.
      const reason =
        remoteReason && /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(remoteReason)
          ? remoteReason
          : `http${response.status}`;
      const error = new YouTubeApiError(reason, response.status);
      if (
        Object.hasOwn(immediateReasons, reason) ||
        !(response.status === 429 || response.status >= 500) ||
        attempt === 2
      )
        throw error;
      const retryAfter = response.headers.get("retry-after");
      let delay = 1000 * (attempt + 1);
      if (retryAfter !== null) {
        const seconds = /^\d+(?:\.\d+)?$/.test(retryAfter)
          ? Number(retryAfter) * 1000
          : Date.parse(retryAfter) - this.now();
        if (Number.isFinite(seconds)) delay = Math.max(delay, seconds);
      }
      await this.delay(delay, deadline);
    }
    throw new YouTubeApiError("transportFailure");
  }

  private async delay(milliseconds: number, deadline: number) {
    if (this.now() + milliseconds >= deadline)
      throw new YouTubeApiError("deadlineExceeded");
    await this.sleep(milliseconds);
  }
}
