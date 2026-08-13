"use client";

import { MinusIcon, PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, type RefObject } from "react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

import type { TranscriptEntry } from "../types";
import { TranscriptFeed } from "./TranscriptFeed";

export function TranscriptPanel({
    canDecreaseFontSize,
    canIncreaseFontSize,
    currentLanguage,
    floatingWindowControl,
    fontSize,
    onDecreaseFontSize,
    onIncreaseFontSize,
    transcriptEndRef,
    transcripts,
}: {
    canDecreaseFontSize: boolean;
    canIncreaseFontSize: boolean;
    currentLanguage: string;
    floatingWindowControl?: ReactNode;
    fontSize: number;
    onDecreaseFontSize: () => void;
    onIncreaseFontSize: () => void;
    transcriptEndRef: RefObject<HTMLDivElement | null>;
    transcripts: TranscriptEntry[];
}) {
    const t = useTranslations("Watch");

    return (
        <section className="grid gap-3">
            <div className="flex items-center justify-between gap-3">
                <span className="text-base font-medium">{t("transcription")}</span>
                <div className="flex items-center gap-1">
                    {floatingWindowControl}
                    <Button
                        type="button"
                        variant="outline"
                        size="icon-xs"
                        onClick={onDecreaseFontSize}
                        disabled={!canDecreaseFontSize}
                        title={t("decreaseFontSize")}
                        aria-label={t("decreaseFontSize")}
                    >
                        <MinusIcon className="size-3" />
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon-xs"
                        onClick={onIncreaseFontSize}
                        disabled={!canIncreaseFontSize}
                        title={t("increaseFontSize")}
                        aria-label={t("increaseFontSize")}
                    >
                        <PlusIcon className="size-3" />
                    </Button>
                </div>
            </div>

            <ScrollArea className="h-80 rounded-lg bg-muted/20">
                <div className="p-4">
                    <TranscriptFeed
                        currentLanguage={currentLanguage}
                        fontSize={fontSize}
                        transcriptEndRef={transcriptEndRef}
                        transcripts={transcripts}
                    />
                </div>
            </ScrollArea>
        </section>
    );
}
