"use client";

import { useEffect, useState } from "react";
import { RoomEvent, type Room } from "livekit-client";
import type { TranslationDiagnostic } from "../types";

export function useTranslationDiagnostics(room: Room | undefined) {
  const [diagnostics, setDiagnostics] = useState<TranslationDiagnostic[]>([]);

  useEffect(() => {
    if (!room) return;

    const handleData = (
      payload: Uint8Array,
      participant: unknown,
      kind: unknown,
      topic: string | undefined
    ) => {
      void participant;
      void kind;
      if (topic !== "translation-diagnostics") return;

      try {
        const data = JSON.parse(new TextDecoder().decode(payload));
        if (data.type !== "input-diagnostic") return;
        if (
          typeof data.segmentId !== "string" ||
          typeof data.targetLanguage !== "string" ||
          typeof data.text !== "string"
        ) {
          return;
        }

        setDiagnostics((prev) => {
          const existing = prev.findIndex(
            (entry) => entry.id === data.segmentId
          );
          const entry: TranslationDiagnostic = {
            id: data.segmentId,
            targetLanguage: data.targetLanguage,
            text: data.text,
            final: data.final === true,
            timestamp:
              typeof data.timestamp === "number" ? data.timestamp : Date.now(),
          };

          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = {
              ...updated[existing],
              text: updated[existing].text + data.text,
              final: entry.final,
              timestamp: entry.timestamp,
            };
            return updated.slice(-12);
          }

          return [...prev, entry].slice(-12);
        });
      } catch {
        // Ignore non-diagnostic data messages.
      }
    };

    room.on(RoomEvent.DataReceived, handleData);
    return () => {
      room.off(RoomEvent.DataReceived, handleData);
    };
  }, [room]);

  return diagnostics;
}
