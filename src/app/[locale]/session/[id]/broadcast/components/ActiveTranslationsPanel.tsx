"use client";

import { useLocale, useTranslations } from "next-intl";
import { Fragment } from "react";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { getLanguageByCode, getLanguageDisplayName } from "@/lib/languages";
import type { TranslationControl } from "@/lib/translation-control";
import { cn } from "@/lib/utils";

import type { TranslationInfo } from "../types";
import { TranslationActions } from "./TranslationActions";

export function ActiveTranslationsPanel({
    translations,
    controls,
    sessionId,
    organizerKey,
    onChanged,
}: {
    translations: TranslationInfo[];
    controls: Record<string, TranslationControl>;
    sessionId: string;
    organizerKey: string;
    onChanged: () => void;
}) {
    const t = useTranslations("Broadcast");
    const actionT = useTranslations("TranslationActions");
    const locale = useLocale();

    return (
        <section className="grid gap-3">
            <div className="flex items-center justify-between gap-3">
                <span className="text-base font-medium">
                    {t("translationsCount", { count: translations.length })}
                </span>
            </div>
            {translations.length > 0 && (
                <p className="text-sm text-muted-foreground">{actionT("hint")}</p>
            )}

            {translations.length === 0 ? (
                <p className="rounded-lg bg-muted/20 p-3 text-base text-muted-foreground">
                    {t("noTranslations")}
                </p>
            ) : (
                <div className="overflow-hidden rounded-lg bg-muted/20">
                    <Table>
                        <TableBody>
                            {translations.map((translation) => {
                                const lang = getLanguageByCode(translation.language);
                                const languageName = lang
                                    ? getLanguageDisplayName(lang, locale)
                                    : translation.language.toUpperCase();
                                const active = translation.status === "active";

                                return (
                                    <Fragment key={translation.language}>
                                        <TableRow key={translation.language}>
                                            <TableCell className="min-w-0 p-3">
                                                <div className="flex min-w-0 items-center gap-2">
                                                    {lang?.flag && (
                                                        <span className="text-lg">{lang.flag}</span>
                                                    )}
                                                    <span className="truncate text-base font-medium">
                                                        {languageName}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="p-3 text-right">
                                                <span className="font-mono text-sm text-muted-foreground">
                                                    {t("listenerCount", {
                                                        count: translation.subscriberCount,
                                                    })}
                                                </span>
                                            </TableCell>
                                            <TableCell className="w-0 p-3">
                                                <Badge
                                                    variant="outline"
                                                    className={cn(
                                                        "gap-1",
                                                        active
                                                            ? "border-success/30 text-success"
                                                            : "border-warning/30 text-warning",
                                                    )}
                                                >
                                                    <span className="size-1.5 rounded-full bg-current animate-pulse" />
                                                    {translation.status}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell colSpan={3} className="px-3 pb-3 pt-0">
                                                <TranslationActions
                                                    sessionId={sessionId}
                                                    organizerKey={organizerKey}
                                                    language={translation.language}
                                                    active={active}
                                                    control={controls[translation.language]}
                                                    onChanged={onChanged}
                                                />
                                            </TableCell>
                                        </TableRow>
                                    </Fragment>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            )}
        </section>
    );
}
