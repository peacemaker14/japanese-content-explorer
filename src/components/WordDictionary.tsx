"use client";

import { useEffect, useId, useRef, useState } from "react";
import { JAPANESE_DICTIONARY_ATTRIBUTION, lookupJapanese, resetJapaneseTools } from "@/lib/japanese-tools";
import type { JapaneseLookupResult, JapaneseWordQuery } from "@/lib/japanese-tools-types";
import { Button } from "@/components/ui/button";

interface WordDictionaryProps {
  query: JapaneseWordQuery;
  onClose: () => void;
  id: string;
}

type LookupState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; result: JapaneseLookupResult };

/** Inline, nonmodal, and deliberately independent of every player operation. */
export function WordDictionary({ query, onClose, id }: WordDictionaryProps) {
  const heading = useId();
  const region = useRef<HTMLElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LookupState>({ status: "loading" });
  const surface = query.text.slice(query.start, query.end);

  useEffect(() => {
    const controller = new AbortController();
    lookupJapanese(query, controller.signal).then(
      (result) => {
        if (!controller.signal.aborted) setState({ status: "ready", result });
      },
      () => {
        if (!controller.signal.aborted) setState({ status: "error" });
      },
    );
    return () => controller.abort();
  }, [query, attempt]);

  useEffect(() => {
    const section = region.current;
    const panel = section?.closest<HTMLOListElement>(".transcript-list");
    if (!section || !panel) return;
    const bounds = section.getBoundingClientRect();
    const viewport = panel.getBoundingClientRect();
    const top = Math.max(0, viewport.top + panel.clientTop);
    const bottom = Math.min(window.innerHeight, viewport.top + panel.clientTop + panel.clientHeight);
    const preview = Math.min(bounds.height, 280, Math.max(0, bottom - top));
    if (preview === 0) return;
    const target = Math.max(top, Math.min(bounds.top, bottom - preview));
    // Reveal the definition inside its reader only; never move the page or focus.
    panel.scrollTop += bounds.top - target;
  }, [state.status]);

  return (
    <section
      ref={region}
      id={id}
      className="word-dictionary"
      aria-labelledby={heading}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="dictionary-heading">
        <h3 id={heading}>Word details: <span lang="ja">{surface}</span></h3>
        <Button type="button" variant="outline" onClick={onClose}>
          Close word details
        </Button>
      </div>
      {state.status === "loading" && (
        <p className="reading-status" role="status">Loading local dictionary… The first lookup downloads dictionary data, not your text.</p>
      )}
      {state.status === "error" && (
        <div>
          <p className="reading-status" role="alert">
            The local dictionary could not load. Check your connection to download its data, then try again. Your text stays on this device.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              resetJapaneseTools();
              setState({ status: "loading" });
              setAttempt((value) => value + 1);
            }}
          >
            Retry dictionary
          </Button>
        </div>
      )}
      {state.status === "ready" && (
        <div aria-live="polite">
          {state.result.reading && <p>Kana: <span lang="ja">{state.result.reading}</span></p>}
          {state.result.romaji && <p>Romaji: <span lang="ja-Latn">{state.result.romaji}</span></p>}
          <p>Dictionary form: <span lang="ja">{state.result.lookup}</span></p>
          {state.result.entries.length ? (
            <ol className="dictionary-entries">
              {state.result.entries.map((entry, index) => (
                <li key={index}>
                  <p><strong lang="ja">{entry.headword}</strong>{" — "}<span lang="ja">{entry.reading}</span></p>
                  <ul>{entry.meanings.map((meaning, meaningIndex) => <li key={meaningIndex}>{meaning}</li>)}</ul>
                </li>
              ))}
            </ol>
          ) : (
            <p>No English dictionary entry was found for this exact word or its supported dictionary form. Names, unusual forms and unknown readings may not be covered.</p>
          )}
        </div>
      )}
      <p className="dictionary-attribution">
        Definitions: {" "}
        <a href={JAPANESE_DICTIONARY_ATTRIBUTION.attributionUrl} target="_blank" rel="noreferrer">{JAPANESE_DICTIONARY_ATTRIBUTION.name}</a>
        {"; "}<a href={JAPANESE_DICTIONARY_ATTRIBUTION.licenseUrl} target="_blank" rel="noreferrer">{JAPANESE_DICTIONARY_ATTRIBUTION.license}</a>
        {", version "}{JAPANESE_DICTIONARY_ATTRIBUTION.version}.
        {" "}Readings are automatic, not a verified transcript correction.
      </p>
    </section>
  );
}
