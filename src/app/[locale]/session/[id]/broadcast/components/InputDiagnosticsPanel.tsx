"use client";

import { useLocale, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { getLanguageByCode, getLanguageDisplayName } from "@/lib/languages";
import { cn } from "@/lib/utils";

import type { TranslationDiagnostic } from "../types";

export function InputDiagnosticsPanel({ diagnostics }: { diagnostics: TranslationDiagnostic[] }) {
    const t = useTranslations("Broadcast");
    const locale = useLocale();

    return (
        <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t("diagnostics")}
                </span>
            </div>

            {diagnostics.length === 0 ? (
                <p className="text-sm italic text-muted-foreground">{t("noDiagnostics")}</p>
            ) : (
                <div className="max-h-48 overflow-y-auto rounded-lg border bg-card [scrollbar-gutter:stable]">
                    {diagnostics.map((diagnostic, index) => {
                        const lang = getLanguageByCode(diagnostic.targetLanguage);
                        const languageName = lang
                            ? getLanguageDisplayName(lang, locale)
                            : diagnostic.targetLanguage.toUpperCase();

                        return (
                            <div
                                key={diagnostic.id}
                                className={cn(
                                    "grid gap-1 p-3",
                                    index !== diagnostics.length - 1 && "border-b",
                                )}
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <span className="font-mono text-[11px] uppercase text-muted-foreground">
                                        {t("diagnosticTarget", { language: languageName })}
                                    </span>
                                    <Badge
                                        variant="outline"
                                        className={cn(
                                            "shrink-0",
                                            diagnostic.final
                                                ? "border-success/30 text-success"
                                                : "border-warning/30 text-warning",
                                        )}
                                    >
                                        {diagnostic.final
                                            ? t("diagnosticFinal")
                                            : t("diagnosticInterim")}
                                    </Badge>
                                </div>
                                <p className="text-sm leading-6 text-muted-foreground">
                                    {diagnostic.text}
                                </p>
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
