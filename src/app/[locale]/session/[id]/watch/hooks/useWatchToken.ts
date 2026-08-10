"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  API_ERROR_CODES,
  getApiErrorCode,
  type ApiErrorCode,
} from "@/lib/api-errors";
import type { WatchError } from "../types";

function getJoinErrorMessage(
  code: ApiErrorCode | undefined,
  t: ReturnType<typeof useTranslations<"Watch">>
): WatchError {
  switch (code) {
    case API_ERROR_CODES.SESSION_INACTIVE:
    case API_ERROR_CODES.SESSION_NOT_FOUND:
      return { kind: "inactive", message: t("sessionInactive") };
    case API_ERROR_CODES.LIVEKIT_NOT_CONFIGURED:
      return { kind: "generic", message: t("livekitNotConfigured") };
    case API_ERROR_CODES.INVALID_REQUEST:
      return { kind: "generic", message: t("invalidRequest") };
    default:
      return { kind: "generic", message: t("joinError") };
  }
}

export function useWatchToken(sessionId: string) {
  const t = useTranslations("Watch");
  const [token, setToken] = useState("");
  const [livekitUrl, setLivekitUrl] = useState("");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<WatchError | null>(null);

  const markExpired = useCallback(() => {
    setError({ kind: "ended", message: t("sessionEnded") });
  }, [t]);

  useEffect(() => {
    async function fetchToken() {
      try {
        const identity = `attendee-${Math.random().toString(36).slice(2, 8)}`;
        const res = await fetch(
          `/api/token?room=${sessionId}&identity=${identity}&role=attendee`
        );
        const data = await res.json();
        if (!res.ok || data.error) {
          setError(getJoinErrorMessage(getApiErrorCode(data), t));
          return;
        }
        setToken(data.token);
        setLivekitUrl(data.serverUrl);
        setExpiresAt(
          typeof data.expiresAt === "string" ? data.expiresAt : null
        );
      } catch (err) {
        console.error("Failed to fetch attendee token:", err);
        setError({ kind: "generic", message: t("joinError") });
      }
    }

    fetchToken();
  }, [sessionId, t]);

  return {
    token,
    livekitUrl,
    expiresAt,
    error,
    markExpired,
  };
}
