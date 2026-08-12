"use client";

import { type Room,RoomEvent } from "livekit-client";
import { useEffect, useState } from "react";

export function useListenerCount(room: Room | undefined) {
  const [listenerCount, setListenerCount] = useState(0);

  useEffect(() => {
    if (!room) return;

    const updateCount = () => {
      const count = Array.from(room.remoteParticipants.values()).filter(
        (participant) => !participant.identity.startsWith("translator-")
      ).length;
      setListenerCount(count);
    };

    updateCount();

    room.on(RoomEvent.ParticipantConnected, updateCount);
    room.on(RoomEvent.ParticipantDisconnected, updateCount);
    return () => {
      room.off(RoomEvent.ParticipantConnected, updateCount);
      room.off(RoomEvent.ParticipantDisconnected, updateCount);
    };
  }, [room]);

  return listenerCount;
}
