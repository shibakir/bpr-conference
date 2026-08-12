"use client";

import { type LocalTrackPublication, type Room, Track } from "livekit-client";
import { type MutableRefObject, useEffect, useRef, useState } from "react";

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

type MediaCaptureMethod = "getUserMedia" | "getDisplayMedia";

function getLocalPresenterOrigin() {
    const url = new URL(window.location.href);
    url.hostname = "localhost";
    return url.origin;
}

function getMediaCaptureUnavailableMessage(feature: string) {
    if (!window.isSecureContext) {
        return `${feature} requires HTTPS or localhost. Open the presenter page at ${getLocalPresenterOrigin()} on this computer, or use HTTPS for the LAN address.`;
    }

    return `${feature} is not supported by this browser.`;
}

function requireMediaCaptureMethod<T extends MediaCaptureMethod>(method: T, feature: string) {
    const mediaDevices = navigator.mediaDevices;
    const mediaMethod = mediaDevices?.[method];

    if (typeof mediaMethod !== "function") {
        throw new Error(getMediaCaptureUnavailableMessage(feature));
    }

    return mediaMethod.bind(mediaDevices) as MediaDevices[T];
}

const BROADCAST_AUDIO_TRACK_NAME = "broadcast-audio";
const mixerGenerationByRoom = new WeakMap<Room, number>();

function nextMixerGeneration(room: Room) {
    const generation = (mixerGenerationByRoom.get(room) ?? 0) + 1;
    mixerGenerationByRoom.set(room, generation);
    return generation;
}

function isCurrentMixerGeneration(room: Room, generation: number) {
    return mixerGenerationByRoom.get(room) === generation;
}

function isBroadcastAudioPublication(pub: LocalTrackPublication) {
    return pub.kind === Track.Kind.Audio && pub.trackName === BROADCAST_AUDIO_TRACK_NAME;
}

function getBroadcastAudioPublications(room: Room) {
    return Array.from(room.localParticipant?.trackPublications.values() ?? []).filter(
        isBroadcastAudioPublication,
    );
}

async function unpublishBroadcastAudioPublication(
    room: Room,
    pub: LocalTrackPublication,
    reason: string,
) {
    if (!room.localParticipant || !pub.track) return;

    try {
        await room.localParticipant.unpublishTrack(pub.track, true);
        console.info(
            `[BroadcastControls] Unpublished ${reason} ${BROADCAST_AUDIO_TRACK_NAME} track:`,
            pub.trackSid,
        );
    } catch (err) {
        console.error(
            `[BroadcastControls] Failed to unpublish ${reason} ${BROADCAST_AUDIO_TRACK_NAME} track:`,
            err,
        );
    }
}

async function unpublishExtraBroadcastAudioPublications(room: Room, keep?: LocalTrackPublication) {
    const extraPublications = getBroadcastAudioPublications(room).filter((pub) => pub !== keep);

    if (extraPublications.length === 0) return;

    console.warn(
        `[BroadcastControls] Removing ${extraPublications.length} stale ${BROADCAST_AUDIO_TRACK_NAME} publication(s)`,
        extraPublications.map((pub) => ({
            muted: pub.isMuted,
            sid: pub.trackSid,
        })),
    );

    await Promise.all(
        extraPublications.map((pub) => unpublishBroadcastAudioPublication(room, pub, "stale")),
    );
}

function clearRefIfCurrent<T>(ref: MutableRefObject<T | null>, current: T | null) {
    if (current && ref.current === current) {
        ref.current = null;
    }
}

