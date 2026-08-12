"use client";

import { useEffect, useState } from "react";

import { readJsonResponse } from "@/lib/api-request";
import type { InputLanguageMode } from "@/lib/session-types";

type SessionDetailsResponse = {
  allowedLanguages?: unknown;
  enableAudioTranslation?: unknown;
  enableTranscription?: unknown;
  inputLanguageMode?: unknown;
  sourceLanguage?: unknown;
};

export function useSessionDetails(sessionId: string) {
  const [allowedLanguages, setAllowedLanguages] = useState<
    string[] | undefined
  >(undefined);
  const [inputLanguageMode, setInputLanguageMode] =
    useState<InputLanguageMode>("multi");
  const [sourceLanguage, setSourceLanguage] = useState<string | undefined>(
    undefined
  );
  const [enableAudioTranslation, setEnableAudioTranslation] = useState(true);
  const [enableTranscription, setEnableTranscription] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function fetchSessionDetails() {
      try {
        const res = await fetch(`/api/sessions/${sessionId}`);
        if (res.ok) {
          const data = await readJsonResponse<SessionDetailsResponse>(res);
          setAllowedLanguages(
            Array.isArray(data.allowedLanguages) &&
              data.allowedLanguages.every((language) => typeof language === "string")
              ? data.allowedLanguages
              : undefined
          );
          setInputLanguageMode(
            data.inputLanguageMode === "single" ? "single" : "multi"
          );
          setSourceLanguage(
            typeof data.sourceLanguage === "string"
              ? data.sourceLanguage
              : undefined
          );
          setEnableAudioTranslation(data.enableAudioTranslation !== false);
          setEnableTranscription(data.enableTranscription === true);
        }
      } catch (err) {
        console.error("Failed to fetch session details:", err);
      } finally {
        setLoaded(true);
      }
    }

    void fetchSessionDetails();
  }, [sessionId]);

  return {
    allowedLanguages,
    inputLanguageMode,
    sourceLanguage,
    enableAudioTranslation,
    enableTranscription,
    loaded,
  };
}
