"use client";

import { useEffect, useState } from "react";
import { RoomEvent, Track, type Room } from "livekit-client";

export function useOrganizerAudioPresence(room: Room | undefined) {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!room) return;

    const checkConnected = () => {
      const hasOrganizer = Array.from(room.remoteParticipants.values()).some(
        (participant) => {
          if (!participant.identity.startsWith("organizer-")) return false;
          return Array.from(participant.trackPublications.values()).some(
            (pub) => pub.kind === Track.Kind.Audio && !pub.isMuted
          );
        }
      );
      setIsConnected(hasOrganizer);
    };

    checkConnected();

    room.on(RoomEvent.Connected, checkConnected);
    room.on(RoomEvent.SignalConnected, checkConnected);
    room.on(RoomEvent.ParticipantConnected, checkConnected);
    room.on(RoomEvent.ParticipantDisconnected, checkConnected);
    room.on(RoomEvent.TrackPublished, checkConnected);
    room.on(RoomEvent.TrackUnpublished, checkConnected);
    room.on(RoomEvent.TrackSubscribed, checkConnected);
    room.on(RoomEvent.TrackUnsubscribed, checkConnected);
    room.on(RoomEvent.TrackMuted, checkConnected);
    room.on(RoomEvent.TrackUnmuted, checkConnected);

    const interval = setInterval(checkConnected, 1000);

    return () => {
      room.off(RoomEvent.Connected, checkConnected);
      room.off(RoomEvent.SignalConnected, checkConnected);
      room.off(RoomEvent.ParticipantConnected, checkConnected);
      room.off(RoomEvent.ParticipantDisconnected, checkConnected);
      room.off(RoomEvent.TrackPublished, checkConnected);
      room.off(RoomEvent.TrackUnpublished, checkConnected);
      room.off(RoomEvent.TrackSubscribed, checkConnected);
      room.off(RoomEvent.TrackUnsubscribed, checkConnected);
      room.off(RoomEvent.TrackMuted, checkConnected);
      room.off(RoomEvent.TrackUnmuted, checkConnected);
      clearInterval(interval);
    };
  }, [room]);

  return isConnected;
}
