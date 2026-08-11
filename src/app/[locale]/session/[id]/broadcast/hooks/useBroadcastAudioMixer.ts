"use client";

import { useEffect, useRef, useState } from "react";
import { Track, type LocalTrackPublication, type Room } from "livekit-client";

type WindowWithWebkitAudioContext = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function disconnectNode(node: AudioNode | null) {
  node?.disconnect();
}

export function useBroadcastAudioMixer({
  noTabAudioMessage,
  room,
  tabAudioErrorMessage,
  micAccessErrorMessage,
}: {
  noTabAudioMessage: string;
  room: Room | undefined;
  tabAudioErrorMessage: (message: string) => string;
  micAccessErrorMessage: (message: string) => string;
}) {
  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const [isTabAudioEnabled, setIsTabAudioEnabled] = useState(false);
  const [micVolume, setMicVolume] = useState(100);
  const [tabVolume, setTabVolume] = useState(100);
  const audioContextRef = useRef<AudioContext | null>(null);
  const destinationNodeRef = useRef<MediaStreamAudioDestinationNode | null>(
    null
  );
  const micStreamRef = useRef<MediaStream | null>(null);
  const micSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micGainNodeRef = useRef<GainNode | null>(null);
  const tabStreamRef = useRef<MediaStream | null>(null);
  const tabSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const tabGainNodeRef = useRef<GainNode | null>(null);
  const publishedTrackPubRef = useRef<LocalTrackPublication | null>(null);

  useEffect(() => {
    if (!room || !room.localParticipant) return;

    const localRoom = room;
    let active = true;
    let localPub: LocalTrackPublication | null = null;

    async function initAudio() {
      try {
        const AudioContextClass =
          window.AudioContext ||
          (window as WindowWithWebkitAudioContext).webkitAudioContext;

        if (!AudioContextClass) {
          throw new Error("Web Audio API is not supported in this browser.");
        }

        const ctx = new AudioContextClass();
        audioContextRef.current = ctx;

        const dest = ctx.createMediaStreamDestination();
        destinationNodeRef.current = dest;

        const mixedTrack = dest.stream.getAudioTracks()[0];

        if (active && localRoom.localParticipant) {
          const pub = await localRoom.localParticipant.publishTrack(mixedTrack, {
            name: "broadcast-audio",
            source: Track.Source.Microphone,
          });
          publishedTrackPubRef.current = pub;
          localPub = pub;
          await pub.mute();
          console.log(
            "Published and initially muted mixed audio track:",
            pub.trackSid
          );
        }
      } catch (err) {
        console.error("Failed to initialize client audio mixer:", err);
      }
    }

    initAudio();

    return () => {
      active = false;
      if (localPub?.track && localRoom.localParticipant) {
        localRoom.localParticipant.unpublishTrack(localPub.track).catch((err) => {
          console.error("Failed to unpublish mixed track:", err);
        });
      }

      stopStream(micStreamRef.current);
      micStreamRef.current = null;
      disconnectNode(micSourceNodeRef.current);
      micSourceNodeRef.current = null;
      disconnectNode(micGainNodeRef.current);
      micGainNodeRef.current = null;
      stopStream(tabStreamRef.current);
      tabStreamRef.current = null;
      disconnectNode(tabSourceNodeRef.current);
      tabSourceNodeRef.current = null;
      disconnectNode(tabGainNodeRef.current);
      tabGainNodeRef.current = null;
      audioContextRef.current?.close().catch(() => {});
      audioContextRef.current = null;
      destinationNodeRef.current = null;
      publishedTrackPubRef.current = null;
    };
  }, [room]);

  useEffect(() => {
    const pub = publishedTrackPubRef.current;
    if (!pub) return;

    const hasActiveInput = isMicEnabled || isTabAudioEnabled;
    if (hasActiveInput) {
      pub
        .unmute()
        .then(() =>
          console.log("[BroadcastControls] Unmuted broadcast-audio track")
        )
        .catch((err: unknown) => console.error("Failed to unmute track:", err));
    } else {
      pub
        .mute()
        .then(() =>
          console.log("[BroadcastControls] Muted broadcast-audio track")
        )
        .catch((err: unknown) => console.error("Failed to mute track:", err));
    }
  }, [isMicEnabled, isTabAudioEnabled]);

  const toggleMicrophone = async () => {
    const ctx = audioContextRef.current;
    const dest = destinationNodeRef.current;
    if (!ctx || !dest) return;

    if (isMicEnabled) {
      disconnectNode(micSourceNodeRef.current);
      micSourceNodeRef.current = null;
      disconnectNode(micGainNodeRef.current);
      micGainNodeRef.current = null;
      stopStream(micStreamRef.current);
      micStreamRef.current = null;
      setIsMicEnabled(false);
      return;
    }

    try {
      await ctx.resume();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      micStreamRef.current = stream;

      const source = ctx.createMediaStreamSource(stream);
      micSourceNodeRef.current = source;

      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(micVolume / 100, ctx.currentTime);
      micGainNodeRef.current = gainNode;

      source.connect(gainNode);
      gainNode.connect(dest);

      setIsMicEnabled(true);
    } catch (err) {
      console.error("Failed to access microphone:", err);
      alert(micAccessErrorMessage((err as Error).message));
    }
  };

  const toggleTabAudio = async () => {
    const ctx = audioContextRef.current;
    const dest = destinationNodeRef.current;
    if (!ctx || !dest) return;

    if (isTabAudioEnabled) {
      disconnectNode(tabSourceNodeRef.current);
      tabSourceNodeRef.current = null;
      disconnectNode(tabGainNodeRef.current);
      tabGainNodeRef.current = null;
      stopStream(tabStreamRef.current);
      tabStreamRef.current = null;
      setIsTabAudioEnabled(false);
      return;
    }

    try {
      await ctx.resume();
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "browser" },
        audio: true,
      });

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        stopStream(stream);
        alert(noTabAudioMessage);
        return;
      }

      tabStreamRef.current = stream;

      const source = ctx.createMediaStreamSource(stream);
      tabSourceNodeRef.current = source;

      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(tabVolume / 100, ctx.currentTime);
      tabGainNodeRef.current = gainNode;

      source.connect(gainNode);
      gainNode.connect(dest);

      setIsTabAudioEnabled(true);

      const handleTrackEnded = () => {
        disconnectNode(tabSourceNodeRef.current);
        tabSourceNodeRef.current = null;
        disconnectNode(tabGainNodeRef.current);
        tabGainNodeRef.current = null;
        stopStream(stream);
        tabStreamRef.current = null;
        setIsTabAudioEnabled(false);
      };

      audioTracks[0].onended = handleTrackEnded;
      const videoTracks = stream.getVideoTracks();
      if (videoTracks.length > 0) {
        videoTracks[0].onended = handleTrackEnded;
      }
    } catch (err) {
      console.error("Failed to capture tab audio:", err);
      if ((err as Error).name !== "NotAllowedError") {
        alert(tabAudioErrorMessage((err as Error).message));
      }
    }
  };

  const handleMicVolumeChange = (vol: number) => {
    setMicVolume(vol);
    if (micGainNodeRef.current && audioContextRef.current) {
      micGainNodeRef.current.gain.setValueAtTime(
        vol / 100,
        audioContextRef.current.currentTime
      );
    }
  };

  const handleTabVolumeChange = (vol: number) => {
    setTabVolume(vol);
    if (tabGainNodeRef.current && audioContextRef.current) {
      tabGainNodeRef.current.gain.setValueAtTime(
        vol / 100,
        audioContextRef.current.currentTime
      );
    }
  };

  return {
    handleMicVolumeChange,
    handleTabVolumeChange,
    isAudioActive: isMicEnabled || isTabAudioEnabled,
    isMicEnabled,
    isTabAudioEnabled,
    micVolume,
    tabVolume,
    toggleMicrophone,
    toggleTabAudio,
  };
}
