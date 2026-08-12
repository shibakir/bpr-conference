"use client";

import { type Room,RoomEvent } from "livekit-client";
import { type RefObject, useEffect, useMemo, useState } from "react";

import { parseJson } from "@/lib/api-request";

import type { TranscriptEntry } from "../types";

type TranscriptionMessage = {
  final: boolean;
  language: string;
  segmentId: string;
  text: string;
  timestamp: number;
  type: "transcription";
};

function isTranscriptionMessage(value: unknown): value is TranscriptionMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as Partial<TranscriptionMessage>;
  return (
    message.type === "transcription" &&
    typeof message.segmentId === "string" &&
    typeof message.text === "string" &&
    typeof message.language === "string" &&
    typeof message.final === "boolean" &&
    typeof message.timestamp === "number"
  );
}

export function useTranslatedTranscripts({
  room,
  enabled,
  languages,
}: {
  room: Room | undefined;
  enabled: boolean;
  languages: string[];
}) {
  const [transcriptsByLanguage, setTranscriptsByLanguage] = useState<
    Record<string, TranscriptEntry[]>
  >({});
  const languageKey = useMemo(
    () =>
      Array.from(new Set(languages.filter((language) => language !== "original")))
        .sort()
        .join("|"),
    [languages]
  );

  useEffect(() => {
    if (!room || !enabled) return;
    const allowedLanguages = new Set(languageKey ? languageKey.split("|") : []);

    const handleData = (
      payload: Uint8Array,
      participant: unknown,
      kind: unknown,
      topic: string | undefined
    ) => {
      void participant;
      void kind;
      if (topic !== "transcription") return;

      try {
        const data = parseJson(new TextDecoder().decode(payload));
        if (!isTranscriptionMessage(data)) return;
        if (!allowedLanguages.has(data.language)) return;

        setTranscriptsByLanguage((prev) => {
          const languageTranscripts = prev[data.language] ?? [];
          const existing = languageTranscripts.findIndex(
            (entry) => entry.id === data.segmentId
          );
          const entry: TranscriptEntry = {
            id: data.segmentId,
            text: data.text,
            language: data.language,
            final: data.final,
            timestamp: data.timestamp,
          };

          if (existing >= 0) {
            const updated = [...languageTranscripts];
            const previous = updated[existing];
            if (!previous) {
              return prev;
            }

            updated[existing] = {
              ...previous,
              text: previous.text + data.text,
              final: data.final,
            };
            return {
              ...prev,
              [data.language]: updated,
            };
          }

          const next = [...languageTranscripts, entry];
          return {
            ...prev,
            [data.language]: next.slice(-50),
          };
        });
      } catch {
        // Ignore non-transcription data messages.
      }
    };

    room.on(RoomEvent.DataReceived, handleData);
    return () => {
      room.off(RoomEvent.DataReceived, handleData);
    };
  }, [room, enabled, languageKey]);

  return {
    transcriptsByLanguage,
    clearTranscripts: (language?: string) => {
      if (!language) {
        setTranscriptsByLanguage({});
        return;
      }

      setTranscriptsByLanguage((prev) => {
        const next = { ...prev };
        delete next[language];
        return next;
      });
    },
  };
}

export function useTranscriptAutoScroll(
  transcripts: TranscriptEntry[],
  transcriptEndRef: RefObject<HTMLDivElement | null>
) {
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const viewport = transcriptEndRef.current?.closest<HTMLElement>(
        '[data-slot="scroll-area-viewport"]'
      );
      if (!viewport) return;

      viewport.scrollTop = viewport.scrollHeight;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [transcripts, transcriptEndRef]);
}
