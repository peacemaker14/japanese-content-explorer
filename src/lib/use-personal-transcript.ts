"use client";

import { useEffect, useRef, useState } from "react";
import {
  readPersonalTranscriptFile,
  type PersonalTranscript,
} from "./personal-transcript";
import {
  loadPersonalTranscript,
  removePersonalTranscript,
  savePersonalTranscript,
} from "./personal-transcript-store";

export interface PersonalTranscriptNotice {
  message: string;
  error: boolean;
}

export function usePersonalTranscript(videoId: string) {
  const [personal, setPersonal] = useState<PersonalTranscript | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [busy, setBusy] = useState(false);
  const [canClearSaved, setCanClearSaved] = useState(false);
  const [notice, setNotice] = useState<PersonalTranscriptNotice | null>(null);
  const generation = useRef(0);
  const operationActive = useRef(false);
  const saved = useRef(false);

  useEffect(() => {
    const counter = generation;
    const current = ++counter.current;
    loadPersonalTranscript(videoId)
      .then((transcript) => {
        if (counter.current !== current) return;
        setPersonal(transcript);
        saved.current = transcript !== null;
        setCanClearSaved(transcript !== null);
        if (transcript)
          setNotice({
            message: "Personal transcript restored from this browser. Nothing was uploaded.",
            error: false,
          });
      })
      .catch((error: unknown) => {
        if (counter.current !== current) return;
        setCanClearSaved(true);
        setNotice({
          message: error instanceof Error ? error.message : "Browser storage could not be read.",
          error: true,
        });
      })
      .finally(() => {
        if (counter.current === current) setRestoring(false);
      });
    return () => { counter.current++; };
  }, [videoId]);

  async function importFile(file: File): Promise<boolean> {
    if (restoring || operationActive.current) return false;
    operationActive.current = true;
    const current = generation.current;
    setBusy(true);
    setNotice({ message: "Reading your file locally…", error: false });
    try {
      const transcript = await readPersonalTranscriptFile(file, videoId);
      if (generation.current !== current) return false;
      setPersonal(transcript);
      saved.current = false;
      try {
        await savePersonalTranscript(transcript);
        if (generation.current !== current) return false;
        saved.current = true;
        setCanClearSaved(true);
        setNotice({
          message: "Personal transcript saved only in this browser. Nothing was uploaded.",
          error: false,
        });
      } catch (error) {
        if (generation.current !== current) return false;
        setNotice({
          message: `${error instanceof Error ? error.message : "Browser storage could not be written."} You can read this file on this page, but this import will not survive a reload.`,
          error: true,
        });
      }
      return true;
    } catch (error) {
      if (generation.current === current)
        setNotice({
          message: error instanceof Error ? error.message : "The transcript could not be imported.",
          error: true,
        });
      return false;
    } finally {
      if (generation.current === current) {
        operationActive.current = false;
        setBusy(false);
      }
    }
  }

  async function remove(): Promise<void> {
    if (restoring || operationActive.current) return;
    if (!window.confirm(
      "Remove the personal transcript for this video from this browser? This cannot be undone.",
    )) return;
    operationActive.current = true;
    const current = generation.current;
    setBusy(true);
    try {
      await removePersonalTranscript(videoId);
      if (generation.current !== current) return;
      saved.current = false;
      setPersonal(null);
      setCanClearSaved(false);
      setNotice({ message: "Personal transcript removed from this browser.", error: false });
    } catch (error) {
      if (generation.current !== current) return;
      if (!saved.current) setPersonal(null);
      setNotice({
        message: `${error instanceof Error ? error.message : "Browser storage could not be changed."} A previously saved copy could not be removed. ${saved.current ? "Your saved transcript is still shown." : "The unsaved copy has been cleared from this page."}`,
        error: true,
      });
    } finally {
      if (generation.current === current) {
        operationActive.current = false;
        setBusy(false);
      }
    }
  }

  return { personal, restoring, busy, notice, canClearSaved, importFile, remove };
}
