"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import useSWRMutation from "swr/mutation";

import { ApiRequestError, fetchValidatedJson } from "@/lib/api-client";
import { API_ERROR_CODES, type ApiErrorCode } from "@/lib/api-errors";
import { presenterStatusResponseSchema, tokenResponseSchema } from "@/lib/api-schemas";
import {
    clearStoredBroadcastOwnerKey,
    getOrCreateBroadcastPresenterClientId,
    getStoredBroadcastOwnerKey,
    setStoredBroadcastOwnerKey,
} from "@/lib/broadcast-owner";

export type BroadcastPresenterAccessState =
    "loading" | "missing_key" | "active_elsewhere" | "ready" | "error";

const PRESENTER_HEARTBEAT_MS = 5_000;
const ORGANIZER_KEY_SEARCH_PARAM = "organizerKey";

type PresenterClaimArg = {
    clientId: string;
    organizerKey: string;
    takeover: boolean;
};

type OrganizerTokenArg = {
    presenterClientId: string;
    organizerKey: string;
    sessionId: string;
};

function getTokenErrorMessage(
    code: ApiErrorCode | undefined,
    t: ReturnType<typeof useTranslations<"Broadcast">>,
) {
    switch (code) {
        case API_ERROR_CODES.SESSION_INACTIVE:
        case API_ERROR_CODES.SESSION_NOT_FOUND:
            return t("sessionInactive");
        case API_ERROR_CODES.LIVEKIT_NOT_CONFIGURED:
            return t("livekitNotConfigured");
        case API_ERROR_CODES.ORGANIZER_ACCESS_REQUIRED:
            return t("organizerAccessRequiredDescription");
        case API_ERROR_CODES.BROADCAST_ALREADY_ACTIVE:
            return t("controlsActiveDescription");
        case API_ERROR_CODES.INVALID_REQUEST:
            return t("invalidRequest");
        default:
            return t("fetchTokenError");
    }
}

function fetchPresenterStatus(url: string) {
    return fetchValidatedJson(url, undefined, presenterStatusResponseSchema);
}

function claimPresenterRequest(
    url: string,
    {
        arg,
    }: {
        arg: PresenterClaimArg;
    },
) {
    return fetchValidatedJson(
        url,
        {
            body: JSON.stringify(arg),
            headers: { "Content-Type": "application/json" },
            method: "POST",
        },
        presenterStatusResponseSchema,
    );
}

