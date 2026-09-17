/** Shared by the page and floating captions. Timing is deliberately independent of audio. */
export type CaptionMessage = {
    type: "transcription";
    language: string;
    segmentId: string;
    text: string;
    final: boolean;
    timestamp: number;
    historyRevision?: number;
} & (
    | { protocolVersion?: undefined }
    | {
          protocolVersion: 2;
          updateType: "replace";
          snapshotText: string;
          streamId: string;
          streamEpoch: number;
          streamGeneration: number;
          sequence: number;
          revision: number;
          segmentOrder: number;
      }
);

export type CaptionEntry = {
    id: string;
    language: string;
    text: string;
    final: boolean;
    timestamp: number;
    streamId?: string;
    revision?: number;
    segmentOrder?: number;
};
type Cursor = {
    id: string;
    epoch: number;
    generation: number;
    sequence: number;
    clearBeforeSequence: number;
    oldestOrder: number;
};
export type TranscriptState = {
    entries: Record<string, CaptionEntry[]>;
    streams: Record<string, Cursor>;
    historyRevisions: Record<string, number>;
};
export const EMPTY_TRANSCRIPTS: TranscriptState = {
    entries: {},
    streams: {},
    historyRevisions: {},
};
const HISTORY_LIMIT = 50;

export function parseCaptionMessage(value: unknown): CaptionMessage | null {
    if (!value || typeof value !== "object") return null;
    const m = value as Record<string, unknown>;
    if (
        m["type"] !== "transcription" ||
        typeof m["language"] !== "string" ||
        typeof m["segmentId"] !== "string" ||
        typeof m["text"] !== "string" ||
        typeof m["final"] !== "boolean" ||
        typeof m["timestamp"] !== "number" ||
        !Number.isFinite(m["timestamp"])
    )
        return null;
    if (
        m["historyRevision"] !== undefined &&
        (typeof m["historyRevision"] !== "number" ||
            !Number.isSafeInteger(m["historyRevision"]) ||
            m["historyRevision"] < 0)
    )
        return null;
    if (m["protocolVersion"] === undefined) return value as CaptionMessage;
    if (
        m["protocolVersion"] !== 2 ||
        m["updateType"] !== "replace" ||
        typeof m["snapshotText"] !== "string" ||
        typeof m["streamId"] !== "string" ||
        !["streamEpoch", "streamGeneration", "sequence", "revision", "segmentOrder"].every(
            (key) => typeof m[key] === "number" && Number.isSafeInteger(m[key]) && m[key] >= 0,
        )
    )
        return null;
    return value as CaptionMessage;
}

export function receiveCaption(state: TranscriptState, message: CaptionMessage): TranscriptState {
    const language = message.language;
    const revision = message.historyRevision ?? 0;
    if (revision < (state.historyRevisions[language] ?? 0)) return state;
    state = applyHistoryReset(state, language, revision);
    let entries = state.entries[language] ?? [];
    const current = state.streams[language];
    let stream = current;
    const modern = message.protocolVersion === 2;
    if (!modern && current) return state; // Never mix old deltas into a versioned stream.
    if (modern) {
        const newer =
            !current ||
            message.streamEpoch > current.epoch ||
            (message.streamEpoch === current.epoch &&
                message.streamGeneration > current.generation);
        if (newer) {
            entries = entries.map((entry) => (entry.final ? entry : { ...entry, final: true }));
            stream = {
                id: message.streamId,
                epoch: message.streamEpoch,
                generation: message.streamGeneration,
                sequence: 0,
                clearBeforeSequence: 0,
                oldestOrder: 0,
            };
        } else if (
            message.streamEpoch !== current.epoch ||
            message.streamGeneration !== current.generation ||
            message.streamId !== current.id
        )
            return state;
        if (
            !stream ||
            message.sequence <= stream.clearBeforeSequence ||
            message.segmentOrder < stream.oldestOrder
        )
            return state;
    }
    const index = entries.findIndex((entry) => entry.id === message.segmentId);
    const previous = entries[index];
    if (
        modern &&
        previous &&
        ((previous.revision ?? 0) >= message.revision || (previous.final && !message.final))
    )
        return state;
    const entry: CaptionEntry = {
        id: message.segmentId,
        language,
        text: modern ? message.snapshotText : (previous?.text ?? "") + message.text,
        final: message.final || previous?.final === true,
        timestamp: previous?.timestamp ?? message.timestamp,
        ...(modern
            ? {
                  streamId: message.streamId,
                  revision: message.revision,
                  segmentOrder: message.segmentOrder,
              }
            : {}),
    };
    entries = [...entries];
    if (index >= 0) entries[index] = entry;
    else if (modern) {
        // Arrival order is not text order. Insert delayed segments at their original place.
        const next = entries.findIndex(
            (item) =>
                item.streamId === message.streamId &&
                (item.segmentOrder ?? 0) > message.segmentOrder,
        );
        if (next >= 0) entries.splice(next, 0, entry);
        else entries.push(entry);
    } else entries.push(entry);
    const evicted = entries.slice(0, Math.max(0, entries.length - HISTORY_LIMIT));
    entries = entries.slice(-HISTORY_LIMIT);
    if (modern && stream) {
        const oldest = Math.max(
            stream.oldestOrder,
            ...evicted
                .filter((item) => item.streamId === message.streamId)
                .map((item) => (item.segmentOrder ?? 0) + 1),
        );
        stream = {
            ...stream,
            sequence: Math.max(stream.sequence, message.sequence),
            oldestOrder: Math.max(stream.oldestOrder, oldest),
        };
    }
    return {
        historyRevisions: state.historyRevisions,
        entries: { ...state.entries, [language]: entries },
        streams: stream ? { ...state.streams, [language]: stream } : state.streams,
    };
}

export function clearCaptions(state: TranscriptState, language?: string): TranscriptState {
    const entries = { ...state.entries };
    const streams = { ...state.streams };
    for (const code of language ? [language] : Object.keys(entries)) {
        delete entries[code];
        const stream = streams[code];
        if (stream) streams[code] = { ...stream, clearBeforeSequence: stream.sequence };
    }
    return { ...state, entries, streams };
}

export function applyHistoryReset(
    state: TranscriptState,
    language: string,
    revision: number,
): TranscriptState {
    if (revision <= (state.historyRevisions[language] ?? 0)) return state;
    const entries = { ...state.entries };
    const streams = { ...state.streams };
    delete entries[language];
    delete streams[language];
    return {
        entries,
        streams,
        historyRevisions: { ...state.historyRevisions, [language]: revision },
    };
}
