import Link from "next/link";
import type { CatalogFilters } from "@/lib/catalog-types";
import { catalogUrl } from "@/lib/catalog-filters";

export function CatalogPagination({
  filters,
  page,
  totalPages,
}: {
  filters: CatalogFilters;
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;
  const pages = [
    ...new Set(
      [1, page - 1, page, page + 1, totalPages].filter(
        (value) => value >= 1 && value <= totalPages,
      ),
    ),
  ].sort((a, b) => a - b);
  return (
    <nav className="pagination" aria-label="Video result pages">
      {page > 1 ? (
        <Link
          className="page-link"
          href={catalogUrl(filters, page - 1)}
          rel="prev"
        >
          Previous
        </Link>
      ) : (
        <span className="page-link unavailable" aria-disabled="true">
          Previous
        </span>
      )}
      <div className="page-numbers">
        {pages.map((value, index) => (
          <span className="page-number-item" key={value}>
            {index > 0 && value - pages[index - 1] > 1 ? (
              <span className="page-gap" aria-hidden="true">
                …
              </span>
            ) : null}
            <Link
              className="page-link"
              href={catalogUrl(filters, value)}
              aria-label={`Page ${value}`}
              aria-current={value === page ? "page" : undefined}
            >
              {value}
            </Link>
          </span>
        ))}
      </div>
      {page < totalPages ? (
        <Link
          className="page-link"
          href={catalogUrl(filters, page + 1)}
          rel="next"
        >
          Next
        </Link>
      ) : (
        <span className="page-link unavailable" aria-disabled="true">
          Next
        </span>
      )}
      <p className="pagination-caption">
        Page {page} of {totalPages}
      </p>
    </nav>
  );
}
