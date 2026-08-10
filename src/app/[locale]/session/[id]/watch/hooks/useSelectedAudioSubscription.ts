"use client";

import { useEffect } from "react";
import { RoomEvent, Track, type RemoteParticipant, type Room } from "livekit-client";

export function useSelectedAudioSubscription({
  room,
  currentLanguage,
  translatorIdentity,
}: {
  room: Room | undefined;
  currentLanguage: string;
  translatorIdentity: string | null;
}) {
  useEffect(() => {
    if (!room) return;

    const updateSubscriptions = () => {
      for (const [, participant] of room.remoteParticipants) {
        const isOrganizer = participant.identity.startsWith("organizer-");
        const isSelectedTranslator =
          translatorIdentity && participant.identity === translatorIdentity;

        for (const [, pub] of participant.trackPublications) {
          if (pub.kind === Track.Kind.Audio) {
            if (currentLanguage === "original") {
              pub.setSubscribed(isOrganizer);
            } else {
              pub.setSubscribed(!!isSelectedTranslator);
            }
          }
        }
      }
    };

    updateSubscriptions();

    const handleUpdate = () => updateSubscriptions();
    room.on(RoomEvent.Connected, handleUpdate);
    room.on(RoomEvent.TrackPublished, handleUpdate);
    room.on(RoomEvent.TrackUnpublished, handleUpdate);

    const handleParticipantConnected = (participant: RemoteParticipant) => {
      const isOrganizer = participant.identity.startsWith("organizer-");
      const isSelectedTranslator =
        translatorIdentity && participant.identity === translatorIdentity;
      if (isOrganizer || isSelectedTranslator) {
        updateSubscriptions();
      }
    };

    room.on(RoomEvent.ParticipantConnected, handleParticipantConnected);

    return () => {
      room.off(RoomEvent.Connected, handleUpdate);
      room.off(RoomEvent.TrackPublished, handleUpdate);
      room.off(RoomEvent.TrackUnpublished, handleUpdate);
      room.off(RoomEvent.ParticipantConnected, handleParticipantConnected);
    };
  }, [room, currentLanguage, translatorIdentity]);
}
