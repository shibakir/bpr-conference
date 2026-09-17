"use client";

import type { Room } from "livekit-client";

import { useTranslationControlState } from "@/hooks/use-translation-control-state";

export function useActiveTranslations(sessionId: string, room?: Room) {
    return useTranslationControlState(sessionId, room);
}
