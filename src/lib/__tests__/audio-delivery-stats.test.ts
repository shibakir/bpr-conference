import { describe, expect, it } from "vitest";

import {
    audioDeliveryMetrics,
    type AudioDeliverySample,
    readAudioDeliverySample,
} from "../audio-delivery-stats";

const baseline: AudioDeliverySample = {
    id: "audio-1",
    timestamp: 1000,
    jitter: 0.01,
    jitterBufferDelay: 1,
    jitterBufferEmittedCount: 100,
    packetsReceived: 100,
    packetsLost: 0,
};
describe("listener audio measurements", () => {
    it("uses differences of WebRTC counters for the current sampling interval", () => {
        expect(
            audioDeliveryMetrics(baseline, {
                ...baseline,
                timestamp: 3000,
                jitterBufferDelay: 3,
                jitterBufferEmittedCount: 200,
                packetsReceived: 198,
                packetsLost: 2,
            }),
        ).toEqual({ jitterBufferMs: 20, networkJitterMs: 10, packetLossPercent: 2 });
    });
    it("does not report zero for missing counters, a new stream or a reset", () => {
        expect(audioDeliveryMetrics(null, baseline).jitterBufferMs).toBeNull();
        expect(
            audioDeliveryMetrics(baseline, { ...baseline, id: "audio-2" }).packetLossPercent,
        ).toBeNull();
        expect(
            audioDeliveryMetrics(baseline, {
                ...baseline,
                timestamp: 3000,
                jitterBufferEmittedCount: 0,
                jitterBufferDelay: 0,
            }).jitterBufferMs,
        ).toBeNull();
        expect(readAudioDeliverySample({ type: "inbound-rtp", kind: "video" })).toBeNull();
    });
});
