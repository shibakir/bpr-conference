"use client";

import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useId, useState } from "react";
import useSWR from "swr";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ApiRequestError, fetchValidatedJson } from "@/lib/api-client";
import { getLanguageByCode, getLanguageDisplayName } from "@/lib/languages";
import {
    OUTPUT_BACKLOG_OPTIONS_MS,
    type TranslationSettingsSnapshot,
    translationSettingsSnapshotSchema,
} from "@/lib/translation-settings";

const diagnosticsSchema = z.object({
    language: z.string(),
    settings: translationSettingsSnapshotSchema,
    outputBacklogMs: z.number(),
    droppedOutputMs: z.number(),
    droppedInputMs: z.number(),
    playbackSpeed: z.number(),
    state: z.enum(["normal", "accelerating", "dropping", "recovering"]),
    bufferedBytes: z.number(),
    inputPackagingMs: z.number().nullable().optional(),
    outputPublishDelayMs: z.number().nullable().optional(),
    droppedCaptionSegments: z.number().optional(),
    failedCaptionUpdates: z.number().optional(),
});
const responseSchema = z.object({
    settings: translationSettingsSnapshotSchema,
    availableInputFrameSizesMs: z.array(z.number()),
    translations: z.array(diagnosticsSchema),
    partialFailure: z.boolean().optional(),
    errors: z.array(z.object({ language: z.string(), message: z.string() })).optional(),
});

