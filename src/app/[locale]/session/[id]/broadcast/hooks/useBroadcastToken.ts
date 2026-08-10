"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  API_ERROR_CODES,
  getApiErrorCode,
  type ApiErrorCode,
} from "@/lib/api-errors";
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

export function useBroadcastToken(sessionId: string) {
  const t = useTranslations("Broadcast");
  const [token, setToken] = useState("");
  const [livekitUrl, setLivekitUrl] = useState("");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [passwordPromptRequired, setPasswordPromptRequired] = useState(false);
  const [localPassword, setLocalPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  const markExpired = useCallback(() => {
    setError(t("sessionEnded"));
  }, [t]);

  const fetchToken = useCallback(
    async (pass: string): Promise<FetchTokenResult> => {
      try {
        const identity = "organizer-host";
        const passwordParam = pass
          ? `&password=${encodeURIComponent(pass)}`
          : "";
        const url = `/api/token?room=${sessionId}&identity=${identity}&role=organizer${passwordParam}`;
        const res = await fetch(url);
        const data = await res.json();

        if (res.status === 401) {
          setPasswordPromptRequired(true);
          setError(null);
          return { ok: false, reason: "password" };
        }

        if (!res.ok || data.error) {
          setError(getTokenErrorMessage(getApiErrorCode(data), t));
          return { ok: false, reason: "error" };
        }

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
      } catch (err) {
        console.error("Failed to fetch organizer token:", err);
        setError(t("fetchTokenError"));
        return { ok: false, reason: "error" };
      }
    },
    [sessionId, t]
  );

  useEffect(() => {
    const cachedPass = sessionStorage.getItem("broadcast_password") || "";
    const initialFetch = window.setTimeout(() => {
      fetchToken(cachedPass);
    }, 0);
    return () => clearTimeout(initialFetch);
  }, [fetchToken]);

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setVerifying(true);
    setPasswordError(null);
    const result = await fetchToken(localPassword);
    setVerifying(false);
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
    verifying,
  };
}
