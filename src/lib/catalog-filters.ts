import { taxonomy } from "./taxonomy";
import type { CatalogFilters } from "./catalog-types";
import { difficultyValues, type DifficultyFilter } from "./difficulty";
export type { CatalogFilters } from "./catalog-types";

export class CatalogFilterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogFilterError";
  }
}
const interestSlugs = new Set<string>(taxonomy.map((t) => t.slug));
const subtopicSlugs = new Set<string>(
  taxonomy.flatMap((t) => t.subtopics.map(([slug]) => `${t.slug}/${slug}`)),
);
type RawFilters = Record<string, string | string[] | undefined>;
function scalar(raw: RawFilters, key: string): string | undefined {
  const value = raw[key];
  if (Array.isArray(value))
    throw new CatalogFilterError(`Repeated ${key} filter.`);
  return value;
}
function selections(
  raw: RawFilters,
  key: string,
  allowed: Set<string>,
): string[] {
  const value = raw[key];
  const values =
    value === undefined ? [] : Array.isArray(value) ? value : [value];
  if (values.some((slug) => !allowed.has(slug)))
    throw new CatalogFilterError(`Unknown ${key} filter.`);
  return [...new Set(values)];
}
export function parseCatalogFilters(raw: RawFilters): CatalogFilters {
  const q = (scalar(raw, "q") ?? "").trim();
  if (q.length > 100)
    throw new CatalogFilterError("Search must contain at most 100 characters.");
  const sort = scalar(raw, "sort") ?? "featured";
  if (sort !== "featured" && sort !== "newest" && sort !== "popular")
    throw new CatalogFilterError("Unknown sort filter.");
  const duration = scalar(raw, "duration") ?? "all";
  if (duration !== "all" && duration !== "under-10" && duration !== "10-plus")
    throw new CatalogFilterError("Unknown duration filter.");
  const difficulty = scalar(raw, "difficulty") ?? "all";
  if (
    difficulty !== "all" &&
    !difficultyValues.some((value) => value === difficulty)
  )
    throw new CatalogFilterError("Unknown difficulty filter.");
  const transcript = scalar(raw, "transcript") ?? "all";
  if (transcript !== "all" && transcript !== "available" && transcript !== "unavailable")
    throw new CatalogFilterError("Unknown transcript filter.");
  const rawPage = scalar(raw, "page") ?? "1";
  const page = Number(rawPage);
  if (!/^[1-9]\d*$/.test(rawPage) || !Number.isSafeInteger(page))
    throw new CatalogFilterError("Page must be a positive safe integer.");
  return {
    interests: selections(raw, "interest", interestSlugs),
    subtopics: selections(raw, "subtopic", subtopicSlugs),
    q,
    sort,
    duration,
    difficulty: difficulty as DifficultyFilter,
    transcript,
    page,
  };
}
export function catalogUrl(
  filters: CatalogFilters,
  page = filters.page,
): string {
  const query = new URLSearchParams();
  for (const slug of filters.interests) query.append("interest", slug);
  for (const slug of filters.subtopics) query.append("subtopic", slug);
  if (filters.q) query.set("q", filters.q);
  if (filters.sort !== "featured") query.set("sort", filters.sort);
  if (filters.duration !== "all") query.set("duration", filters.duration);
  if (filters.difficulty !== "all") query.set("difficulty", filters.difficulty);
  if (filters.transcript !== "all") query.set("transcript", filters.transcript);
  if (page !== 1) query.set("page", String(page));
  const suffix = query.toString();
  return `/${suffix ? `?${suffix}` : ""}`;
}
export function validateReturnTo(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  )
    return "/";
  if (value === "/saved") return "/saved";
  try {
    const url = new URL(value, "https://catalog.invalid");
    if (
      url.origin !== "https://catalog.invalid" ||
      (url.pathname !== "/" && url.pathname !== "/explore") ||
      url.hash
    )
      return "/";
    const raw: RawFilters = {};
    for (const key of new Set(url.searchParams.keys())) {
      const values = url.searchParams.getAll(key);
      raw[key] = values.length === 1 ? values[0] : values;
    }
    return catalogUrl(parseCatalogFilters(raw), 1);
  } catch {
    return "/";
  }
}
