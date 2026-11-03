"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import Form from "next/form";
import type { CatalogFilters, InterestWithSubtopics } from "@/lib/catalog-types";
import { catalogUrl, parseCatalogFilters } from "@/lib/catalog-filters";
import { catalogFeedUrl } from "@/lib/catalog-feed";
import { difficultyLabels, difficultyValues } from "@/lib/difficulty";
import { TopicChips } from "@/components/TopicChips";
import { UseMyInterests } from "@/components/InterestPicker";
import { useCatalogNavigation } from "@/components/CatalogNavigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function CatalogFilterForm({ filters, interests, clearHref }: {
  filters: CatalogFilters;
  interests: InterestWithSubtopics[];
  clearHref: string;
}) {
  const navigation = useCatalogNavigation();
  const filterKey = catalogFeedUrl(filters);
  const [draft, setDraft] = useState({ key: filterKey, values: filters });
  if (draft.key !== filterKey) {
    // Reset for a new URL intent, not when its server response arrives. Edits made
    // while that response loads stay intact, and the controls never remount.
    setDraft({ key: filterKey, values: filters });
  }
  const values = draft.key === filterKey ? draft.values : filters;
  const updateDraft = <K extends keyof CatalogFilters>(key: K, value: CatalogFilters[K]) => {
    setDraft({ key: filterKey, values: { ...values, [key]: value } });
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    if (!navigation) return;
    const data = new FormData(event.currentTarget);
    const raw: Record<string, string | string[]> = {};
    for (const key of new Set(data.keys())) {
      const entries = data.getAll(key).filter((value): value is string => typeof value === "string");
      raw[key] = entries.length === 1 ? entries[0] : entries;
    }
    const submitted = parseCatalogFilters(raw);
    event.preventDefault();
    navigation.navigate((current) => ({ ...submitted, interests: current.interests, page: 1 }));
  };
  return (
    <Form action="/" className="catalog-filters" scroll={false} onSubmit={submit}>
      <div className="search-row">
        <label className="search-field" htmlFor="catalog-search">
          <span className="search-field-label">Search videos, topics, or channels</span>
          <span className="search-control">
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
            <Input type="search" id="catalog-search" name="q" maxLength={100} value={values.q}
              onChange={(event) => updateDraft("q", event.target.value)}
              autoComplete="off" placeholder="Search videos, topics, or channels" />
          </span>
        </label>
        <Button type="submit">Search</Button>
      </div>
      <div className="topic-row">
        <TopicChips filters={filters} interests={interests} />
        <Button asChild variant="ghost" className="topic-chip transcript-filter">
          <Link
            href={catalogUrl({ ...filters, transcript: filters.transcript === "available" ? "all" : "available", page: 1 })}
            aria-current={filters.transcript === "available" ? "true" : undefined}
            onClick={(event) => navigation?.follow(event, (current) => ({
              ...current, transcript: current.transcript === "available" ? "all" : "available", page: 1,
            }))}
          >
            {filters.transcript === "available" && <span aria-hidden="true">✓ </span>}
            With transcript
            <span className="visually-hidden">{filters.transcript === "available" ? ", remove transcript filter" : ", show videos with a shared transcript"}</span>
          </Link>
        </Button>
        <UseMyInterests filters={filters} />
      </div>
      {filters.interests.map((slug) => <input type="hidden" name="interest" value={slug} key={slug} />)}
      {/* Keep GET values available before Radix hydrates its menu items. */}
      <input type="hidden" name="difficulty" value={values.difficulty} />
      <input type="hidden" name="duration" value={values.duration} />
      <input type="hidden" name="transcript" value={values.transcript} />
      <input type="hidden" name="sort" value={values.sort} />
      <details className="filter-disclosure" open={filters.difficulty !== "all" || filters.duration !== "all" || filters.transcript !== "all" || filters.sort !== "featured" || filters.subtopics.length > 0}>
        <summary>Filters <span className="filter-summary">Difficulty, duration, transcript &amp; sort</span></summary>
      <div className="filter-controls">
        <label htmlFor="catalog-difficulty">Difficulty
          <Select value={values.difficulty} onValueChange={(value) => updateDraft("difficulty", value as CatalogFilters["difficulty"])}>
            <SelectTrigger id="catalog-difficulty" aria-describedby="difficulty-help">
              <SelectValue>{values.difficulty === "all" ? "Any difficulty" : values.difficulty === "unassessed" ? "Unrated" : difficultyLabels[values.difficulty]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any difficulty</SelectItem>
              {difficultyValues.filter((value) => value !== "unassessed").map((value) => <SelectItem value={value} key={value}>{difficultyLabels[value]}</SelectItem>)}
              <SelectItem value="unassessed">Unrated</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label htmlFor="catalog-duration">Duration
          <Select value={values.duration} onValueChange={(value) => updateDraft("duration", value as CatalogFilters["duration"])}>
            <SelectTrigger id="catalog-duration">
              <SelectValue>{values.duration === "all" ? "Any duration" : values.duration === "under-10" ? "Under 10 min" : "10+ min"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any duration</SelectItem><SelectItem value="under-10">Under 10 min</SelectItem><SelectItem value="10-plus">10+ min</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label htmlFor="catalog-transcript">Shared transcript
          <Select value={values.transcript} onValueChange={(value) => updateDraft("transcript", value as CatalogFilters["transcript"])}>
            <SelectTrigger id="catalog-transcript">
              <SelectValue>{values.transcript === "all" ? "Any" : values.transcript === "available" ? "Available" : "Unavailable"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any</SelectItem><SelectItem value="available">Available</SelectItem><SelectItem value="unavailable">Unavailable</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label htmlFor="catalog-sort">Sort by
          <Select value={values.sort} onValueChange={(value) => updateDraft("sort", value as CatalogFilters["sort"])}>
            <SelectTrigger id="catalog-sort">
              <SelectValue>{values.sort === "featured" ? "Featured first" : values.sort === "newest" ? "Newest" : "Most viewed"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="featured">Featured first</SelectItem><SelectItem value="newest">Newest</SelectItem><SelectItem value="popular">Most viewed</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <Button variant="outline" className="filter-submit" type="submit">Apply filters</Button>
        <Button asChild variant="link" className="clear-link">
          <Link href={clearHref} onClick={(event) => navigation?.follow(event, () => parseCatalogFilters({}))}>Clear filters</Link>
        </Button>
      </div>
      <details className="subtopic-disclosure" open={filters.subtopics.length > 0}>
        <summary>Subtopics{filters.subtopics.length ? ` (${filters.subtopics.length} selected)` : ""}</summary>
        <div className="subtopic-groups">
          {interests.map((interest) => (
            <fieldset key={interest.slug}>
              <legend>{interest.name}</legend>
              {interest.subtopics.map((subtopic) => (
                <label className="checkbox-label" key={subtopic.slug}>
                  <Checkbox name="subtopic" value={subtopic.slug} checked={values.subtopics.includes(subtopic.slug)}
                    onCheckedChange={(checked) => updateDraft("subtopics", checked === true
                      ? [...values.subtopics, subtopic.slug]
                      : values.subtopics.filter((slug) => slug !== subtopic.slug))} />
                  {subtopic.name}
                </label>
              ))}
            </fieldset>
          ))}
        </div>
        <Button variant="outline" type="submit">Apply subtopics</Button>
      </details>
      <p className="helper difficulty-help" id="difficulty-help">Levels are approximate; see video notes for their basis. Curator ratings take precedence. No JLPT equivalence.</p>
      </details>
    </Form>
  );
}
