"use client";

import { useCallback, useEffect, useState } from "react";
import type { TranslationInfo } from "../types";

export function useActiveTranslations(sessionId: string) {
  const [translations, setTranslations] = useState<TranslationInfo[]>([]);

  const fetchTranslations = useCallback(async () => {
    try {
      const res = await fetch(`/api/translate/status?sessionId=${sessionId}`);
      const data = await res.json();
      setTranslations(data.translations || []);
    } catch (err) {
      console.error("Failed to fetch translations:", err);
    }
  }, [sessionId]);

  useEffect(() => {
    const initialFetch = window.setTimeout(fetchTranslations, 0);
    const interval = setInterval(fetchTranslations, 3000);
    return () => {
      clearTimeout(initialFetch);
      clearInterval(interval);
    };
  }, [fetchTranslations]);

  return translations;
}