export function TranslationSettingsPanel({
    sessionId,
    organizerKey,
}: {
    sessionId: string;
    organizerKey: string;
}) {
    const t = useTranslations("TranslationDelay");
    const locale = useLocale();
    const id = useId();
    const url = `/api/sessions/${encodeURIComponent(sessionId)}/translation-settings`;
    const {
        data,
        error: loadError,
        mutate,
    } = useSWR<z.infer<typeof responseSchema>, Error>(
        [url, organizerKey],
        ([address, key]: [string, string]) =>
            fetchValidatedJson(address, { headers: { "x-organizer-key": key } }, responseSchema),
        { refreshInterval: 2000 },
    );
    const [draft, setDraft] = useState<TranslationSettingsSnapshot | null>(null);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<"saved" | "failed" | "conflict" | "partial" | null>(
        null,
    );
    const value = draft ?? data?.settings;
    const partial =
        data?.translations.some((item) => item.settings.version !== data.settings.version) ?? false;
    const dirty =
        !!draft &&
        (draft.inputFrameSizeMs !== data?.settings.inputFrameSizeMs ||
            draft.maxOutputBacklogMs !== data?.settings.maxOutputBacklogMs);

    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!value || saving) return;
        setSaving(true);
        setMessage(null);
        try {
            const result = await fetchValidatedJson(
                url,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        organizerKey,
                        expectedVersion: value.version,
                        inputFrameSizeMs: value.inputFrameSizeMs,
                        maxOutputBacklogMs: value.maxOutputBacklogMs,
                    }),
                },
                responseSchema,
            );
            await mutate(result, { revalidate: false });
            setDraft(null);
            setMessage(result.partialFailure ? "partial" : "saved");
        } catch (error) {
            setMessage(
                error instanceof ApiRequestError && error.status === 409 ? "conflict" : "failed",
            );
            void mutate();
        } finally {
            setSaving(false);
        }
    }

    if (!value)
        return (
            <section className="grid gap-2" aria-label={t("title")}>
                <p className="text-sm text-muted-foreground">
                    {loadError ? t("loadFailed") : t("loading")}
                </p>
                {loadError && (
                    <Button variant="outline" onClick={() => void mutate()}>
                        {t("retry")}
                    </Button>
                )}
            </section>
        );

    return (
        <section className="grid gap-4" aria-labelledby={`${id}-title`}>
            <h2 id={`${id}-title`} className="text-base font-medium">
                {t("title")}
            </h2>
            <form onSubmit={save} className="grid gap-4">
                <div className="grid gap-2">
                    <label htmlFor={`${id}-queue`} className="text-sm font-medium">
                        {t("queueLabel")}
                    </label>
                    <NativeSelect
                        id={`${id}-queue`}
                        value={value.maxOutputBacklogMs}
                        disabled={saving}
                        aria-describedby={`${id}-queue-help`}
                        onChange={(event) => {
                            setDraft({
                                ...value,
                                maxOutputBacklogMs: Number(
                                    event.target.value,
                                ) as TranslationSettingsSnapshot["maxOutputBacklogMs"],
                            });
                            setMessage(null);
                        }}
                    >
                        {OUTPUT_BACKLOG_OPTIONS_MS.map((ms) => (
                            <NativeSelectOption key={ms} value={ms}>
                                {t("seconds", { value: ms / 1000 })}
                            </NativeSelectOption>
                        ))}
                    </NativeSelect>
                    <p id={`${id}-queue-help`} className="text-sm text-muted-foreground">
                        {t("queueHelp")}
                    </p>
                </div>
                <div className="grid gap-2">
                    <label htmlFor={`${id}-frame`} className="text-sm font-medium">
                        {t("frameLabel")}
                    </label>
                    <NativeSelect
                        id={`${id}-frame`}
                        value={value.inputFrameSizeMs}
                        disabled={saving}
                        aria-describedby={`${id}-frame-help`}
                        onChange={(event) => {
                            setDraft({
                                ...value,
                                inputFrameSizeMs: Number(
                                    event.target.value,
                                ) as TranslationSettingsSnapshot["inputFrameSizeMs"],
                            });
                            setMessage(null);
                        }}
                    >
                        {(data?.availableInputFrameSizesMs ?? [100]).map((ms) => (
                            <NativeSelectOption key={ms} value={ms}>
                                {t(ms === 100 ? "standardFrame" : "experimentalFrame", {
                                    value: ms,
                                })}
                            </NativeSelectOption>
                        ))}
                    </NativeSelect>
                    <p id={`${id}-frame-help`} className="text-sm text-muted-foreground">
                        {t("frameHelp")}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button type="submit" size="sm" disabled={saving || (!dirty && !partial)}>
                        {t(saving ? "saving" : "apply")}
                    </Button>
                    {(dirty || message === "conflict") && (
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={saving}
                            onClick={() => {
                                setDraft(null);
                                setMessage(null);
                                void mutate();
                            }}
                        >
                            {t("resetDraft")}
                        </Button>
                    )}
                    <span className="text-xs text-muted-foreground">{t("appliesLive")}</span>
                </div>
                <p role="status" aria-live="polite" className="text-sm">
                    {message ? t(message) : partial ? t("partial") : ""}
                </p>
            </form>
            {!!data?.translations.length && (
                <div className="grid gap-2">
                    <p className="text-sm font-medium">{t("diagnostics")}</p>
                    {data.translations.map((item) => {
                        const language = getLanguageByCode(item.language);
                        return (
                            <div
                                key={item.language}
                                className="grid gap-1 rounded-lg bg-muted/30 p-3 text-sm"
                            >
                                <div className="flex flex-wrap justify-between gap-2">
                                    <strong>
                                        {language
                                            ? getLanguageDisplayName(language, locale)
                                            : item.language}
                                    </strong>
                                    <span>{t(`states.${item.state}`)}</span>
                                </div>
                                <p>
                                    {t("queueMetric", {
                                        value: item.outputBacklogMs,
                                        limit: item.settings.maxOutputBacklogMs,
                                    })}
                                </p>
                                <p className="text-muted-foreground">
                                    {t("speedMetric", { value: item.playbackSpeed.toFixed(2) })} ·{" "}
                                    {t("dropMetric", {
                                        input: (item.droppedInputMs / 1000).toFixed(1),
                                        output: (item.droppedOutputMs / 1000).toFixed(1),
                                    })}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {t("serverTiming", {
                                        input: item.inputPackagingMs ?? "—",
                                        output: item.outputPublishDelayMs ?? "—",
                                    })}
                                </p>
                                {((item.droppedCaptionSegments ?? 0) > 0 ||
                                    (item.failedCaptionUpdates ?? 0) > 0) && (
                                    <p className="text-warning">
                                        {t("captionDeliveryLoss", {
                                            skipped: item.droppedCaptionSegments ?? 0,
                                            failed: item.failedCaptionUpdates ?? 0,
                                        })}
                                    </p>
                                )}
                                {item.settings.version !== data.settings.version && (
                                    <p className="text-warning">{t("languagePending")}</p>
                                )}
                            </div>
                        );
                    })}
                    <p className="text-xs text-muted-foreground">{t("fullDelayUnavailable")}</p>
                </div>
            )}
            {loadError && (
                <p role="status" className="text-sm text-warning">
                    {t("stale")}
                </p>
            )}
        </section>
    );
}
