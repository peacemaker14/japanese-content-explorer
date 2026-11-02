import Link from "next/link";
import type {
  CatalogFilters,
  InterestWithSubtopics,
} from "@/lib/catalog-types";

export function CatalogFilterForm({
  filters,
  interests,
}: {
  filters: CatalogFilters;
  interests: InterestWithSubtopics[];
}) {
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
            <option value="under-10">Under 10 minutes</option>
            <option value="10-plus">10 minutes or more</option>
          </select>
        </label>
      </div>
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
                    defaultChecked={filters.subtopics.includes(subtopic.slug)}
                  />
                  {subtopic.name}
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      </details>
      <div className="filter-actions">
        <button className="button" type="submit">
          Apply filters
        </button>
        <Link className="clear-link" href="/explore">
          Clear filters
        </Link>
      </div>
    </form>
  );
}
