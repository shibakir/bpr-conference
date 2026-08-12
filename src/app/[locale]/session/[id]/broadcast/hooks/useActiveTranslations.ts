"use client";

import { useCallback, useEffect, useState } from "react";

import { readJsonResponse } from "@/lib/api-request";

import type { TranslationInfo } from "../types";

type ActiveTranslationsResponse = {
  translations?: unknown;
};

function isTranslationInfo(value: unknown): value is TranslationInfo {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Partial<TranslationInfo>;
  return (
    typeof item.language === "string" &&
    typeof item.translatorIdentity === "string" &&
    typeof item.status === "string" &&
    typeof item.subscriberCount === "number"
  );
}

export function useActiveTranslations(sessionId: string) {
  const [translations, setTranslations] = useState<TranslationInfo[]>([]);

  const fetchTranslations = useCallback(async () => {
    try {
      const res = await fetch(`/api/translate/status?sessionId=${sessionId}`);
      const data = await readJsonResponse<ActiveTranslationsResponse>(res);
      setTranslations(
        Array.isArray(data.translations)
          ? data.translations.filter(isTranslationInfo)
          : []
      );
    } catch (err) {
      console.error("Failed to fetch translations:", err);
    }
  }, [sessionId]);

  useEffect(() => {
    const initialFetch = window.setTimeout(() => {
      void fetchTranslations();
    }, 0);
    const interval = setInterval(() => {
      void fetchTranslations();
    }, 3000);
    return () => {
      clearTimeout(initialFetch);
      clearInterval(interval);
    };
  }, [fetchTranslations]);

  return translations;
}
