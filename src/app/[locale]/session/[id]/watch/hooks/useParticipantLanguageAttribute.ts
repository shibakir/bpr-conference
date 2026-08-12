"use client";

import { type Room,RoomEvent } from "livekit-client";
import { useEffect, useMemo } from "react";

export function useParticipantLanguageAttribute({
  captionLanguages,
  room,
  currentLanguage,
}: {
  captionLanguages: string[];
  room: Room | undefined;
  currentLanguage: string;
}) {
  const captionLanguageValue = useMemo(
    () =>
      Array.from(
        new Set(captionLanguages.filter((language) => language !== "original"))
      )
        .sort()
        .join(","),
    [captionLanguages]
  );

  useEffect(() => {
    if (!room) return;

    const setLanguageAttr = () => {
      if (room.localParticipant) {
        room.localParticipant
          .setAttributes({
            language: currentLanguage,
            captionLanguages: captionLanguageValue,
          })
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
  }, [room, currentLanguage, captionLanguageValue]);
}