function closeAudioContext(ctx: AudioContext | null) {
    ctx?.close().catch(() => {});
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
    const destinationNodeRef = useRef<MediaStreamAudioDestinationNode | null>(null);
    const micStreamRef = useRef<MediaStream | null>(null);
    const micSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const micGainNodeRef = useRef<GainNode | null>(null);
    const tabStreamRef = useRef<MediaStream | null>(null);
    const tabSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const tabGainNodeRef = useRef<GainNode | null>(null);
    const publishedTrackPubRef = useRef<LocalTrackPublication | null>(null);
    const isMicEnabledRef = useRef(isMicEnabled);
    const isTabAudioEnabledRef = useRef(isTabAudioEnabled);

    useEffect(() => {
        isMicEnabledRef.current = isMicEnabled;
    }, [isMicEnabled]);

    useEffect(() => {
        isTabAudioEnabledRef.current = isTabAudioEnabled;
    }, [isTabAudioEnabled]);

    useEffect(() => {
        if (!room || !room.localParticipant) return;

        const localRoom = room;
        const generation = nextMixerGeneration(localRoom);
        let active = true;
        let localPub: LocalTrackPublication | null = null;
        let localAudioContext: AudioContext | null = null;
        let localDestinationNode: MediaStreamAudioDestinationNode | null = null;
        let localMixedTrack: MediaStreamTrack | null = null;

        async function initAudio() {
            try {
                const AudioContextClass =
                    window.AudioContext ||
                    (window as WindowWithWebkitAudioContext).webkitAudioContext;

                if (!AudioContextClass) {
                    throw new Error("Web Audio API is not supported in this browser.");
                }

                const ctx = new AudioContextClass();
                localAudioContext = ctx;
                if (!active || !isCurrentMixerGeneration(localRoom, generation)) {
                    closeAudioContext(ctx);
                    return;
                }

                const dest = ctx.createMediaStreamDestination();
                localDestinationNode = dest;

                const mixedTrack = dest.stream.getAudioTracks()[0];
                if (!mixedTrack) {
                    throw new Error("Failed to create mixed audio track.");
                }
                localMixedTrack = mixedTrack;

                audioContextRef.current = ctx;
                destinationNodeRef.current = dest;

                if (active && localRoom.localParticipant) {
                    await unpublishExtraBroadcastAudioPublications(localRoom);

                    if (!active || !isCurrentMixerGeneration(localRoom, generation)) {
                        mixedTrack.stop();
                        closeAudioContext(ctx);
                        return;
                    }

                    const pub = await localRoom.localParticipant.publishTrack(mixedTrack, {
                        name: BROADCAST_AUDIO_TRACK_NAME,
                        source: Track.Source.Microphone,
                    });
                    localPub = pub;

                    if (!active || !isCurrentMixerGeneration(localRoom, generation)) {
                        await unpublishBroadcastAudioPublication(localRoom, pub, "superseded");
                        mixedTrack.stop();
                        closeAudioContext(ctx);
                        return;
                    }

                    publishedTrackPubRef.current = pub;
                    if (isMicEnabledRef.current || isTabAudioEnabledRef.current) {
                        await pub.unmute();
                    } else {
                        await pub.mute();
                    }
                    await unpublishExtraBroadcastAudioPublications(localRoom, pub);

                    console.info("Published mixed audio track:", pub.trackSid);
                }
            } catch (err) {
                console.error("Failed to initialize client audio mixer:", err);
            }
        }

        void initAudio();

        return () => {
            active = false;
            if (localPub) {
                void unpublishBroadcastAudioPublication(localRoom, localPub, "mixed");
            }

            if (micSourceNodeRef.current?.context === localAudioContext) {
                stopStream(micStreamRef.current);
                micStreamRef.current = null;
                disconnectNode(micSourceNodeRef.current);
                micSourceNodeRef.current = null;
                disconnectNode(micGainNodeRef.current);
                micGainNodeRef.current = null;
            }
            if (tabSourceNodeRef.current?.context === localAudioContext) {
                stopStream(tabStreamRef.current);
                tabStreamRef.current = null;
                disconnectNode(tabSourceNodeRef.current);
                tabSourceNodeRef.current = null;
                disconnectNode(tabGainNodeRef.current);
                tabGainNodeRef.current = null;
            }
            clearRefIfCurrent(audioContextRef, localAudioContext);
            clearRefIfCurrent(destinationNodeRef, localDestinationNode);
            clearRefIfCurrent(publishedTrackPubRef, localPub);
            closeAudioContext(localAudioContext);
            if (!localPub) {
                localMixedTrack?.stop();
            }
        };
    }, [room]);

    useEffect(() => {
        const pub = publishedTrackPubRef.current;
        if (!pub) return;

        const hasActiveInput = isMicEnabled || isTabAudioEnabled;
        if (hasActiveInput) {
            pub.unmute()
                .then(() => console.info("[BroadcastControls] Unmuted broadcast-audio track"))
                .catch((err: unknown) => console.error("Failed to unmute track:", err));
        } else {
            pub.mute()
                .then(() => console.info("[BroadcastControls] Muted broadcast-audio track"))
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
            const getUserMedia = requireMediaCaptureMethod("getUserMedia", "Microphone capture");
            const stream = await getUserMedia({
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
            const getDisplayMedia = requireMediaCaptureMethod(
                "getDisplayMedia",
                "Tab audio capture",
            );
            const stream = await getDisplayMedia({
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

            const audioTrack = audioTracks[0];
            if (audioTrack) {
                audioTrack.onended = handleTrackEnded;
            }
            const videoTracks = stream.getVideoTracks();
            const videoTrack = videoTracks[0];
            if (videoTrack) {
                videoTrack.onended = handleTrackEnded;
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
                audioContextRef.current.currentTime,
            );
        }
    };

    const handleTabVolumeChange = (vol: number) => {
        setTabVolume(vol);
        if (tabGainNodeRef.current && audioContextRef.current) {
            tabGainNodeRef.current.gain.setValueAtTime(
                vol / 100,
                audioContextRef.current.currentTime,
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
