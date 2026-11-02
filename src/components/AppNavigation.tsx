"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { InterestIcon } from "@/components/InterestIcon";
import { taxonomy } from "@/lib/taxonomy";
import {
  CatalogFilterError,
  catalogUrl,
  parseCatalogFilters,
} from "@/lib/catalog-filters";
import type { CatalogFilters } from "@/lib/catalog-types";

const defaults = parseCatalogFilters({});
const shortNames: Record<string, string> = {
  "cars-driving": "Cars",
  "fitness-movement": "Movement",
  gaming: "Games",
  "food-cooking": "Food",
  "travel-culture": "Travel",
};
const utilityPaths: Record<string, React.ReactNode> = {
  home: <path d="m3 10 9-7 9 7v10h-6v-7H9v7H3Z" />,
  browse: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  mix: (
    <>
      <path d="M4 7h9m4 0h3M4 17h3m4 0h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
};

function UtilityIcon({ name }: { name: string }) {
  return (
    <svg
      aria-hidden="true"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {utilityPaths[name]}
    </svg>
  );
}

function NavigationContent({
  pathname = "",
  filters = defaults,
}: {
  pathname?: string;
  filters?: CatalogFilters;
}) {
  const links = (
    <>
      <Link
        className="rail-link"
        href="/"
        aria-current={pathname === "/" ? "page" : undefined}
      >
        <UtilityIcon name="home" />
        <span>Home</span>
      </Link>
      <Link
        className="rail-link"
        href="/explore"
        aria-current={
          pathname === "/explore" && filters.interests.length === 0
            ? "page"
            : undefined
        }
      >
        <UtilityIcon name="browse" />
        <span>Browse</span>
      </Link>
      {taxonomy.map((category) => (
        <Link
          className="rail-link"
          key={category.slug}
          href={catalogUrl({
            ...filters,
            interests: [category.slug],
            subtopics: [],
            page: 1,
          })}
          aria-label={category.name}
          title={category.name}
          aria-current={
            pathname === "/explore" &&
            filters.interests.length === 1 &&
            filters.interests[0] === category.slug
              ? "page"
              : undefined
          }
        >
          <InterestIcon slug={category.slug} />
          <span>{shortNames[category.slug]}</span>
        </Link>
      ))}
      <Link className="rail-link" href="/#mix-interests">
        <UtilityIcon name="mix" />
        <span>Mix interests</span>
      </Link>
    </>
  );
  return (
    <>
      <aside className="app-sidebar">
        <div className="rail-inner">
          <Link className="rail-brand" href="/" aria-label="Yorimichi home">
            <span aria-hidden="true">Y</span>
          </Link>
          <nav className="rail-navigation" aria-label="Main navigation">
            {links}
          </nav>
        </div>
      </aside>
      <div className="mobile-navigation">
        <Link className="mobile-brand" href="/" aria-label="Yorimichi home">
          Yorimichi
        </Link>
        <details className="mobile-menu">
          <summary>Menu</summary>
          <nav
            className="mobile-menu-links"
            aria-label="Main navigation"
            onClick={(event) => {
              if (
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              )
                return;
              if (
                !(event.target instanceof Element) ||
                !event.target.closest("a")
              )
                return;
              const menu = event.currentTarget.closest("details");
              menu?.querySelector("summary")?.focus();
              menu?.removeAttribute("open");
            }}
          >
            {links}
          </nav>
        </details>
      </div>
    </>
  );
}

export function AppNavigationFallback() {
  return <NavigationContent />;
}

export function AppNavigation() {
  const pathname = usePathname();
  const params = useSearchParams();
  let filters = defaults;
  if (pathname === "/explore") {
    const raw: Record<string, string | string[] | undefined> = {};
    for (const key of new Set(params.keys())) {
      const values = params.getAll(key);
      raw[key] = values.length === 1 ? values[0] : values;
    }
    try {
      filters = parseCatalogFilters(raw);
    } catch (error) {
      if (!(error instanceof CatalogFilterError)) throw error;
    }
  }
  return <NavigationContent pathname={pathname} filters={filters} />;
}
