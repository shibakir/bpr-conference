"use client";

import { MutableRefObject, useEffect } from "react";
import { RoomEvent, type Room } from "livekit-client";

export function useParticipantLanguageAttribute({
  room,
  currentLanguage,
}: {
  room: Room | undefined;
  currentLanguage: string;
}) {
  useEffect(() => {
    if (!room) return;

    const setLanguageAttr = () => {
      if (room.localParticipant) {
        room.localParticipant
          .setAttributes({ language: currentLanguage })
          .catch((err) =>
            console.error("Failed to set participant attributes:", err)
          );
      }
    };

    setLanguageAttr();

    room.on(RoomEvent.Connected, setLanguageAttr);
    return () => {
      room.off(RoomEvent.Connected, setLanguageAttr);
    };
  }, [room, currentLanguage]);
}

export function useTranslationUnsubscribeOnLeave({
  sessionId,
  currentLanguageRef,
}: {
  sessionId: string;
  currentLanguageRef: MutableRefObject<string>;
}) {
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (
        currentLanguageRef.current &&
        currentLanguageRef.current !== "original"
      ) {
        const body = JSON.stringify({
          sessionId,
          targetLanguage: currentLanguageRef.current,
        });
        navigator.sendBeacon(
          "/api/translate/unsubscribe",
          new Blob([body], { type: "application/json" })
        );
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      handleBeforeUnload();
    };
  }, [sessionId, currentLanguageRef]);
}
