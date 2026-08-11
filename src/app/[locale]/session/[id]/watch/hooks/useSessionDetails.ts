"use client";

import { useEffect, useState } from "react";
import type { InputLanguageMode } from "@/lib/session-types";

export function useSessionDetails(sessionId: string) {
  const [allowedLanguages, setAllowedLanguages] = useState<
    string[] | undefined
  >(undefined);
  const [inputLanguageMode, setInputLanguageMode] =
    useState<InputLanguageMode>("multi");
  const [sourceLanguage, setSourceLanguage] = useState<string | undefined>(
    undefined
  );
  const [enableTranscription, setEnableTranscription] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function fetchSessionDetails() {
      try {
        const res = await fetch(`/api/sessions/${sessionId}`);
        if (res.ok) {
          const data = await res.json();
          setAllowedLanguages(data.allowedLanguages);
          setInputLanguageMode(
            data.inputLanguageMode === "single" ? "single" : "multi"
          );
          setSourceLanguage(
            typeof data.sourceLanguage === "string"
              ? data.sourceLanguage
              : undefined
          );
          setEnableTranscription(data.enableTranscription === true);
        }
      } catch (err) {
        console.error("Failed to fetch session details:", err);
      } finally {
        setLoaded(true);
      }
    }

    fetchSessionDetails();
  }, [sessionId]);

  return {
    allowedLanguages,
    inputLanguageMode,
    sourceLanguage,
    enableTranscription,
    loaded,
  };
}
