import Link from "next/link";
import { catalogUrl } from "@/lib/catalog-filters";
import type { CatalogFilters, InterestWithSubtopics } from "@/lib/catalog-types";

const shortNames: Record<string, string> = {
  "cars-driving": "Cars",
  "fitness-movement": "Fitness",
  gaming: "Gaming",
  "food-cooking": "Food",
  "travel-culture": "Travel",
};

export function TopicChips({ filters, interests }: {
  filters: CatalogFilters;
  interests: InterestWithSubtopics[];
}) {
  return (
    <nav className="topic-chips" aria-label="Filter by topic">
      <Link className="topic-chip" href={catalogUrl({ ...filters, interests: [], subtopics: [], page: 1 })}
        aria-current={filters.interests.length === 0 && filters.subtopics.length === 0 ? "true" : undefined}>
        All
      </Link>
      {interests.map((interest) => {
        const selected = filters.interests.includes(interest.slug);
        const nextInterests = selected
          ? filters.interests.filter((slug) => slug !== interest.slug)
          : [...filters.interests, interest.slug];
        return (
          <Link className="topic-chip" key={interest.slug}
            href={catalogUrl({ ...filters, interests: nextInterests, page: 1 })}
            aria-current={selected ? "true" : undefined}>
            {selected && <span aria-hidden="true">✓ </span>}{shortNames[interest.slug] ?? interest.name}
            <span className="visually-hidden">{selected ? ", remove topic filter" : ", add topic filter"}</span>
          </Link>
        );
      })}
    </nav>
  );
}
