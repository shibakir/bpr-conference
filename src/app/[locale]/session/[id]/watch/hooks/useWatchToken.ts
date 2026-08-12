"use client";

import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import useSWR from "swr";
import type { z } from "zod";

import { ApiRequestError, fetchValidatedJson } from "@/lib/api-client";
import {
  API_ERROR_CODES,
  type ApiErrorCode,
} from "@/lib/api-errors";
import { tokenResponseSchema } from "@/lib/api-schemas";

import type { WatchError } from "../types";

type TokenResponse = z.infer<typeof tokenResponseSchema>;

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

async function fetchToken(url: string) {
  return fetchValidatedJson(url, undefined, tokenResponseSchema);
}

export function useWatchToken(sessionId: string) {
  const t = useTranslations("Watch");
  const [identity] = useState(
    () => `attendee-${Math.random().toString(36).slice(2, 8)}`,
  );
  const [expiredError, setExpiredError] = useState<WatchError | null>(null);
  const { data, error } = useSWR<TokenResponse, ApiRequestError>(
    `/api/token?room=${encodeURIComponent(sessionId)}&identity=${encodeURIComponent(identity)}&role=attendee`,
    fetchToken,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
    },
  );

  const markExpired = useCallback(() => {
    setExpiredError({ kind: "ended", message: t("sessionEnded") });
  }, [t]);

  const requestError =
    error instanceof ApiRequestError
      ? getJoinErrorMessage(error.code, t)
      : error
        ? { kind: "generic" as const, message: t("joinError") }
        : null;

  return {
    token: data?.token ?? "",
    livekitUrl: data?.serverUrl ?? "",
    expiresAt: data?.expiresAt ?? null,
    error: expiredError ?? requestError,
    markExpired,
  };
}
