"use client";

import { useTranslations } from "next-intl";
import { type RefObject } from "react";

import { cn } from "@/lib/utils";

import type { TranscriptEntry } from "../types";
import { getTranscriptParagraphs } from "../utils";

export function TranscriptFeed({
  className,
  currentLanguage,
  fontSize,
  paragraphClassName,
  transcriptEndRef,
  transcripts,
}: {
  className?: string;
  currentLanguage: string;
  fontSize: number;
  paragraphClassName?: string;
  transcriptEndRef?: RefObject<HTMLDivElement | null>;
  transcripts: TranscriptEntry[];
}) {
  const t = useTranslations("Watch");
  const paragraphs = getTranscriptParagraphs(transcripts, 2);

  if (paragraphs.length === 0) {
    return (
      <p className="text-sm italic text-muted-foreground">
        {currentLanguage === "original"
          ? t("selectLanguageForTranscription")
          : t("waitingForSpeech")}
      </p>
    );
  }

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {paragraphs.map((paragraph) => (
        <p
          key={paragraph.id}
          className={cn(
            "font-sans leading-7 transition-colors",
            paragraph.final ? "text-foreground" : "text-muted-foreground",
            paragraphClassName
          )}
          style={{ fontSize }}
        >
          {paragraph.text}
        </p>
      ))}
      {transcriptEndRef && <div ref={transcriptEndRef} />}
    </div>
  );
}
