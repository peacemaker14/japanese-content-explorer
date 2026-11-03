"use client";

import Link from "next/link";
import { catalogUrl } from "@/lib/catalog-filters";
import type { CatalogFilters, InterestWithSubtopics } from "@/lib/catalog-types";
import { useCatalogNavigation } from "@/components/CatalogNavigation";
import { Button } from "@/components/ui/button";

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
  const navigation = useCatalogNavigation();
  return (
    <nav className="topic-chips" aria-label="Filter by topic">
      <Button asChild variant="ghost" className="topic-chip">
        <Link href={catalogUrl({ ...filters, interests: [], subtopics: [], page: 1 })}
          aria-current={filters.interests.length === 0 && filters.subtopics.length === 0 ? "true" : undefined}
          onClick={(event) => navigation?.follow(event, (current) => ({ ...current, interests: [], subtopics: [], page: 1 }))}>
          All
        </Link>
      </Button>
      {interests.map((interest) => {
        const selected = filters.interests.includes(interest.slug);
        const nextInterests = selected
          ? filters.interests.filter((slug) => slug !== interest.slug)
          : [...filters.interests, interest.slug];
        return (
          <Button asChild variant="ghost" className="topic-chip" key={interest.slug}>
            <Link href={catalogUrl({ ...filters, interests: nextInterests, page: 1 })}
              aria-current={selected ? "true" : undefined}
              onClick={(event) => navigation?.follow(event, (current) => ({
                ...current,
                interests: current.interests.includes(interest.slug)
                  ? current.interests.filter((slug) => slug !== interest.slug)
                  : [...current.interests, interest.slug],
                page: 1,
              }))}>
              {selected && <span aria-hidden="true">✓ </span>}{shortNames[interest.slug] ?? interest.name}
              <span className="visually-hidden">{selected ? ", remove topic filter" : ", add topic filter"}</span>
            </Link>
          </Button>
        );
      })}
    </nav>
  );
}
