"use client";

import { type Room, RoomEvent } from "livekit-client";
import { type RefObject, useEffect, useMemo, useState } from "react";

import { parseJson } from "@/lib/api-request";
import {
    clearCaptions,
    EMPTY_TRANSCRIPTS,
    parseCaptionMessage,
    receiveCaption,
} from "@/lib/transcript-state";

import type { TranscriptEntry } from "../types";

export function useTranslatedTranscripts({
    room,
    enabled,
    languages,
}: {
    room: Room | undefined;
    enabled: boolean;
    languages: string[];
}) {
    const [state, setState] = useState(EMPTY_TRANSCRIPTS);
    const languageKey = useMemo(
        () =>
            Array.from(new Set(languages.filter((language) => language !== "original")))
                .sort()
                .join("|"),
        [languages],
    );

    useEffect(() => {
        if (!room || !enabled) return;
        const allowedLanguages = new Set(languageKey ? languageKey.split("|") : []);

        const handleData = (
            payload: Uint8Array,
            participant: unknown,
            kind: unknown,
            topic: string | undefined,
        ) => {
            void participant;
            void kind;
            if (topic !== "transcription") return;

            try {
                const data = parseCaptionMessage(parseJson(new TextDecoder().decode(payload)));
                if (!data || !allowedLanguages.has(data.language)) return;
                setState((prev) => receiveCaption(prev, data));
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
        transcriptsByLanguage: state.entries,
        clearTranscripts: (language?: string) => setState((prev) => clearCaptions(prev, language)),
    };
}

export function useTranscriptAutoScroll(
    transcripts: TranscriptEntry[],
    transcriptEndRef: RefObject<HTMLDivElement | null>,
) {
    useEffect(() => {
        const frame = window.requestAnimationFrame(() => {
            const viewport = transcriptEndRef.current?.closest<HTMLElement>(
                '[data-slot="scroll-area-viewport"]',
            );
            if (!viewport) return;

            viewport.scrollTop = viewport.scrollHeight;
        });

        return () => window.cancelAnimationFrame(frame);
    }, [transcripts, transcriptEndRef]);
}
