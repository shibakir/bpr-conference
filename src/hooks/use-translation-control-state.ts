"use client";

import { type RemoteParticipant, type Room, RoomEvent } from "livekit-client";
import { useEffect } from "react";
import useSWR from "swr";
import { z } from "zod";

import { fetchValidatedJson } from "@/lib/api-client";
import { activeTranslationsResponseSchema } from "@/lib/api-schemas";
import { type TranslationControl, translationControlSchema } from "@/lib/translation-control";

const controlEventSchema = z.object({
    type: z.literal("translation-control"),
    language: z.string(),
    control: translationControlSchema,
});
const EMPTY_CONTROLS: Record<string, TranslationControl> = {};
const EMPTY_TRANSLATIONS: z.infer<typeof activeTranslationsResponseSchema>["translations"] = [];

export function useTranslationControlState(
    sessionId: string,
    room?: Room,
    onControls?: (controls: Record<string, TranslationControl>) => void,
) {
    const { data, mutate } = useSWR(
        `/api/translate/status?sessionId=${encodeURIComponent(sessionId)}`,
        (url: string) => fetchValidatedJson(url, undefined, activeTranslationsResponseSchema),
        { refreshInterval: 2000, onSuccess: (snapshot) => onControls?.(snapshot.controls) },
    );

    useEffect(() => {
        if (!room) return;
        const refresh = () => {
            void mutate();
        };
        const receive = (
            payload: Uint8Array,
            participant?: RemoteParticipant,
            _kind?: unknown,
            topic?: string,
        ) => {
            if (topic !== "translation-control") return;
            try {
                const parsed = controlEventSchema.safeParse(
                    JSON.parse(new TextDecoder().decode(payload)),
                );
                if (
                    !parsed.success ||
                    participant?.identity !== `translator-${parsed.data.language}`
                )
                    return;
                const { language, control } = parsed.data;
                onControls?.({ [language]: control });
                void mutate(
                    (previous) => {
                        const current = previous?.controls[language];
                        if (
                            current &&
                            (current.historyRevision > control.historyRevision ||
                                (current.historyRevision === control.historyRevision &&
                                    (current.operation?.finishedAt ??
                                        current.operation?.startedAt ??
                                        0) >
                                        (control.operation?.finishedAt ??
                                            control.operation?.startedAt ??
                                            0)))
                        )
                            return previous;
                        return {
                            translations: previous?.translations ?? [],
                            controls: { ...previous?.controls, [language]: control },
                        };
                    },
                    { revalidate: false },
                );
            } catch {
                /* Ignore malformed control packets. */
            }
        };
        room.on(RoomEvent.DataReceived, receive);
        room.on(RoomEvent.Reconnected, refresh);
        room.on(RoomEvent.Connected, refresh);
        return () => {
            room.off(RoomEvent.DataReceived, receive);
            room.off(RoomEvent.Reconnected, refresh);
            room.off(RoomEvent.Connected, refresh);
        };
    }, [room, mutate, onControls]);

    return {
        translations: data?.translations ?? EMPTY_TRANSLATIONS,
        controls: data?.controls ?? EMPTY_CONTROLS,
        mutate,
    };
}
