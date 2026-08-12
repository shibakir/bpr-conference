"use client";

import { type Room, RoomEvent } from "livekit-client";
import { useEffect, useState } from "react";

import { parseJson } from "@/lib/api-request";

import type { TranslationDiagnostic } from "../types";

type TranslationDiagnosticMessage = {
    final?: unknown;
    segmentId: string;
    targetLanguage: string;
    text: string;
    timestamp?: unknown;
    type: "input-diagnostic";
};

function isTranslationDiagnosticMessage(value: unknown): value is TranslationDiagnosticMessage {
    if (!value || typeof value !== "object") {
        return false;
    }

    const message = value as Partial<TranslationDiagnosticMessage>;
    return (
        message.type === "input-diagnostic" &&
        typeof message.segmentId === "string" &&
        typeof message.targetLanguage === "string" &&
        typeof message.text === "string"
    );
}

export function useTranslationDiagnostics(room: Room | undefined) {
    const [diagnostics, setDiagnostics] = useState<TranslationDiagnostic[]>([]);

    useEffect(() => {
        if (!room) return;

        const handleData = (
            payload: Uint8Array,
            participant: unknown,
            kind: unknown,
            topic: string | undefined,
        ) => {
            void participant;
            void kind;
            if (topic !== "translation-diagnostics") return;

            try {
                const data = parseJson(new TextDecoder().decode(payload));
                if (!isTranslationDiagnosticMessage(data)) return;

                setDiagnostics((prev) => {
                    const existing = prev.findIndex((entry) => entry.id === data.segmentId);
                    const entry: TranslationDiagnostic = {
                        id: data.segmentId,
                        targetLanguage: data.targetLanguage,
                        text: data.text,
                        final: data.final === true,
                        timestamp: typeof data.timestamp === "number" ? data.timestamp : Date.now(),
                    };

                    if (existing >= 0) {
                        const updated = [...prev];
                        const previous = updated[existing];
                        if (!previous) return updated.slice(-12);

                        updated[existing] = {
                            ...previous,
                            text: previous.text + data.text,
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