function fetchOrganizerTokenRequest(
    url: string,
    {
        arg,
    }: {
        arg: OrganizerTokenArg;
    },
) {
    return fetchValidatedJson(
        url,
        {
            body: JSON.stringify({
                identity: "organizer-host",
                organizerKey: arg.organizerKey,
                presenterClientId: arg.presenterClientId,
                role: "organizer",
                room: arg.sessionId,
            }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
        },
        tokenResponseSchema,
    );
}

function getOrganizerKeyFromCurrentUrl() {
    const url = new URL(window.location.href);
    const organizerKey = url.searchParams.get(ORGANIZER_KEY_SEARCH_PARAM)?.trim() ?? "";

    if (!organizerKey) return "";

    url.searchParams.delete(ORGANIZER_KEY_SEARCH_PARAM);
    window.history.replaceState(
        window.history.state,
        "",
        `${url.pathname}${url.search}${url.hash}`,
    );

    return organizerKey;
}

export function useBroadcastToken(sessionId: string) {
    const t = useTranslations("Broadcast");
    const [accessState, setAccessState] = useState<BroadcastPresenterAccessState>("loading");
    const [token, setToken] = useState("");
    const [livekitUrl, setLivekitUrl] = useState("");
    const [expiresAt, setExpiresAt] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [canTakeOver, setCanTakeOver] = useState(false);
    const [organizerKey, setOrganizerKey] = useState("");
    const [presenterClientId, setPresenterClientId] = useState("");
    const presenterUrl = `/api/sessions/${encodeURIComponent(sessionId)}/presenter`;
    const { isMutating: claimingPresenter, trigger: claimPresenter } = useSWRMutation(
        presenterUrl,
        claimPresenterRequest,
    );
    const { isMutating: fetchingToken, trigger: fetchOrganizerToken } = useSWRMutation(
        "/api/token",
        fetchOrganizerTokenRequest,
    );

    const clearConnectionState = useCallback(() => {
        setToken("");
        setLivekitUrl("");
        setExpiresAt(null);
    }, []);

    const markExpired = useCallback(() => {
        clearConnectionState();
        setAccessState("error");
        setError(t("sessionEnded"));
    }, [clearConnectionState, t]);

    const handleAccessError = useCallback(
        (requestError: unknown, options: { canTakeOver?: boolean } = {}) => {
            if (requestError instanceof ApiRequestError) {
                if (requestError.code === API_ERROR_CODES.BROADCAST_ALREADY_ACTIVE) {
                    clearConnectionState();
                    setAccessState("active_elsewhere");
                    setCanTakeOver(options.canTakeOver === true);
                    setError(null);
                    return;
                }

                if (requestError.code === API_ERROR_CODES.ORGANIZER_ACCESS_REQUIRED) {
                    clearStoredBroadcastOwnerKey(sessionId);
                    clearConnectionState();
                    setAccessState("missing_key");
                    setCanTakeOver(false);
                    setOrganizerKey("");
                    setError(null);
                    return;
                }

                setError(getTokenErrorMessage(requestError.code, t));
            } else {
                setError(t("fetchTokenError"));
            }

            clearConnectionState();
            setAccessState("error");
            setCanTakeOver(false);
        },
        [clearConnectionState, sessionId, t],
    );

    const claimAndFetchToken = useCallback(
        async (key: string, clientId: string, takeover: boolean) => {
            setAccessState("loading");
            setError(null);
            setCanTakeOver(false);

            try {
                await claimPresenter({
                    clientId,
                    organizerKey: key,
                    takeover,
                });
                const data = await fetchOrganizerToken({
                    organizerKey: key,
                    presenterClientId: clientId,
                    sessionId,
                });

                setToken(data.token);
                setLivekitUrl(data.serverUrl);
                setExpiresAt(typeof data.expiresAt === "string" ? data.expiresAt : null);
                setAccessState("ready");
                setCanTakeOver(false);
            } catch (requestError) {
                handleAccessError(requestError, { canTakeOver: !!key });
            }
        },
        [claimPresenter, fetchOrganizerToken, handleAccessError, sessionId],
    );

    useEffect(() => {
        let active = true;
        const initializeTimeoutId = window.setTimeout(() => {
            if (!active) return;

            const recoveryKey = getOrganizerKeyFromCurrentUrl();
            if (recoveryKey) {
                setStoredBroadcastOwnerKey(sessionId, recoveryKey);
            }

            const key = recoveryKey || getStoredBroadcastOwnerKey(sessionId);
            const clientId = getOrCreateBroadcastPresenterClientId(sessionId);

            setOrganizerKey(key);
            setPresenterClientId(clientId);
            setError(null);
            setCanTakeOver(false);
            clearConnectionState();

            if (!key) {
                setAccessState("loading");
                fetchPresenterStatus(presenterUrl)
                    .then((status) => {
                        if (!active) return;
                        setAccessState(status.active ? "active_elsewhere" : "missing_key");
                        setCanTakeOver(false);
                    })
                    .catch((requestError) => {
                        if (!active) return;
                        handleAccessError(requestError, { canTakeOver: false });
                    });

                return;
            }

            void claimAndFetchToken(key, clientId, false);
        }, 0);

        return () => {
            active = false;
            window.clearTimeout(initializeTimeoutId);
        };
    }, [claimAndFetchToken, clearConnectionState, handleAccessError, presenterUrl, sessionId]);

    useEffect(() => {
        if (accessState !== "ready" || !organizerKey || !presenterClientId) {
            return;
        }

        const intervalId = window.setInterval(() => {
            claimPresenter({
                clientId: presenterClientId,
                organizerKey,
                takeover: false,
            }).catch((requestError: unknown) => {
                handleAccessError(requestError, { canTakeOver: !!organizerKey });
            });
        }, PRESENTER_HEARTBEAT_MS);

        return () => window.clearInterval(intervalId);
    }, [accessState, claimPresenter, handleAccessError, organizerKey, presenterClientId]);

    const takeOver = useCallback(() => {
        if (!organizerKey || !presenterClientId) return;
        void claimAndFetchToken(organizerKey, presenterClientId, true);
    }, [claimAndFetchToken, organizerKey, presenterClientId]);

    return {
        accessState,
        canTakeOver,
        error,
        expiresAt,
        organizerKey,
        livekitUrl,
        markExpired,
        setError,
        takeOver,
        token,
        verifying: claimingPresenter || fetchingToken,
    };
}
