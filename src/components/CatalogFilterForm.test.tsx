import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CatalogFilterForm } from "./CatalogFilterForm";
import { parseCatalogFilters } from "@/lib/catalog-filters";
import type { CatalogFilters } from "@/lib/catalog-types";

function render(filters: CatalogFilters) {
  return renderToStaticMarkup(<CatalogFilterForm filters={filters} interests={[]} clearHref="/" />);
}

function transcriptLink(filters: CatalogFilters) {
  const markup = render(filters);
  const anchor = [...markup.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)]
    .find((match) => match[2].includes("With transcript"));
  if (!anchor) throw new Error("Missing transcript filter link");
  const href = anchor[1].match(/href="([^"]*)"/)?.[1];
  if (!href) throw new Error("Missing transcript filter destination");
  const url = new URL(href.replaceAll("&amp;", "&"), "https://example.test");
  const raw: Record<string, string | string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key);
    raw[key] = values.length === 1 ? values[0] : values;
  }
  return { attributes: anchor[1], filters: parseCatalogFilters(raw) };
}

describe("prominent transcript filter", () => {
  it.each(["all", "unavailable", "available"] as const)("toggles %s without dropping another facet, and resets the internal page", (transcript) => {
    const filters = parseCatalogFilters({
      interest: ["gaming", "food-cooking"],
      subtopic: ["gaming/reviews", "food-cooking/coffee"],
      q: "100% _ \\ 日本語",
      duration: "10-plus",
      difficulty: "advanced",
      sort: "newest",
      transcript,
      page: "4",
    });
    const next = transcriptLink(filters);
    expect(next.filters).toEqual({
      ...filters,
      transcript: transcript === "available" ? "all" : "available",
      page: 1,
    });
    expect(next.attributes.includes('aria-current="true"')).toBe(transcript === "available");
  });
});
