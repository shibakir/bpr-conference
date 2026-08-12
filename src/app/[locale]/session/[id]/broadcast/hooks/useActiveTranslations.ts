"use client";

import useSWR from "swr";

import { fetchValidatedJson } from "@/lib/api-client";
import { activeTranslationsResponseSchema } from "@/lib/api-schemas";

import type { TranslationInfo } from "../types";

async function fetchActiveTranslations(url: string) {
    return fetchValidatedJson(url, undefined, activeTranslationsResponseSchema);
}

export function useActiveTranslations(sessionId: string) {
    const { data } = useSWR(
        `/api/translate/status?sessionId=${encodeURIComponent(sessionId)}`,
        fetchActiveTranslations,
        { refreshInterval: 3000 },
    );

    return (data?.translations ?? []) satisfies TranslationInfo[];
}
