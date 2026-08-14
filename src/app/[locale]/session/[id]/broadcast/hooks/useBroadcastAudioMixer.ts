"use client";

import { type LocalTrackPublication, type Room, Track } from "livekit-client";
import { type MutableRefObject, useCallback, useEffect, useRef, useState } from "react";

import { clientLogger } from "@/lib/client-logger";

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

export type AudioInputDevice = {
    deviceId: string;
    groupId: string;
    label: string;
};

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
const DEFAULT_AUDIO_INPUT_DEVICE_ID = "";
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
        clientLogger.info(
            `[BroadcastControls] Unpublished ${reason} ${BROADCAST_AUDIO_TRACK_NAME} track:`,
            pub.trackSid,
        );
    } catch (err) {
        clientLogger.error(
            `[BroadcastControls] Failed to unpublish ${reason} ${BROADCAST_AUDIO_TRACK_NAME} track:`,
            err,
        );
    }
}

async function unpublishExtraBroadcastAudioPublications(room: Room, keep?: LocalTrackPublication) {
    const extraPublications = getBroadcastAudioPublications(room).filter((pub) => pub !== keep);

    if (extraPublications.length === 0) return;

    clientLogger.warn(
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

function configureAudioAnalyser(analyser: AnalyserNode) {
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.68;
}

function getAudioInputDevices(devices: MediaDeviceInfo[]): AudioInputDevice[] {
    const seenDeviceIds = new Set<string>();

    return devices.flatMap((device) => {
        if (
            device.kind !== "audioinput" ||
            !device.deviceId ||
            device.deviceId === "default" ||
            seenDeviceIds.has(device.deviceId)
        ) {
            return [];
        }

        seenDeviceIds.add(device.deviceId);

        return [
            {
                deviceId: device.deviceId,
                groupId: device.groupId,
                label: device.label,
            },
        ];
    });
}

function getMicrophoneAudioConstraints(deviceId: string): boolean | MediaTrackConstraints {
    if (!deviceId) {
        return true;
    }

    return {
        deviceId: {
            exact: deviceId,
        },
    };
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
    const [audioInputDevices, setAudioInputDevices] = useState<AudioInputDevice[]>([]);
    const [isMicEnabled, setIsMicEnabled] = useState(false);
    const [isTabAudioEnabled, setIsTabAudioEnabled] = useState(false);
    const [micVolume, setMicVolume] = useState(100);
    const [selectedAudioInputDeviceId, setSelectedAudioInputDeviceId] = useState(
        DEFAULT_AUDIO_INPUT_DEVICE_ID,
    );
    const [tabVolume, setTabVolume] = useState(100);
    const audioContextRef = useRef<AudioContext | null>(null);
    const mixedAudioAnalyserNodeRef = useRef<AnalyserNode | null>(null);
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
    const microphoneGenerationRef = useRef(0);
    const selectedAudioInputDeviceIdRef = useRef(selectedAudioInputDeviceId);

    const refreshAudioInputDevices = useCallback(async () => {
        const mediaDevices = navigator.mediaDevices;
        if (typeof mediaDevices?.enumerateDevices !== "function") {
            return;
        }

        try {
            const devices = getAudioInputDevices(await mediaDevices.enumerateDevices());
            setAudioInputDevices(devices);
            setSelectedAudioInputDeviceId((currentDeviceId) =>
                currentDeviceId && !devices.some((device) => device.deviceId === currentDeviceId)
                    ? DEFAULT_AUDIO_INPUT_DEVICE_ID
                    : currentDeviceId,
            );
        } catch (err) {
            clientLogger.error("Failed to enumerate audio input devices:", err);
        }
    }, []);

    const disconnectCurrentMicrophoneInput = useCallback(() => {
        disconnectNode(micSourceNodeRef.current);
        micSourceNodeRef.current = null;
        disconnectNode(micGainNodeRef.current);
        micGainNodeRef.current = null;
        stopStream(micStreamRef.current);
        micStreamRef.current = null;
    }, []);

    useEffect(() => {
        isMicEnabledRef.current = isMicEnabled;
    }, [isMicEnabled]);

    useEffect(() => {
        selectedAudioInputDeviceIdRef.current = selectedAudioInputDeviceId;
    }, [selectedAudioInputDeviceId]);

    useEffect(() => {
        isTabAudioEnabledRef.current = isTabAudioEnabled;
    }, [isTabAudioEnabled]);

    useEffect(() => {
        const mediaDevices = navigator.mediaDevices;
        if (typeof mediaDevices?.enumerateDevices !== "function") {
            return;
        }

        const handleDeviceChange = () => {
            void refreshAudioInputDevices();
        };
        const refreshTimeoutId = window.setTimeout(() => {
            void refreshAudioInputDevices();
        }, 0);

        mediaDevices.addEventListener?.("devicechange", handleDeviceChange);

        return () => {
            window.clearTimeout(refreshTimeoutId);
            mediaDevices.removeEventListener?.("devicechange", handleDeviceChange);
        };
    }, [refreshAudioInputDevices]);

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

                const analyser = ctx.createAnalyser();
                configureAudioAnalyser(analyser);
                analyser.connect(dest);

                const mixedTrack = dest.stream.getAudioTracks()[0];
                if (!mixedTrack) {
                    throw new Error("Failed to create mixed audio track.");
                }
                localMixedTrack = mixedTrack;

                audioContextRef.current = ctx;
                mixedAudioAnalyserNodeRef.current = analyser;
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

                    clientLogger.info("Published mixed audio track:", pub.trackSid);
                }
            } catch (err) {
                clientLogger.error("Failed to initialize client audio mixer:", err);
            }
        }

        void initAudio();

        return () => {
            active = false;
            microphoneGenerationRef.current += 1;
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
            if (mixedAudioAnalyserNodeRef.current?.context === localAudioContext) {
                disconnectNode(mixedAudioAnalyserNodeRef.current);
                mixedAudioAnalyserNodeRef.current = null;
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

    const connectMicrophoneInput = async (deviceId: string) => {
        const ctx = audioContextRef.current;
        const dest = destinationNodeRef.current;
        if (!ctx || !dest) return;

        const generation = microphoneGenerationRef.current + 1;
        microphoneGenerationRef.current = generation;
        let stream: MediaStream | null = null;

        try {
            await ctx.resume();
            const getUserMedia = requireMediaCaptureMethod("getUserMedia", "Microphone capture");
            stream = await getUserMedia({
                audio: getMicrophoneAudioConstraints(deviceId),
            });

            if (microphoneGenerationRef.current !== generation) {
                stopStream(stream);
                return;
            }

            const source = ctx.createMediaStreamSource(stream);
            const gainNode = ctx.createGain();
            gainNode.gain.setValueAtTime(micVolume / 100, ctx.currentTime);
            source.connect(gainNode);
            gainNode.connect(mixedAudioAnalyserNodeRef.current ?? dest);

            disconnectCurrentMicrophoneInput();

            micStreamRef.current = stream;
            micSourceNodeRef.current = source;
            micGainNodeRef.current = gainNode;
            setIsMicEnabled(true);

            const handleTrackEnded = () => {
                if (micStreamRef.current !== stream) {
                    return;
                }

                disconnectCurrentMicrophoneInput();
                setIsMicEnabled(false);
            };

            stream.getAudioTracks().forEach((track) => {
                track.onended = handleTrackEnded;
            });

            void refreshAudioInputDevices();
        } catch (err) {
            stopStream(stream);
            throw err;
        }
    };

    useEffect(() => {
        const pub = publishedTrackPubRef.current;
        if (!pub) return;

        const hasActiveInput = isMicEnabled || isTabAudioEnabled;
        if (hasActiveInput) {
            pub.unmute()
                .then(() => clientLogger.info("[BroadcastControls] Unmuted broadcast-audio track"))
                .catch((err: unknown) => clientLogger.error("Failed to unmute track:", err));
        } else {
            pub.mute()
                .then(() => clientLogger.info("[BroadcastControls] Muted broadcast-audio track"))
                .catch((err: unknown) => clientLogger.error("Failed to mute track:", err));
        }
    }, [isMicEnabled, isTabAudioEnabled]);

    const toggleMicrophone = async () => {
        const ctx = audioContextRef.current;
        const dest = destinationNodeRef.current;
        if (!ctx || !dest) return;

        if (isMicEnabled) {
            microphoneGenerationRef.current += 1;
            disconnectCurrentMicrophoneInput();
            setIsMicEnabled(false);
            return;
        }

        try {
            await connectMicrophoneInput(selectedAudioInputDeviceIdRef.current);
        } catch (err) {
            clientLogger.error("Failed to access microphone:", err);
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
            gainNode.connect(mixedAudioAnalyserNodeRef.current ?? dest);

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
            clientLogger.error("Failed to capture tab audio:", err);
            if ((err as Error).name !== "NotAllowedError") {
                alert(tabAudioErrorMessage((err as Error).message));
            }
        }
    };

    const handleAudioInputDeviceChange = async (deviceId: string) => {
        const previousDeviceId = selectedAudioInputDeviceIdRef.current;
        selectedAudioInputDeviceIdRef.current = deviceId;
        setSelectedAudioInputDeviceId(deviceId);

        if (!isMicEnabledRef.current) {
            return;
        }

        try {
            await connectMicrophoneInput(deviceId);
        } catch (err) {
            selectedAudioInputDeviceIdRef.current = previousDeviceId;
            setSelectedAudioInputDeviceId(previousDeviceId);
            clientLogger.error("Failed to switch microphone input:", err);
            alert(micAccessErrorMessage((err as Error).message));
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
        audioInputDevices,
        handleMicVolumeChange,
        handleTabVolumeChange,
        mixedAudioAnalyserNodeRef,
        isAudioActive: isMicEnabled || isTabAudioEnabled,
        isMicEnabled,
        isTabAudioEnabled,
        micVolume,
        selectedAudioInputDeviceId,
        handleAudioInputDeviceChange,
        tabVolume,
        toggleMicrophone,
        toggleTabAudio,
    };
}
