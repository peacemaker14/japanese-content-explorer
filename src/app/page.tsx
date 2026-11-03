import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listCategories, listVideos } from "@/lib/catalog";
import { CatalogFilterError, parseCatalogFilters } from "@/lib/catalog-filters";
import { CatalogDiscovery } from "@/components/CatalogDiscovery";
import { Button } from "@/components/ui/button";
import { catalogFeedUrl } from "@/lib/catalog-feed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = {
  title: { absolute: "Yorimichi — Discover Japanese videos" },
  alternates: { canonical: "/" },
};

export default async function DiscoverPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  let filters;
  try {
    filters = parseCatalogFilters(raw);
  } catch (error) {
    if (!(error instanceof CatalogFilterError)) throw error;
    return (
      <section className="state-panel">
        <h1>Invalid filters</h1>
        <p>This link contains a filter we can’t use. Reset the filters to discover videos.</p>
        <Button asChild><Link href="/">Reset filters</Link></Button>
      </section>
    );
  }
  const returnTo = catalogFeedUrl(filters);
  if (raw.page !== undefined) redirect(returnTo);
  const [result, interests] = await Promise.all([listVideos(filters), listCategories()]);
  return (
    <section className="discover-screen">
      <header className="discover-hero">
        <h1>Follow your curiosity.</h1>
        <p>Discover Japanese videos about things you already love.</p>
      </header>
      <CatalogDiscovery filters={filters} interests={interests} initialPage={result} filterUrl={returnTo} />
    </section>
  );
}
