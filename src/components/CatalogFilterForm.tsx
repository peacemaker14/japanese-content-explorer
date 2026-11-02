import Link from "next/link";
import type {
  CatalogFilters,
  InterestWithSubtopics,
} from "@/lib/catalog-types";
import { difficultyLabels, difficultyValues } from "@/lib/difficulty";

export function CatalogFilterForm({
  filters,
  interests,
  clearHref,
}: {
  filters: CatalogFilters;
  interests: InterestWithSubtopics[];
  clearHref: string;
}) {
  const categoryScoped = filters.interests.length === 1;
  return (
    <form action="/explore" method="get" className="catalog-filters">
      <div className="search-row">
        <label className="search-field" htmlFor="catalog-search">
          Title or channel
          <input
            type="search"
            id="catalog-search"
            name="q"
            maxLength={100}
            defaultValue={filters.q}
            autoComplete="off"
          />
        </label>
        <label className="difficulty-field" htmlFor="catalog-difficulty">
          Learning difficulty
          <select
            name="difficulty"
            id="catalog-difficulty"
            defaultValue={filters.difficulty}
            aria-describedby="difficulty-help"
          >
            <option value="all">Any difficulty</option>
            {difficultyValues
              .filter((value) => value !== "unassessed")
              .map((value) => (
                <option value={value} key={value}>
                  {difficultyLabels[value]}
                </option>
              ))}
            <option value="unassessed">Not assessed</option>
          </select>
        </label>
        <label htmlFor="catalog-sort">
          Sort by
          <select name="sort" id="catalog-sort" defaultValue={filters.sort}>
            <option value="newest">Newest</option>
            <option value="popular">Most viewed</option>
          </select>
        </label>
        <label htmlFor="catalog-duration">
          Duration
          <select
            name="duration"
            id="catalog-duration"
            defaultValue={filters.duration}
          >
            <option value="all">Any duration</option>
            <option value="under-10">Under 10 min</option>
            <option value="10-plus">10+ min</option>
          </select>
        </label>
      </div>
      <p className="helper" id="difficulty-help">
        Curator-rated language difficulty, not a JLPT level.
      </p>
      {categoryScoped ? (
        <>
          {filters.interests.map((slug) => (
            <input type="hidden" name="interest" value={slug} key={slug} />
          ))}
          {filters.subtopics.map((slug) => (
            <input type="hidden" name="subtopic" value={slug} key={slug} />
          ))}
        </>
      ) : (
        <div className="topic-disclosures">
          <details
            className="interest-disclosure"
            open={filters.interests.length > 0}
          >
            <summary>
              Interests
              {filters.interests.length
                ? ` (${filters.interests.map((slug) => interests.find((i) => i.slug === slug)?.name).join(", ")})`
                : " (all)"}
            </summary>
            <fieldset className="interest-filter">
              <legend>Interests</legend>
              <div className="checkbox-options">
                {interests.map((interest) => (
                  <label className="checkbox-label" key={interest.slug}>
                    <input
                      type="checkbox"
                      name="interest"
                      value={interest.slug}
                      defaultChecked={filters.interests.includes(interest.slug)}
                    />
                    {interest.name}
                  </label>
                ))}
              </div>
            </fieldset>
          </details>
          <details
            className="subtopic-disclosure"
            open={filters.subtopics.length > 0}
          >
            <summary>
              Subtopics
              {filters.subtopics.length > 0
                ? ` (${filters.subtopics.length} selected)`
                : ""}
            </summary>
            <div className="subtopic-groups">
              {interests.map((interest) => (
                <fieldset key={interest.slug}>
                  <legend>{interest.name}</legend>
                  {interest.subtopics.map((subtopic) => (
                    <label className="checkbox-label" key={subtopic.slug}>
                      <input
                        type="checkbox"
                        name="subtopic"
                        value={subtopic.slug}
                        defaultChecked={filters.subtopics.includes(
                          subtopic.slug,
                        )}
                      />
                      {subtopic.name}
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>
          </details>
        </div>
      )}
      <div className="filter-actions">
        <button className="button" type="submit">
          Apply filters
        </button>
        <Link className="clear-link" href={clearHref}>
          Clear filters
        </Link>
      </div>
    </form>
  );
}
