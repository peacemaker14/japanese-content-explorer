import Link from "next/link";
import type { CatalogFilters, InterestWithSubtopics } from "@/lib/catalog-types";
import { difficultyLabels, difficultyValues } from "@/lib/difficulty";
import { TopicChips } from "@/components/TopicChips";
import { UseMyInterests } from "@/components/InterestPicker";

function NativeSelect(props: React.ComponentProps<"select">) {
  return (
    <span className="select-control">
      <select {...props} />
      <svg className="select-chevron" aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m4 6 4 4 4-4" /></svg>
    </span>
  );
}

export function CatalogFilterForm({ filters, interests, clearHref }: {
  filters: CatalogFilters;
  interests: InterestWithSubtopics[];
  clearHref: string;
}) {
  return (
    <form action="/" method="get" className="catalog-filters">
      <div className="search-row">
        <label className="search-field" htmlFor="catalog-search">
          <span className="visually-hidden">Search videos, topics, or channels</span>
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
          <input type="search" id="catalog-search" name="q" maxLength={100} defaultValue={filters.q}
            autoComplete="off" placeholder="Search videos, topics, or channels" />
        </label>
        <button className="button" type="submit">Search</button>
      </div>
      <div className="topic-row">
        <TopicChips filters={filters} interests={interests} />
        <UseMyInterests filters={filters} />
      </div>
      {filters.interests.map((slug) => <input type="hidden" name="interest" value={slug} key={slug} />)}
      <details className="filter-disclosure" open={filters.difficulty !== "all" || filters.duration !== "all" || filters.transcript !== "all" || filters.sort !== "newest" || filters.subtopics.length > 0}>
        <summary>Filters <span className="filter-summary">Difficulty, duration, transcript &amp; sort</span></summary>
      <div className="filter-controls">
        <label htmlFor="catalog-difficulty">Difficulty
          <NativeSelect name="difficulty" id="catalog-difficulty" defaultValue={filters.difficulty} aria-describedby="difficulty-help">
            <option value="all">Any difficulty</option>
            {difficultyValues.filter((value) => value !== "unassessed").map((value) => <option value={value} key={value}>{difficultyLabels[value]}</option>)}
            <option value="unassessed">Unrated</option>
          </NativeSelect>
        </label>
        <label htmlFor="catalog-duration">Duration
          <NativeSelect name="duration" id="catalog-duration" defaultValue={filters.duration}>
            <option value="all">Any duration</option><option value="under-10">Under 10 min</option><option value="10-plus">10+ min</option>
          </NativeSelect>
        </label>
        <label htmlFor="catalog-transcript">Shared transcript
          <NativeSelect name="transcript" id="catalog-transcript" defaultValue={filters.transcript}>
            <option value="all">Any</option><option value="available">Available</option><option value="unavailable">Unavailable</option>
          </NativeSelect>
        </label>
        <label htmlFor="catalog-sort">Sort by
          <NativeSelect name="sort" id="catalog-sort" defaultValue={filters.sort}>
            <option value="newest">Newest</option><option value="popular">Most viewed</option>
          </NativeSelect>
        </label>
        <button className="button button-secondary filter-submit" type="submit">Apply filters</button>
        <Link className="clear-link" href={clearHref}>Clear filters</Link>
      </div>
      <details className="subtopic-disclosure" open={filters.subtopics.length > 0}>
        <summary>Subtopics{filters.subtopics.length ? ` (${filters.subtopics.length} selected)` : ""}</summary>
        <div className="subtopic-groups">
          {interests.map((interest) => (
            <fieldset key={interest.slug}>
              <legend>{interest.name}</legend>
              {interest.subtopics.map((subtopic) => (
                <label className="checkbox-label" key={subtopic.slug}>
                  <input type="checkbox" name="subtopic" value={subtopic.slug} defaultChecked={filters.subtopics.includes(subtopic.slug)} />
                  {subtopic.name}
                </label>
              ))}
            </fieldset>
          ))}
        </div>
        <button className="button button-secondary" type="submit">Apply subtopics</button>
      </details>
      <p className="helper difficulty-help" id="difficulty-help">Machine estimates are approximate; curator ratings take precedence. No JLPT equivalence.</p>
      </details>
    </form>
  );
}
