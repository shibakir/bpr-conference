"use client";

import { CSSProperties, RefObject } from "react";
import { MinusIcon, PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { TranscriptEntry } from "../types";
import { splitIntoParagraphs } from "../utils";

export function TranscriptPanel({
  canDecreaseFontSize,
  canIncreaseFontSize,
  currentLanguage,
  fontSize,
  onDecreaseFontSize,
  onIncreaseFontSize,
  transcriptEndRef,
  transcripts,
}: {
  canDecreaseFontSize: boolean;
  canIncreaseFontSize: boolean;
  currentLanguage: string;
  fontSize: number;
  onDecreaseFontSize: () => void;
  onIncreaseFontSize: () => void;
  transcriptEndRef: RefObject<HTMLDivElement | null>;
  transcripts: TranscriptEntry[];
}) {
  const t = useTranslations("Watch");
  const transcriptStyle = {
    "--transcript-font-size": `${fontSize}px`,
  } as CSSProperties;

  return (
    <section className="space-y-4" style={transcriptStyle}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("transcription")}
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={onDecreaseFontSize}
            disabled={!canDecreaseFontSize}
            title={t("decreaseFontSize")}
            aria-label={t("decreaseFontSize")}
          >
            <MinusIcon className="size-3" />
            A
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={onIncreaseFontSize}
            disabled={!canIncreaseFontSize}
            title={t("increaseFontSize")}
            aria-label={t("increaseFontSize")}
          >
            <PlusIcon className="size-3" />
            A
          </Button>
        </div>
      </div>

      <ScrollArea className="h-80 rounded-lg border bg-card">
        <div className="p-4">
          {transcripts.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">
              {currentLanguage === "original"
                ? t("selectLanguageForTranscription")
                : t("waitingForSpeech")}
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {transcripts.map((entry, i) => {
                const paragraphs = splitIntoParagraphs(entry.text, 2);
                return (
                  <div
                    key={`${entry.id}-${i}`}
                    className="flex flex-col gap-2"
                  >
                    {paragraphs.map((para, paraIdx) => (
                      <p
                        key={paraIdx}
                        className={cn(
                          "font-sans text-[length:var(--transcript-font-size)] leading-7 transition-colors",
                          entry.final
                            ? "text-foreground"
                            : "text-muted-foreground"
                        )}
                      >
                        {para}
                      </p>
                    ))}
                  </div>
                );
              })}
              <div ref={transcriptEndRef} />
            </div>
          )}
        </div>
      </ScrollArea>
    </section>
  );
}
