import { describe, expect, it } from "vitest";

import {
    type CaptionMessage,
    clearCaptions,
    EMPTY_TRANSCRIPTS,
    parseCaptionMessage,
    receiveCaption,
} from "../transcript-state";

function message(overrides: Partial<CaptionMessage> = {}): CaptionMessage {
    return {
        type: "transcription",
        language: "cs",
        segmentId: "stream-1",
        text: "Ahoj",
        final: false,
        timestamp: 1,
        protocolVersion: 2,
        updateType: "replace",
        snapshotText: "Ahoj",
        streamId: "stream",
        streamEpoch: 1,
        streamGeneration: 0,
        sequence: 1,
        revision: 1,
        segmentOrder: 1,
        ...overrides,
    };
}

describe("shared caption state", () => {
    it("replaces snapshots, ignores repeats and never regresses a final segment", () => {
        let state = receiveCaption(EMPTY_TRANSCRIPTS, message());
        state = receiveCaption(
            state,
            message({
                text: " světe",
                snapshotText: "Ahoj světe",
                revision: 3,
                sequence: 3,
                final: true,
            }),
        );
        const final = state;
        state = receiveCaption(state, message({ revision: 2, sequence: 2 }));
        state = receiveCaption(state, message({ revision: 4, sequence: 4 }));
        expect(state).toBe(final);
        expect(state.entries["cs"]).toHaveLength(1);
        expect(state.entries["cs"]![0]!.text).toBe("Ahoj světe");
    });
    it("handles final arriving first and restores original segment order", () => {
        let state = receiveCaption(
            EMPTY_TRANSCRIPTS,
            message({
                segmentId: "stream-2",
                segmentOrder: 2,
                sequence: 3,
                revision: 2,
                final: true,
                snapshotText: "Druhá",
            }),
        );
        state = receiveCaption(state, message());
        expect(state.entries["cs"]!.map((entry) => entry.id)).toEqual(["stream-1", "stream-2"]);
    });
    it("rejects a retired stream while preserving history after a fresh connection", () => {
        let state = receiveCaption(EMPTY_TRANSCRIPTS, message());
        state = receiveCaption(
            state,
            message({ streamId: "fresh", streamGeneration: 1, segmentId: "fresh-1", sequence: 2 }),
        );
        expect(state.entries["cs"]![0]!.final).toBe(true);
        expect(receiveCaption(state, message({ revision: 99, sequence: 99 }))).toBe(state);
        state = receiveCaption(
            state,
            message({ streamEpoch: 2, streamId: "new-bridge", segmentId: "new-bridge-1" }),
        );
        expect(state.entries["cs"]).toHaveLength(3);
    });
    it("bounds history and prevents late packets from reviving evicted text", () => {
        let state = EMPTY_TRANSCRIPTS;
        for (let i = 1; i <= 200; i++)
            state = receiveCaption(
                state,
                message({ segmentId: `stream-${i}`, segmentOrder: i, sequence: i }),
            );
        expect(state.entries["cs"]).toHaveLength(50);
        expect(receiveCaption(state, message({ revision: 99, sequence: 500 }))).toBe(state);
    });
    it("clear retains deduplication and does not affect other languages", () => {
        let state = receiveCaption(EMPTY_TRANSCRIPTS, message());
        state = receiveCaption(state, message({ language: "de" }));
        state = clearCaptions(state, "cs");
        expect(receiveCaption(state, message())).toBe(state);
        expect(state.entries["de"]).toHaveLength(1);
    });
    it("accepts legacy deltas until a versioned stream is observed", () => {
        const legacy: CaptionMessage = {
            type: "transcription",
            language: "cs",
            segmentId: "legacy",
            text: "A",
            timestamp: 1,
            final: false,
        };
        let state = receiveCaption(EMPTY_TRANSCRIPTS, legacy);
        state = receiveCaption(state, { ...legacy, text: "B", final: true });
        expect(state.entries["cs"]![0]!.text).toBe("AB");
        state = receiveCaption(state, message());
        expect(receiveCaption(state, legacy)).toBe(state);
    });
    it("rejects invalid protocol, revisions and non-finite timestamps", () => {
        expect(parseCaptionMessage(message())).toEqual(message());
        expect(parseCaptionMessage({ ...message(), revision: -1 })).toBeNull();
        expect(parseCaptionMessage({ ...message(), protocolVersion: 3 })).toBeNull();
        expect(parseCaptionMessage({ ...message(), timestamp: NaN })).toBeNull();
    });
});
