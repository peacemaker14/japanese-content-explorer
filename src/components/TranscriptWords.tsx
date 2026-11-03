"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { analyzeJapanese, fallbackJapaneseTokens, resetJapaneseTools } from "@/lib/japanese-tools";
import type { JapaneseToken, JapaneseWordQuery } from "@/lib/japanese-tools-types";
import type { PublicTranscript } from "@/lib/transcript-types";
import type { PersonalTranscript } from "@/lib/personal-transcript";
import { formatTranscriptTime } from "@/lib/transcript-cues";
import { useReadingPreferences } from "@/lib/use-reading-preferences";
import { WordDictionary } from "./WordDictionary";
import { Button } from "@/components/ui/button";

type ReaderTranscript = PublicTranscript | PersonalTranscript;
interface TranscriptWordsProps {
  transcript: ReaderTranscript;
  activeIndex: number | null;
  canSeek: boolean;
  autoFollow: boolean;
  id: string;
  onSeek: (seconds: number) => void;
  onInteract: () => void;
}
interface WordSelection {
  source: ReaderTranscript;
  cue: number;
  token: JapaneseToken;
  query: JapaneseWordQuery;
  serial: number;
}
type Analysis =
  | { source: ReaderTranscript; attempt: number; status: "ready"; tokens: JapaneseToken[][] }
  | { source: ReaderTranscript; attempt: number; status: "error" };
const kanji = /\p{Script=Han}/u;

// A fallback word can cross tokenizer boundaries. Keep that exact clicked span
// while details are open; never attach a neighboring word's reading to a slice.
function selectedCueTokens(tokens: JapaneseToken[], selection: WordSelection): JapaneseToken[] {
  const { start, end } = selection.token;
  if (tokens.some((token) => token.start === start && token.end === end)) return tokens;
  const result: JapaneseToken[] = [];
  let inserted = false;
  for (const token of tokens) {
    if (token.end <= start || token.start >= end) {
      if (!inserted && token.start >= end) {
        result.push(selection.token);
        inserted = true;
      }
      result.push(token);
      continue;
    }
    if (token.start < start) result.push({
      ...token, surface: selection.query.text.slice(token.start, start), end: start,
      reading: null, romaji: null, lemma: null,
    });
    if (!inserted) {
      result.push(selection.token);
      inserted = true;
    }
    if (token.end > end) result.push({
      ...token, surface: selection.query.text.slice(end, token.end), start: end,
      reading: null, romaji: null, lemma: null,
    });
  }
  return result;
}

