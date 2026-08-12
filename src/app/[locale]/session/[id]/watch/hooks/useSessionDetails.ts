"use client";

import useSWR from "swr";

import { fetchValidatedJson } from "@/lib/api-client";
import { sessionDetailsResponseSchema } from "@/lib/api-schemas";

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

    return {
        allowedLanguages: data?.allowedLanguages,
        enableAudioTranslation: data?.enableAudioTranslation !== false,
        enableTranscription: data?.enableTranscription === true,
        loaded: !isLoading,
    };
}
