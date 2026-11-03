"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import Form from "next/form";
import { taxonomy } from "@/lib/taxonomy";
import { catalogUrl } from "@/lib/catalog-filters";
import type { CatalogFilters } from "@/lib/catalog-types";
import { InterestIcon } from "@/components/InterestIcon";
import { useCatalogNavigation } from "@/components/CatalogNavigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

const storageKey = "jce.interests.v1";
const allowed = new Set<string>(taxonomy.map((interest) => interest.slug));
type Preferences = { selected: string[]; unavailable: boolean };
const empty: Preferences = { selected: [], unavailable: false };
let snapshot = empty;
let serialized: string | null | undefined;
let memoryOnly = false;
const listeners = new Set<() => void>();

function readPreferences() {
  if (memoryOnly) return snapshot;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw !== serialized) {
      serialized = raw;
      let selected: string[] = [];
      try {
        const value: unknown = JSON.parse(raw ?? "[]");
        if (Array.isArray(value)) {
          selected = [...new Set(value.filter((slug): slug is string => typeof slug === "string" && allowed.has(slug)))];
        }
      } catch {
        // Corrupt preferences never alter a shared discovery URL.
      }
      snapshot = { selected, unavailable: false };
    }
  } catch {
    memoryOnly = true;
    snapshot = { ...snapshot, unavailable: true };
  }
  return snapshot;
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  function onStorage(event: StorageEvent) {
    if (event.key === storageKey || event.key === null) listener();
  }
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}
function serverPreferences() { return empty; }
function setPreferences(selected: string[]) {
  snapshot = { selected, unavailable: memoryOnly };
  if (!memoryOnly) {
    try {
      if (selected.length) {
        serialized = JSON.stringify(selected);
        localStorage.setItem(storageKey, serialized);
      } else {
        localStorage.removeItem(storageKey);
        serialized = null;
      }
    } catch {
      memoryOnly = true;
      snapshot = { selected, unavailable: true };
    }
  }
  for (const listener of listeners) listener();
}
function usePreferences() {
  return useSyncExternalStore(subscribe, readPreferences, serverPreferences);
}

export function UseMyInterests({ filters }: { filters: CatalogFilters }) {
  const { selected } = usePreferences();
  const navigation = useCatalogNavigation();
  return selected.length ? (
    <Button asChild variant="link" className="preference-link">
      <Link href={catalogUrl({ ...filters, interests: selected, subtopics: [], page: 1 })}
        onClick={(event) => navigation?.follow(event, (current) => ({ ...current, interests: selected, subtopics: [], page: 1 }))}>
        Use my interests
      </Link>
    </Button>
  ) : (
    <Button asChild variant="link" className="preference-link"><Link href="/interests">Choose my interests</Link></Button>
  );
}

export function InterestPicker() {
  const { selected, unavailable } = usePreferences();
  return (
    <Form action="/" className="interest-picker">
      <fieldset>
        <legend className="visually-hidden">Choose your interests</legend>
        <div className="interest-options">
          {taxonomy.map((interest) => (
            <label className="interest-option" key={interest.slug}>
              <Checkbox name="interest" value={interest.slug}
                checked={selected.includes(interest.slug)}
                onCheckedChange={(checked) => {
                  const current = readPreferences().selected;
                  setPreferences(checked === true
                    ? current.includes(interest.slug) ? current : [...current, interest.slug]
                    : current.filter((slug) => slug !== interest.slug));
                }} />
              <InterestIcon slug={interest.slug} />
              <span className="interest-option-copy">
                <span className="interest-option-name">{interest.name}</span>
                <span className="interest-option-examples">{interest.subtopics.map(([, name]) => name).join(", ")}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="picker-actions">
        <Button type="submit" disabled={!selected.length}>Use my interests</Button>
        <Button asChild variant="outline"><Link href="/">Explore everything</Link></Button>
        <Button variant="link" type="button" disabled={!selected.length} onClick={() => setPreferences([])}>Reset preferences</Button>
      </div>
      <p className="helper" role="status">
        {unavailable ? "Browser storage is blocked. Your choices work for this visit but won’t be remembered."
          : selected.length ? "Preferences saved in this browser. Apply them with Use my interests."
          : "Choose any topics, or explore everything. Reset preferences clears only these choices."}
      </p>
      <noscript><p className="helper">Enable JavaScript to save preferences, or explore everything.</p></noscript>
    </Form>
  );
}
