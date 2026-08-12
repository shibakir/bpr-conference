"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import useSWRMutation from "swr/mutation";

import { ApiRequestError, fetchValidatedJson } from "@/lib/api-client";
import { API_ERROR_CODES, type ApiErrorCode } from "@/lib/api-errors";
import { tokenResponseSchema } from "@/lib/api-schemas";

import type { FetchTokenResult } from "../types";

function getTokenErrorMessage(
  code: ApiErrorCode | undefined,
  t: ReturnType<typeof useTranslations<"Broadcast">>
) {
  switch (code) {
    case API_ERROR_CODES.SESSION_INACTIVE:
      return t("sessionInactive");
    case API_ERROR_CODES.LIVEKIT_NOT_CONFIGURED:
      return t("livekitNotConfigured");
    case API_ERROR_CODES.INVALID_REQUEST:
      return t("invalidRequest");
    default:
      return t("fetchTokenError");
  }
}

function appendPassword(url: string, password: string) {
  return password ? `${url}&password=${encodeURIComponent(password)}` : url;
}

export function useBroadcastToken(sessionId: string) {
  const t = useTranslations("Broadcast");
  const [token, setToken] = useState("");
  const [livekitUrl, setLivekitUrl] = useState("");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [passwordPromptRequired, setPasswordPromptRequired] = useState(false);
  const [localPassword, setLocalPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const tokenUrl = `/api/token?room=${encodeURIComponent(sessionId)}&identity=organizer-host&role=organizer`;
  const { isMutating, trigger } = useSWRMutation(
    tokenUrl,
    (url: string, { arg: password }: { arg: string }) =>
      fetchValidatedJson(
        appendPassword(url, password),
        undefined,
        tokenResponseSchema,
      ),
  );

  const markExpired = useCallback(() => {
    setError(t("sessionEnded"));
  }, [t]);

  const fetchToken = useCallback(
    async (pass: string): Promise<FetchTokenResult> => {
      try {
        const data = await trigger(pass);

        if (pass) {
          sessionStorage.setItem("broadcast_password", pass);
        }
        setToken(data.token);
        setLivekitUrl(data.serverUrl);
        setExpiresAt(
          typeof data.expiresAt === "string" ? data.expiresAt : null
        );
        setPasswordPromptRequired(false);
        return { ok: true };
      } catch (error) {
        if (error instanceof ApiRequestError && error.status === 401) {
          setPasswordPromptRequired(true);
          setError(null);
          return { ok: false, reason: "password" };
        }

        setError(
          error instanceof ApiRequestError
            ? getTokenErrorMessage(error.code, t)
            : t("fetchTokenError"),
        );
        return { ok: false, reason: "error" };
      }
    },
    [t, trigger],
  );

  useEffect(() => {
    const cachedPass = sessionStorage.getItem("broadcast_password") || "";
    const initialFetch = window.setTimeout(() => {
      void fetchToken(cachedPass);
    }, 0);
    return () => clearTimeout(initialFetch);
  }, [fetchToken]);

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    const result = await fetchToken(localPassword);
    if (!result.ok && result.reason === "password") {
      setPasswordError(t("incorrectPassword"));
    }
  };

  return {
    error,
    expiresAt,
    handlePasswordSubmit,
    livekitUrl,
    localPassword,
    markExpired,
    passwordError,
    passwordPromptRequired,
    setError,
    setLocalPassword,
    token,
    verifying: isMutating,
  };
}
