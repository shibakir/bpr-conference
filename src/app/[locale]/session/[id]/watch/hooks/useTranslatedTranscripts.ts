"use client";

import { type RemoteParticipant, type Room, RoomEvent } from "livekit-client";
import { type RefObject, useCallback, useEffect, useMemo, useState } from "react";

import { useTranslationControlState } from "@/hooks/use-translation-control-state";
import { parseJson } from "@/lib/api-request";
import {
    applyHistoryReset,
    clearCaptions,
    EMPTY_TRANSCRIPTS,
    parseCaptionMessage,
    receiveCaption,
} from "@/lib/transcript-state";
import type { TranslationControl } from "@/lib/translation-control";

import type { TranscriptEntry } from "../types";

export function useTranslatedTranscripts({
    room,
    sessionId,
    enabled,
    languages,
}: {
    room: Room | undefined;
    sessionId: string;
    enabled: boolean;
    languages: string[];
}) {
    const [state, setState] = useState(EMPTY_TRANSCRIPTS);
    const handleControls = useCallback((controls: Record<string, TranslationControl>) => {
        setState((previous) =>
            Object.entries(controls).reduce(
                (next, [language, control]) =>
                    applyHistoryReset(next, language, control.historyRevision),
                previous,
            ),
        );
    }, []);
    const { controls } = useTranslationControlState(sessionId, room, handleControls);
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
            participant: RemoteParticipant | undefined,
            kind: unknown,
            topic: string | undefined,
        ) => {
            void kind;
            if (topic !== "transcription") return;

            try {
                const data = parseCaptionMessage(parseJson(new TextDecoder().decode(payload)));
                if (!data || !allowedLanguages.has(data.language)) return;
                if (participant?.identity !== `translator-${data.language}`) return;
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
        controls,
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
