"use client";

import useSWR from "swr";

import { fetchValidatedJson } from "@/lib/api-client";
import { sessionDetailsResponseSchema } from "@/lib/api-schemas";
import type { InputLanguageMode } from "@/lib/session-types";

async function fetchSessionDetails(url: string) {
  return fetchValidatedJson(url, undefined, sessionDetailsResponseSchema);
}

export function useSessionDetails(sessionId: string) {
  const { data, isLoading } = useSWR(
    `/api/sessions/${encodeURIComponent(sessionId)}`,
    fetchSessionDetails,
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );

  const inputLanguageMode: InputLanguageMode =
    data?.inputLanguageMode === "single" ? "single" : "multi";

  return {
    allowedLanguages: data?.allowedLanguages,
    inputLanguageMode,
    sourceLanguage: data?.sourceLanguage,
    enableAudioTranslation: data?.enableAudioTranslation !== false,
    enableTranscription: data?.enableTranscription === true,
    loaded: !isLoading,
  };
}
