"use client";

import {
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type Room,
  RoomEvent,
  Track,
} from "livekit-client";
import { useEffect, useRef } from "react";

export function useSelectedAudioSubscription({
  audioMuted,
  enableTranslatedAudio,
  room,
  currentLanguage,
  translatorIdentity,
}: {
  audioMuted: boolean;
  enableTranslatedAudio: boolean;
  room: Room | undefined;
  currentLanguage: string;
  translatorIdentity: string | null;
}) {
  const desiredSubscriptionRef = useRef(new Map<string, boolean>());

  useEffect(() => {
    if (!room) return;

    const updateSubscriptions = () => {
      for (const [, participant] of room.remoteParticipants) {
        const isOrganizer = participant.identity.startsWith("organizer-");
        const isSelectedTranslator =
          translatorIdentity && participant.identity === translatorIdentity;

        for (const [, pub] of participant.trackPublications) {
          if (pub.kind === Track.Kind.Audio) {
            const shouldSubscribe =
              !audioMuted &&
              (currentLanguage === "original"
                ? isOrganizer
                : enableTranslatedAudio && !!isSelectedTranslator);
            const key = `${participant.identity}:${pub.trackSid}`;

            if (desiredSubscriptionRef.current.get(key) !== shouldSubscribe) {
              desiredSubscriptionRef.current.set(key, shouldSubscribe);
              console.info("[WatchAudio] subscription target changed", {
                audioMuted,
                currentLanguage,
                enableTranslatedAudio,
                participant: participant.identity,
                selectedTranslator: translatorIdentity,
                shouldSubscribe,
                trackName: pub.trackName,
                trackSid: pub.trackSid,
              });
            }

            pub.setSubscribed(shouldSubscribe);
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
      if (
        audioMuted ||
        isOrganizer ||
        (enableTranslatedAudio && isSelectedTranslator)
      ) {
        updateSubscriptions();
      }
    };

    room.on(RoomEvent.ParticipantConnected, handleParticipantConnected);

    const handleTrackSubscribed = (
      track: RemoteTrack,
      pub: RemoteTrackPublication,
      participant: RemoteParticipant
    ) => {
      if (pub.kind !== Track.Kind.Audio) return;

      console.info("[WatchAudio] track subscribed", {
        audioMuted,
        currentLanguage,
        enableTranslatedAudio,
        participant: participant.identity,
        selectedTranslator: translatorIdentity,
        trackName: pub.trackName,
        trackSid: pub.trackSid,
        trackSource: track.source,
      });
    };

    const handleTrackUnsubscribed = (
      track: RemoteTrack,
      pub: RemoteTrackPublication,
      participant: RemoteParticipant
    ) => {
      if (pub.kind !== Track.Kind.Audio) return;

      console.info("[WatchAudio] track unsubscribed", {
        audioMuted,
        currentLanguage,
        enableTranslatedAudio,
        participant: participant.identity,
        selectedTranslator: translatorIdentity,
        trackName: pub.trackName,
        trackSid: pub.trackSid,
        trackSource: track.source,
      });
    };

    const handleSubscriptionFailed = (
      trackSid: string,
      participant: RemoteParticipant,
      error?: unknown
    ) => {
      console.warn("[WatchAudio] track subscription failed", {
        audioMuted,
        currentLanguage,
        enableTranslatedAudio,
        error: error instanceof Error ? error.message : String(error),
        participant: participant.identity,
        selectedTranslator: translatorIdentity,
        trackSid,
      });
    };

    const handleAudioPlaybackStatusChanged = (playing: boolean) => {
      const log = playing ? console.info : console.warn;
      log("[WatchAudio] playback status changed", {
        audioMuted,
        currentLanguage,
        enableTranslatedAudio,
        playing,
        selectedTranslator: translatorIdentity,
      });
    };

    room.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);
    room.on(RoomEvent.TrackSubscriptionFailed, handleSubscriptionFailed);
    room.on(
      RoomEvent.AudioPlaybackStatusChanged,
      handleAudioPlaybackStatusChanged
    );

    return () => {
      room.off(RoomEvent.Connected, handleUpdate);
      room.off(RoomEvent.TrackPublished, handleUpdate);
      room.off(RoomEvent.TrackUnpublished, handleUpdate);
      room.off(RoomEvent.ParticipantConnected, handleParticipantConnected);
      room.off(RoomEvent.TrackSubscribed, handleTrackSubscribed);
      room.off(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);
      room.off(RoomEvent.TrackSubscriptionFailed, handleSubscriptionFailed);
      room.off(
        RoomEvent.AudioPlaybackStatusChanged,
        handleAudioPlaybackStatusChanged
      );
    };
  }, [
    audioMuted,
    enableTranslatedAudio,
    room,
    currentLanguage,
    translatorIdentity,
  ]);
}