export function TranscriptWords({ transcript, activeIndex, canSeek, autoFollow, id, onSeek, onInteract }: TranscriptWordsProps) {
  const preferences = useReadingPreferences();
  const [activated, setActivated] = useState<ReaderTranscript | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [selection, setSelection] = useState<WordSelection | null>(null);
  const [roving, setRoving] = useState<{ source: ReaderTranscript; cue: number; start: number } | null>(null);
  const [timeFocus, setTimeFocus] = useState<{ source: ReaderTranscript; cue: number } | null>(null);
  const selectionSerial = useRef(0);
  const readyAnalysis = useRef<{ source: ReaderTranscript; attempt: number } | null>(null);
  const list = useRef<HTMLOListElement>(null);
  const lines = useRef(new Map<number, HTMLDivElement>());
  const words = useRef(new Map<string, HTMLButtonElement>());
  const expectedScrollTop = useRef<number | null>(null);
  const restoreWordFocus = useRef<HTMLButtonElement | null>(null);
  const activeSelection = selection?.source === transcript ? selection : null;
  const shouldAnalyze = preferences.furigana || preferences.romaji || activated === transcript;
  const fallback = useMemo(() => transcript.segments.map((segment) => fallbackJapaneseTokens(segment.text)), [transcript]);
  const currentAnalysis = analysis?.source === transcript ? analysis : null;
  const tokens = currentAnalysis?.status === "ready" ? currentAnalysis.tokens : fallback;
  const cues = useMemo(() => tokens.map((cue, index) =>
    activeSelection?.cue === index ? selectedCueTokens(cue, activeSelection) : cue,
  ), [tokens, activeSelection]);
  const lexical = useMemo(() => cues.flatMap((cue, index) => cue.filter((token) => token.lexical).map((token) => ({
    cue: index, token, key: `${index}:${token.start}:${token.end}`,
  }))), [cues]);
  const tabWord = useMemo(() => (roving?.source === transcript
    ? lexical.find((word) => word.cue === roving.cue && word.token.start <= roving.start && word.token.end > roving.start)
    : null) ?? lexical[0], [roving, transcript, lexical]);

  useEffect(() => {
    if (!shouldAnalyze || (readyAnalysis.current?.source === transcript && readyAnalysis.current.attempt === attempt)) return;
    const controller = new AbortController();
    // Promise callbacks, including failures, are always tied to this identity.
    analyzeJapanese(transcript.segments.map((segment) => segment.text), controller.signal).then(
      (result) => {
        if (!controller.signal.aborted) {
          readyAnalysis.current = { source: transcript, attempt };
          setAnalysis({ source: transcript, attempt, status: "ready", tokens: result });
        }
      },
      () => {
        if (!controller.signal.aborted) setAnalysis({ source: transcript, attempt, status: "error" });
      },
    );
    return () => controller.abort();
    // Successful tokens stay local to this mounted transcript; clock ticks and
    // independent toggle changes never recompute them.
  }, [transcript, shouldAnalyze, attempt]);

  useLayoutEffect(() => {
    const previous = restoreWordFocus.current;
    restoreWordFocus.current = null;
    if (previous && !previous.isConnected && document.activeElement === document.body && tabWord)
      words.current.get(tabWord.key)?.focus({ preventScroll: true });
  });

  useEffect(() => {
    if (!autoFollow || activeIndex === null) return;
    const panel = list.current;
    const line = lines.current.get(activeIndex);
    if (!panel || !line || panel.contains(document.activeElement)) return;
    const viewport = panel.getBoundingClientRect();
    const bounds = line.getBoundingClientRect();
    const top = viewport.top + panel.clientTop;
    const bottom = top + panel.clientHeight;
    let delta = 0;
    if (bounds.top < top) delta = bounds.top - top - 12;
    else if (bounds.bottom > bottom) delta = bounds.bottom - bottom + 12;
    if (delta === 0) return;
    // Scroll only the reader, without smooth motion or moving keyboard focus.
    panel.scrollTop += delta;
    expectedScrollTop.current = panel.scrollTop;
  }, [activeIndex, autoFollow, transcript]);

  function pauseFollow() {
    expectedScrollTop.current = null;
    onInteract();
  }

  function closeDictionary() {
    if (!activeSelection) return;
    const target = lexical.find((word) => word.cue === activeSelection.cue && word.token.start === activeSelection.token.start);
    if (target) words.current.get(target.key)?.focus({ preventScroll: true });
    setSelection(null);
  }

  function wordKey(event: KeyboardEvent<HTMLButtonElement>, key: string) {
    if (event.key === "Escape" && activeSelection) {
      event.preventDefault();
      closeDictionary();
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    pauseFollow();
    const index = lexical.findIndex((word) => word.key === key);
    const current = lexical[index];
    if (!current) return;
    let target = index;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") target = Math.max(0, index - 1);
    if (event.key === "ArrowRight" || event.key === "ArrowDown") target = Math.min(lexical.length - 1, index + 1);
    if (event.key === "Home") target = lexical.findIndex((word) => word.cue === current.cue);
    if (event.key === "End") {
      while (target + 1 < lexical.length && lexical[target + 1].cue === current.cue) target++;
    }
    words.current.get(lexical[target].key)?.focus();
  }

  const readingsFailed = currentAnalysis?.status === "error";
  const readingsLoading = shouldAnalyze && (!currentAnalysis || currentAnalysis.attempt !== attempt);

  return (
    <>
      <div className="reading-controls" role="group" aria-label="Local reading aids">
        <Button type="button" variant="outline" size="sm" aria-pressed={preferences.furigana}
          onClick={() => { pauseFollow(); preferences.set("furigana", !preferences.furigana); }}>
          Furigana: {preferences.furigana ? "On" : "Off"}
        </Button>
        <Button type="button" variant="outline" size="sm" aria-pressed={preferences.romaji}
          onClick={() => { pauseFollow(); preferences.set("romaji", !preferences.romaji); }}>
          Romaji: {preferences.romaji ? "On" : "Off"}
        </Button>
      </div>
      <p className="reading-status">Select a word for its meaning. Arrow keys move between words; Home / End move within a sentence. Readings are automatic and processed on-device.</p>
      {preferences.storageWarning && <p className="reading-status" role="status">Browser storage is unavailable. Reading controls still work on this page, but your choices may not be saved.</p>}
      {readingsLoading && <p className="reading-status" role="status">Loading local reading tools… The first use downloads language data, not your text.</p>}
      {readingsFailed && shouldAnalyze && (
        <div className="reading-status">
          <p role="alert">Local readings could not load. The original transcript and word buttons are still available.</p>
          <Button type="button" variant="outline" onClick={() => {
            resetJapaneseTools();
            setAnalysis(null);
            setAttempt((value) => value + 1);
          }}>Retry readings</Button>
        </div>
      )}
      <ol
        ref={list} id={`${id}-sentences`} className="transcript-list" tabIndex={0}
        aria-label="Transcript sentences" aria-describedby={`${id}-help`}
        onWheel={pauseFollow} onTouchStart={pauseFollow} onFocusCapture={pauseFollow}
        onPointerDown={(event) => { if (event.target === event.currentTarget) pauseFollow(); }}
        onKeyDown={(event) => {
          if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) pauseFollow();
          if (event.key === "Escape" && activeSelection) { event.preventDefault(); closeDictionary(); }
        }}
        onScroll={() => {
          const panel = list.current;
          if (!panel) return;
          if (expectedScrollTop.current !== null && Math.abs(panel.scrollTop - expectedScrollTop.current) < 2) {
            expectedScrollTop.current = null;
            return;
          }
          pauseFollow();
        }}
      >
        {transcript.segments.map((segment, index) => {
          const active = activeIndex === index;
          const time = formatTranscriptTime(segment.start);
          return (
            <li key={index}>
              <div
                ref={(node) => { if (node) lines.current.set(index, node); else lines.current.delete(index); }}
                className={`transcript-line${active ? " is-active" : ""}`}
                aria-current={active ? "true" : undefined}
              >
                <button type="button" className="transcript-cue-time" disabled={!canSeek}
                  tabIndex={index === (timeFocus?.source === transcript ? timeFocus.cue : 0) ? 0 : -1}
                  onFocus={() => setTimeFocus({ source: transcript, cue: index })}
                  onKeyDown={(event) => {
                    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
                    event.preventDefault();
                    pauseFollow();
                    let target = index;
                    if (event.key === "ArrowLeft" || event.key === "ArrowUp") target = Math.max(0, index - 1);
                    if (event.key === "ArrowRight" || event.key === "ArrowDown") target = Math.min(transcript.segments.length - 1, index + 1);
                    if (event.key === "Home") target = 0;
                    if (event.key === "End") target = transcript.segments.length - 1;
                    lines.current.get(target)?.querySelector<HTMLButtonElement>(".transcript-cue-time")?.focus();
                  }}
                  aria-label={`Seek to ${time}`} onClick={() => { pauseFollow(); onSeek(segment.start); }}>
                  {time}
                </button>
                <span className="transcript-words" lang={transcript.visibility === "public" ? "ja" : undefined}>
                  {cues[index].map((token) => {
                    const key = `${index}:${token.start}:${token.end}`;
                    const selected = activeSelection?.cue === index && activeSelection.token.start === token.start && activeSelection.token.end === token.end;
                    const reading = preferences.furigana && kanji.test(token.surface) ? token.reading : null;
                    const romaji = preferences.romaji ? token.romaji : null;
                    if (!token.lexical) return <span key={key}>{token.surface}</span>;
                    return (
                      <button
                        key={key} type="button" className={`transcript-word${selected ? " word-selected" : ""}`}
                        ref={(node) => {
                          if (node) words.current.set(key, node);
                          else {
                            const previous = words.current.get(key);
                            if (document.activeElement === previous) restoreWordFocus.current = previous ?? null;
                            words.current.delete(key);
                          }
                        }}
                        tabIndex={tabWord?.key === key ? 0 : -1}
                        aria-label={`Dictionary: ${[token.surface, reading, romaji].filter(Boolean).join(" ")}`}
                        aria-expanded={selected} aria-controls={selected ? `${id}-dictionary` : undefined}
                        onFocus={() => setRoving({ source: transcript, cue: index, start: token.start })}
                        onKeyDown={(event) => wordKey(event, key)}
                        onClick={() => {
                          pauseFollow();
                          setActivated(transcript);
                          setSelection({ source: transcript, cue: index, token, serial: ++selectionSerial.current, query: { text: segment.text, start: token.start, end: token.end } });
                        }}
                      >
                        <span className="transcript-word-text">{reading ? <ruby>{token.surface}<rt>{reading}</rt></ruby> : token.surface}</span>
                        {romaji && <span className="word-romaji" lang="ja-Latn">{romaji}</span>}
                      </button>
                    );
                  })}
                </span>
              </div>
              {activeSelection?.cue === index && (
                <WordDictionary
                  key={activeSelection.serial}
                  id={`${id}-dictionary`} query={activeSelection.query} onClose={closeDictionary}
                />
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}
