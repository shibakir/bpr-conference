// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { type Room, RoomEvent } from "livekit-client";
import { SWRConfig } from "swr";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchValidatedJson } from "@/lib/api-client";

import { useTranslatedTranscripts } from "./useTranslatedTranscripts";

class EventEmitter {
    private listeners = new Map<string, Set<(...args: unknown[]) => void>>();
    on(event: string, listener: (...args: unknown[]) => void) {
        const callbacks = this.listeners.get(event) ?? new Set();
        callbacks.add(listener);
        this.listeners.set(event, callbacks);
    }
    off(event: string, listener: (...args: unknown[]) => void) {
        this.listeners.get(event)?.delete(listener);
    }
    emit(event: string, ...args: unknown[]) {
        this.listeners.get(event)?.forEach((listener) => listener(...args));
    }
}

vi.mock("@/lib/api-client", () => ({ fetchValidatedJson: vi.fn() }));
afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

function View({ room, languages }: { room: Room; languages: string[] }) {
    const { transcriptsByLanguage } = useTranslatedTranscripts({
        room,
        sessionId: "room",
        enabled: true,
        languages,
    });
    return <output data-testid="captions">{JSON.stringify(transcriptsByLanguage)}</output>;
}
function send(room: EventEmitter, topic: string, identity: string, value: unknown) {
    room.emit(
        RoomEvent.DataReceived,
        new TextEncoder().encode(JSON.stringify(value)),
        { identity },
        undefined,
        topic,
    );
}
const caption = {
    type: "transcription",
    language: "cs",
    segmentId: "old",
    text: "Old text",
    final: true,
    timestamp: 1,
};
describe("listener reset delivery", () => {
    it("ignores forged events and clears cached hidden captions for every mounted listener", async () => {
        vi.mocked(fetchValidatedJson).mockResolvedValue({ translations: [], controls: {} });
        const room = new EventEmitter();
        const cache = new Map();
        function views(languages: string[]) {
            return (
                <SWRConfig value={{ provider: () => cache }}>
                    <View room={room as unknown as Room} languages={languages} />
                    <View room={room as unknown as Room} languages={languages} />
                </SWRConfig>
            );
        }
        const { rerender } = render(views(["cs"]));
        await waitFor(() => expect(fetchValidatedJson).toHaveBeenCalled());
        act(() => send(room, "transcription", "translator-cs", caption));
        expect(
            screen.getAllByTestId("captions").every((el) => el.textContent?.includes("Old text")),
        ).toBe(true);
        rerender(views(["de"]));
        const control = {
            type: "translation-control",
            language: "cs",
            control: { historyRevision: 1 },
        };
        act(() => send(room, "translation-control", "attendee", control));
        expect(
            screen.getAllByTestId("captions").every((el) => el.textContent?.includes("Old text")),
        ).toBe(true);
        await act(async () => send(room, "translation-control", "translator-cs", control));
        expect(screen.getAllByTestId("captions").every((el) => el.textContent === "{}")).toBe(true);
        rerender(views(["cs"]));
        act(() => send(room, "transcription", "translator-cs", caption));
        expect(screen.getAllByTestId("captions").every((el) => el.textContent === "{}")).toBe(true);
    });
    it("recovers a missed reset on reconnect through the status API", async () => {
        vi.mocked(fetchValidatedJson).mockResolvedValue({ translations: [], controls: {} });
        const room = new EventEmitter();
        render(
            <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
                <View room={room as unknown as Room} languages={["cs"]} />
            </SWRConfig>,
        );
        await waitFor(() => expect(fetchValidatedJson).toHaveBeenCalled());
        act(() => send(room, "transcription", "translator-cs", caption));
        vi.mocked(fetchValidatedJson).mockResolvedValue({
            translations: [],
            controls: { cs: { historyRevision: 1 } },
        });
        await act(async () => {
            room.emit(RoomEvent.Reconnected);
        });
        await waitFor(() => expect(screen.getByTestId("captions").textContent).toBe("{}"));
    });
});
