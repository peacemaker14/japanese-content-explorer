"use client";

import { createContext, useContext, type MouseEvent } from "react";
import type { CatalogFilters } from "@/lib/catalog-types";

export type CatalogFilterChange = (current: CatalogFilters) => CatalogFilters;
export type CatalogNavigation = {
  navigate: (change: CatalogFilterChange) => void;
  follow: (event: MouseEvent<HTMLAnchorElement>, change: CatalogFilterChange) => void;
};

export const CatalogNavigationContext = createContext<CatalogNavigation | null>(null);

export function useCatalogNavigation() {
  return useContext(CatalogNavigationContext);
}
