export type AudioDeliverySample = {
    id: string;
    timestamp: number;
    jitter: number | null;
    jitterBufferDelay: number | null;
    jitterBufferEmittedCount: number | null;
    packetsReceived: number | null;
    packetsLost: number | null;
};
export type AudioDeliveryMetrics = {
    jitterBufferMs: number | null;
    networkJitterMs: number | null;
    packetLossPercent: number | null;
};
export const UNAVAILABLE_AUDIO_DELIVERY: AudioDeliveryMetrics = {
    jitterBufferMs: null,
    networkJitterMs: null,
    packetLossPercent: null,
};
function finite(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}
export function readAudioDeliverySample(value: unknown): AudioDeliverySample | null {
    if (!value || typeof value !== "object") return null;
    const stat = value as Record<string, unknown>;
    if (
        stat["type"] !== "inbound-rtp" ||
        (stat["kind"] ?? stat["mediaType"]) !== "audio" ||
        typeof stat["id"] !== "string" ||
        finite(stat["timestamp"]) === null
    )
        return null;
    return {
        id: stat["id"],
        timestamp: stat["timestamp"] as number,
        jitter: finite(stat["jitter"]),
        jitterBufferDelay: finite(stat["jitterBufferDelay"]),
        jitterBufferEmittedCount: finite(stat["jitterBufferEmittedCount"]),
        packetsReceived: finite(stat["packetsReceived"]),
        packetsLost: finite(stat["packetsLost"]),
    };
}
/** Delta of cumulative WebRTC counters, never a cross-device wall-clock subtraction. */
export function audioDeliveryMetrics(
    previous: AudioDeliverySample | null,
    next: AudioDeliverySample,
): AudioDeliveryMetrics {
    const metrics: AudioDeliveryMetrics = {
        ...UNAVAILABLE_AUDIO_DELIVERY,
        networkJitterMs: next.jitter === null ? null : Math.round(next.jitter * 1000),
    };
    if (!previous || previous.id !== next.id || next.timestamp <= previous.timestamp)
        return metrics;
    if (
        previous.jitterBufferDelay !== null &&
        next.jitterBufferDelay !== null &&
        previous.jitterBufferEmittedCount !== null &&
        next.jitterBufferEmittedCount !== null
    ) {
        const count = next.jitterBufferEmittedCount - previous.jitterBufferEmittedCount;
        const delay = next.jitterBufferDelay - previous.jitterBufferDelay;
        if (count > 0 && delay >= 0) metrics.jitterBufferMs = Math.round((delay / count) * 1000);
    }
    if (
        previous.packetsReceived !== null &&
        next.packetsReceived !== null &&
        previous.packetsLost !== null &&
        next.packetsLost !== null
    ) {
        const received = next.packetsReceived - previous.packetsReceived;
        const lost = Math.max(0, next.packetsLost - previous.packetsLost);
        if (received >= 0 && received + lost > 0)
            metrics.packetLossPercent = Math.round((lost / (received + lost)) * 1000) / 10;
    }
    return metrics;
}
