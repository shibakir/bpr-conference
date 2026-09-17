"use client";

import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ApiRequestError, fetchValidatedJson } from "@/lib/api-client";
import { API_ERROR_CODES } from "@/lib/api-errors";
import {
    operationIsRunning,
    type TranslationAction,
    type TranslationControl,
    translationControlResponseSchema,
    type TranslationOperation,
} from "@/lib/translation-control";

export function TranslationActions({
    sessionId,
    organizerKey,
    language,
    active,
    control,
    onChanged,
}: {
    sessionId: string;
    organizerKey: string;
    language: string;
    active: boolean;
    control: TranslationControl | undefined;
    onChanged: () => void;
}) {
    const t = useTranslations("TranslationActions");
    const [pending, setPending] = useState(false);
    const [accepted, setAccepted] = useState<TranslationOperation>();
    const [error, setError] = useState<
        "failed" | "conflict" | "rateLimited" | "inactive" | "forbidden" | null
    >(null);
    const inFlight = useRef(false);
    // Retain the id on uncertain network failures so a retry cannot repeat a reset.
    const request = useRef<{ action: TranslationAction; id: string } | null>(null);
    const operation =
        !accepted || (control?.operation && control.operation.startedAt >= accepted.startedAt)
            ? control?.operation
            : accepted;
    const busy = pending || operationIsRunning(operation);

    async function run(action: TranslationAction) {
        if (inFlight.current || busy || !active) return;
        inFlight.current = true;
        setPending(true);
        setError(null);
        if (request.current?.action !== action)
            request.current = { action, id: crypto.randomUUID() };
        try {
            const result = await fetchValidatedJson(
                `/api/sessions/${encodeURIComponent(sessionId)}/translations/${encodeURIComponent(language)}/${action}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ organizerKey, requestId: request.current.id }),
                },
                translationControlResponseSchema,
            );
            request.current = null;
            setAccepted(result.operation);
            onChanged();
        } catch (err) {
            const code = err instanceof ApiRequestError ? err.code : undefined;
            if (code && code !== API_ERROR_CODES.BACKEND_UNAVAILABLE) request.current = null;
            setError(
                code === API_ERROR_CODES.TRANSLATION_OPERATION_CONFLICT
                    ? "conflict"
                    : code === API_ERROR_CODES.TRANSLATION_OPERATION_RATE_LIMITED
                      ? "rateLimited"
                      : code === API_ERROR_CODES.TRANSLATION_INACTIVE
                        ? "inactive"
                        : code === API_ERROR_CODES.ORGANIZER_ACCESS_REQUIRED
                          ? "forbidden"
                          : "failed",
            );
            onChanged();
        } finally {
            inFlight.current = false;
            setPending(false);
        }
    }

    return (
        <div className="grid gap-2">
            <div className="flex flex-wrap gap-2">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!active || busy}
                    onClick={() => {
                        void run("drain");
                    }}
                    title={t("drainHint")}
                    aria-label={t("drainLanguage", { language })}
                >
                    {t("drain")}
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!active || busy}
                    onClick={() => {
                        void run("reset");
                    }}
                    title={t("resetHint")}
                    aria-label={t("resetLanguage", { language })}
                >
                    {t("reset")}
                </Button>
            </div>
            <p
                role="status"
                aria-live="polite"
                className="whitespace-normal text-sm text-muted-foreground"
            >
                {error
                    ? t(error)
                    : pending
                      ? t("sending")
                      : operation?.state === "failed"
                        ? t(
                              operation.error === "timeout" && operation.action === "drain"
                                  ? "timeout"
                                  : "incomplete",
                          )
                        : operation
                          ? t(
                                operation.state === "completed"
                                    ? operation.action === "reset"
                                        ? "resetCompleted"
                                        : "drainCompleted"
                                    : operation.state,
                            )
                          : null}
            </p>
        </div>
    );
}
