"use client";

import type { RemoteAudioTrack } from "livekit-client";
import { useEffect, useState } from "react";

import {
    type AudioDeliveryMetrics,
    audioDeliveryMetrics,
    type AudioDeliverySample,
    readAudioDeliverySample,
    UNAVAILABLE_AUDIO_DELIVERY,
} from "@/lib/audio-delivery-stats";

export function useAudioDeliveryStats(track: RemoteAudioTrack | undefined): AudioDeliveryMetrics {
    const [result, setResult] = useState<{
        track: RemoteAudioTrack;
        metrics: AudioDeliveryMetrics;
    } | null>(null);
    useEffect(() => {
        if (!track) return;
        let cancelled = false;
        let busy = false;
        let previous: AudioDeliverySample | null = null;
        const sample = async () => {
            if (busy || cancelled) return;
            busy = true;
            try {
                const report = await track.getRTCStatsReport();
                if (cancelled) return;
                let current: AudioDeliverySample | null = null;
                report?.forEach((value: unknown) => {
                    current = readAudioDeliverySample(value) ?? current;
                });
                setResult({
                    track,
                    metrics: current
                        ? audioDeliveryMetrics(previous, current)
                        : UNAVAILABLE_AUDIO_DELIVERY,
                });
                previous = current;
            } catch {
                previous = null;
                if (!cancelled) setResult({ track, metrics: UNAVAILABLE_AUDIO_DELIVERY });
            } finally {
                busy = false;
            }
        };
        void sample();
        const timer = setInterval(() => void sample(), 2000);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [track]);
    return track && result?.track === track ? result.metrics : UNAVAILABLE_AUDIO_DELIVERY;
}
