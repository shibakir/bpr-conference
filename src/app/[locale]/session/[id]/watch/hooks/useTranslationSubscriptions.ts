"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  API_ERROR_CODES,
  type ApiErrorCode,
  getApiErrorCode,
} from "@/lib/api-errors";
import { readJsonResponse } from "@/lib/api-request";

export type TranslationSubscriptionStatus = "active" | "error";

type TranslationSubscriptionState = {
  error: string | null;
  status: TranslationSubscriptionStatus;
  translatorIdentity: string | null;
};

type TranslationSubscriptionsByLanguage = Record<
  string,
  TranslationSubscriptionState | undefined
>;

type TranslationStartResponse = {
  translatorIdentity?: unknown;
};

function getTranslationRequestErrorMessage(
  code: ApiErrorCode | undefined,
  t: ReturnType<typeof useTranslations<"LanguageSelector">>
) {
  switch (code) {
    case API_ERROR_CODES.SESSION_INACTIVE:
    case API_ERROR_CODES.SESSION_NOT_FOUND:
      return t("sessionUnavailable");
    case API_ERROR_CODES.UNSUPPORTED_TARGET_LANGUAGE:
      return t("unsupportedTargetLanguage");
    case API_ERROR_CODES.TARGET_LANGUAGE_MATCHES_SOURCE:
      return t("targetLanguageIsSource");
    case API_ERROR_CODES.LANGUAGE_NOT_ALLOWED:
      return t("languageNotAllowed");
    case API_ERROR_CODES.TRANSLATION_OUTPUTS_DISABLED:
      return t("translationsDisabled");
    case API_ERROR_CODES.INVALID_REQUEST:
      return t("invalidRequest");
    default:
      return t("translationError");
  }
}

function createUnsubscribePayload(sessionId: string, targetLanguage: string) {
  return JSON.stringify({
    sessionId,
    targetLanguage,
  });
}

export function useTranslationSubscriptions({
  enabled,
  languages,
  sessionId,
}: {
  enabled: boolean;
  languages: string[];
  sessionId: string;
}) {
  const t = useTranslations("LanguageSelector");
  const [subscriptions, setSubscriptions] =
    useState<TranslationSubscriptionsByLanguage>({});
  const activeSubscriptionsRef = useRef(new Set<string>());
  const pendingSubscriptionsRef = useRef(new Set<string>());
  const desiredLanguagesRef = useRef<string[]>([]);
  const leaveCleanupDoneRef = useRef(false);
  const normalizedLanguages = useMemo(
    () =>
      Array.from(new Set(languages.filter((language) => language !== "original")))
        .sort(),
    [languages]
  );
  const languageKey = normalizedLanguages.join("|");

  const unsubscribeLanguage = useCallback(
    (language: string, transport: "fetch" | "beacon" = "fetch") => {
      if (!activeSubscriptionsRef.current.delete(language)) return;

      setSubscriptions((prev) => {
        const next = { ...prev };
        delete next[language];
        return next;
      });

      const payload = createUnsubscribePayload(sessionId, language);
      if (
        transport === "beacon" &&
        typeof navigator !== "undefined" &&
        typeof navigator.sendBeacon === "function"
      ) {
        navigator.sendBeacon(
          "/api/translate/unsubscribe",
          new Blob([payload], { type: "application/json" })
        );
        return;
      }

      fetch("/api/translate", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: payload,
      }).catch(() => {});
    },
    [sessionId]
  );

  const unsubscribeAll = useCallback(
    (transport: "fetch" | "beacon" = "fetch") => {
      for (const language of Array.from(activeSubscriptionsRef.current)) {
        unsubscribeLanguage(language, transport);
      }
    },
    [unsubscribeLanguage]
  );

  useEffect(() => {
    leaveCleanupDoneRef.current = false;
  }, [sessionId]);

  useEffect(() => {
    const desiredLanguages = enabled ? normalizedLanguages : [];
    const desiredSet = new Set(desiredLanguages);
    desiredLanguagesRef.current = desiredLanguages;

    for (const language of Array.from(activeSubscriptionsRef.current)) {
      if (!desiredSet.has(language)) {
        unsubscribeLanguage(language);
      }
    }

    if (!enabled) return;

    for (const language of desiredSet) {
      if (
        activeSubscriptionsRef.current.has(language) ||
        pendingSubscriptionsRef.current.has(language)
      ) {
        continue;
      }

      pendingSubscriptionsRef.current.add(language);

      fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          targetLanguage: language,
        }),
      })
        .then(async (res) => {
          const data = await readJsonResponse<TranslationStartResponse>(res);
          if (!res.ok) {
            throw new Error(
              getTranslationRequestErrorMessage(getApiErrorCode(data), t)
            );
          }
          return data;
        })
        .then((data) => {
          pendingSubscriptionsRef.current.delete(language);
          activeSubscriptionsRef.current.add(language);

          if (!desiredLanguagesRef.current.includes(language)) {
            unsubscribeLanguage(language);
            return;
          }

          setSubscriptions((prev) => ({
            ...prev,
            [language]: {
              error: null,
              status: "active",
              translatorIdentity:
                typeof data.translatorIdentity === "string"
                  ? data.translatorIdentity
                  : null,
            },
          }));
        })
        .catch((error) => {
          pendingSubscriptionsRef.current.delete(language);
          activeSubscriptionsRef.current.delete(language);
          if (!desiredLanguagesRef.current.includes(language)) return;

          setSubscriptions((prev) => ({
            ...prev,
            [language]: {
              error: error instanceof Error ? error.message : t("translationError"),
              status: "error",
              translatorIdentity: null,
            },
          }));
        });
    }
  }, [
    enabled,
    languageKey,
    normalizedLanguages,
    sessionId,
    t,
    unsubscribeLanguage,
  ]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (leaveCleanupDoneRef.current) return;
      leaveCleanupDoneRef.current = true;
      unsubscribeAll("beacon");
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      handleBeforeUnload();
    };
  }, [unsubscribeAll]);

  return {
    subscriptions,
  };
}
