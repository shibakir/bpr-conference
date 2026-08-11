"use client";

import { MutableRefObject, RefObject, useEffect, useState } from "react";
import { RoomEvent, type Room } from "livekit-client";
import type { TranscriptEntry } from "../types";

export function useTranslatedTranscripts({
  room,
  enabled,
  currentLanguageRef,
}: {
  room: Room | undefined;
  enabled: boolean;
  currentLanguageRef: MutableRefObject<string>;
}) {
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);

  useEffect(() => {
    if (!room || !enabled) return;

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
        const data = JSON.parse(new TextDecoder().decode(payload));
        if (data.type !== "transcription") return;
        if (data.language !== currentLanguageRef.current) return;

        setTranscripts((prev) => {
          const existing = prev.findIndex(
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
            const updated = [...prev];
            updated[existing] = {
              ...updated[existing],
              text: updated[existing].text + data.text,
              final: data.final,
            };
            return updated;
          }

          const next = [...prev, entry];
          return next.slice(-50);
        });
      } catch {
        // Ignore non-transcription data messages.
      }
    };

    room.on(RoomEvent.DataReceived, handleData);
    return () => {
      room.off(RoomEvent.DataReceived, handleData);
    };
  }, [room, enabled, currentLanguageRef]);

  return {
    transcripts,
    clearTranscripts: () => setTranscripts([]),
  };
}

export function useTranscriptAutoScroll(
  transcripts: TranscriptEntry[],
  transcriptEndRef: RefObject<HTMLDivElement | null>
) {
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts, transcriptEndRef]);
}
