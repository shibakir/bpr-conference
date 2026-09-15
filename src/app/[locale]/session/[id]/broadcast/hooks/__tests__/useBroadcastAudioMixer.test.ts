// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import {
    type LocalTrackPublication,
    type Room,
    Track,
    type TrackPublishOptions,
} from "livekit-client";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AUDIO_TRANSMISSION_STORAGE_KEY } from "@/lib/audio-transmission-quality";

import { useBroadcastAudioMixer } from "../useBroadcastAudioMixer";

vi.mock("@/components/browser-capabilities/browser-capabilities-provider", () => ({
    useBrowserCapabilities: () => ({ canShareBrowserTabAudio: true, isSafariBrowser: false }),
    detectBrowserCapabilities: () => ({ canShareBrowserTabAudio: true, isSafariBrowser: false }),
}));
vi.mock("@/lib/client-logger", () => ({
    clientLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function mediaStream() {
    const track = { stop: vi.fn(), onended: null };
    const stream = {
        getAudioTracks: () => [track],
        getVideoTracks: () => [],
        getTracks: () => [track],
    } as unknown as MediaStream;
    return { stream, track };
}

class FakeAudioContext {
    currentTime = 0;
    resume = vi.fn().mockResolvedValue(undefined);
    close = vi.fn().mockResolvedValue(undefined);
    createMediaStreamDestination() {
        return { ...this.node(), stream: mediaStream().stream };
    }
    createMediaStreamSource() {
        return this.node();
    }
    createAnalyser() {
        return this.node();
    }
    createGain() {
        return { ...this.node(), gain: { setValueAtTime: vi.fn() } };
    }
    private node() {
        return { context: this, connect: vi.fn(), disconnect: vi.fn() };
    }
}

function fakeRoom() {
    const publications = new Map<string, LocalTrackPublication>();
    let sequence = 0;
    const publishTrack = vi.fn(async (track: MediaStreamTrack, options: TrackPublishOptions) => {
        const publication = {
            track,
            trackSid: `audio-${++sequence}`,
            trackName: options.name,
            kind: Track.Kind.Audio,
            isMuted: false,
            mute: vi.fn(async () => {
                publication.isMuted = true;
            }),
            unmute: vi.fn(async () => {
                publication.isMuted = false;
            }),
        };
        const result = publication as unknown as LocalTrackPublication;
        publications.set(publication.trackSid, result);
        return result;
    });
    const unpublishTrack = vi.fn(async (track: unknown, stop: boolean) => {
        for (const [sid, publication] of publications) {
            if (publication.track === track) {
                if (stop) publication.track?.stop();
                publications.delete(sid);
            }
        }
    });
    const room = {
        localParticipant: { publishTrack, unpublishTrack, trackPublications: publications },
    } as unknown as Room;
    return { room, publishTrack, unpublishTrack, publications };
}

const microphone = mediaStream();
const tab = mediaStream();
const getUserMedia = vi.fn<() => Promise<MediaStream>>();
const getDisplayMedia = vi.fn<() => Promise<MediaStream>>();

function setup() {
    const room = fakeRoom();
    const hook = renderHook(
        () =>
            useBroadcastAudioMixer({
                room: room.room,
                noTabAudioMessage: "No tab audio",
                safariTabAudioUnavailableMessage: "Not supported",
                tabAudioErrorMessage: (message) => message,
                micAccessErrorMessage: (message) => message,
            }),
        { wrapper: StrictMode },
    );
    return { ...room, ...hook };
}

beforeEach(() => {
    // Node 25 exposes its own localStorage; this test needs the browser storage from jsdom.
    const browserWindow = (globalThis as unknown as { jsdom: { window: Window } }).jsdom.window;
    vi.stubGlobal("localStorage", browserWindow.localStorage);
    window.localStorage.clear();
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("alert", vi.fn());
    getUserMedia.mockReset().mockResolvedValue(microphone.stream);
    getDisplayMedia.mockReset().mockResolvedValue(tab.stream);
    vi.stubGlobal("navigator", {
        mediaDevices: {
            getUserMedia,
            getDisplayMedia,
            enumerateDevices: vi.fn().mockResolvedValue([]),
        },
    });
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe("audio transmission quality", () => {
    it.each([null, "invalid", "128000"])("defaults to 48 kbps for storage %s", async (stored) => {
        if (stored !== null) window.localStorage.setItem(AUDIO_TRANSMISSION_STORAGE_KEY, stored);
        const { result, publishTrack, publications } = setup();
        await waitFor(() => expect(result.current.isAudioReady).toBe(true));
        expect(publishTrack).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
            name: "broadcast-audio",
            source: Track.Source.Microphone,
            audioPreset: { maxBitrate: 48_000 },
        });
        expect(publications.size).toBe(1);
        expect([...publications.values()][0]?.isMuted).toBe(true);
    });

    it.each([32_000, 48_000, 96_000])(
        "restores %i bps before the first publication",
        async (bitrate) => {
            window.localStorage.setItem(AUDIO_TRANSMISSION_STORAGE_KEY, String(bitrate));
            const { result, publishTrack } = setup();
            await waitFor(() => expect(result.current.isAudioReady).toBe(true));
            expect(publishTrack).toHaveBeenCalledTimes(1);
            expect(publishTrack.mock.calls[0]?.[1].audioPreset?.maxBitrate).toBe(bitrate);
        },
    );

    it("republishes only while sources are off and persists quality for the next visit", async () => {
        const { result, publishTrack, publications, unmount } = setup();
        await waitFor(() => expect(result.current.isAudioReady).toBe(true));
        act(() => result.current.handleAudioBitrateChange(96_000));
        await waitFor(() => expect(result.current.isAudioReady).toBe(true));
        expect(publishTrack.mock.calls.at(-1)?.[1].audioPreset?.maxBitrate).toBe(96_000);
        expect(publications.size).toBe(1);

        await act(() => result.current.toggleMicrophone());
        expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
        act(() => result.current.handleAudioBitrateChange(32_000));
        expect(result.current.audioBitrate).toBe(96_000);
        expect(publishTrack).toHaveBeenCalledTimes(2);

        await act(() => result.current.toggleMicrophone());
        act(() => result.current.handleAudioBitrateChange(32_000));
        await waitFor(() => expect(result.current.isAudioReady).toBe(true));
        expect(publishTrack.mock.calls.at(-1)?.[1].audioPreset?.maxBitrate).toBe(32_000);
        expect(publications.size).toBe(1);
        unmount();

        const next = setup();
        await waitFor(() => expect(next.result.current.isAudioReady).toBe(true));
        expect(next.publishTrack.mock.calls[0]?.[1].audioPreset?.maxBitrate).toBe(32_000);
    });

    it("keeps quality locked until both microphone and tab audio are off", async () => {
        const { result, publishTrack } = setup();
        await waitFor(() => expect(result.current.isAudioReady).toBe(true));
        await act(() => result.current.toggleMicrophone());
        await act(() => result.current.toggleTabAudio());
        await act(() => result.current.toggleMicrophone());
        act(() => result.current.handleAudioBitrateChange(96_000));
        expect(result.current.audioBitrate).toBe(48_000);
        expect(publishTrack).toHaveBeenCalledTimes(1);
        await act(() => result.current.toggleTabAudio());
        act(() => result.current.handleAudioBitrateChange(96_000));
        await waitFor(() => expect(result.current.isAudioReady).toBe(true));
        expect(publishTrack.mock.calls.at(-1)?.[1].audioPreset?.maxBitrate).toBe(96_000);
    });

    it.each(["microphone", "tab"])(
        "blocks quality changes while awaiting %s permission",
        async (source) => {
            let resolveCapture!: (stream: MediaStream) => void;
            const pending = new Promise<MediaStream>((resolve) => {
                resolveCapture = resolve;
            });
            if (source === "microphone") getUserMedia.mockReturnValueOnce(pending);
            else getDisplayMedia.mockReturnValueOnce(pending);
            const { result, publishTrack } = setup();
            await waitFor(() => expect(result.current.isAudioReady).toBe(true));
            let start!: Promise<void>;
            act(() => {
                start =
                    source === "microphone"
                        ? result.current.toggleMicrophone()
                        : result.current.toggleTabAudio();
            });
            expect(result.current.isStartingAudio).toBe(true);
            act(() => result.current.handleAudioBitrateChange(96_000));
            expect(result.current.audioBitrate).toBe(48_000);
            await act(async () => {
                resolveCapture(mediaStream().stream);
                await start;
            });
            expect(result.current.isStartingAudio).toBe(false);
            expect(result.current.isAudioActive).toBe(true);
            expect(publishTrack).toHaveBeenCalledTimes(1);
        },
    );

    it("still applies quality when browser storage is blocked", async () => {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("Blocked");
        });
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("Blocked");
        });
        const { result, publishTrack } = setup();
        await waitFor(() => expect(result.current.isAudioReady).toBe(true));
        expect(result.current.audioBitrate).toBe(48_000);
        act(() => result.current.handleAudioBitrateChange(96_000));
        await waitFor(() => expect(result.current.isAudioReady).toBe(true));
        expect(publishTrack.mock.calls.at(-1)?.[1].audioPreset?.maxBitrate).toBe(96_000);
    });

    it("does not remove the latest publication when an older quality change finishes late", async () => {
        let finishMute!: () => void;
        const pendingMute = new Promise<void>((resolve) => {
            finishMute = resolve;
        });
        const { result, publishTrack, publications } = setup();
        const publish = publishTrack.getMockImplementation()!;
        publishTrack.mockImplementationOnce(async (...args) => {
            const publication = await publish(...args);
            const mute = vi.mocked(publication.mute).getMockImplementation()!;
            vi.mocked(publication.mute).mockImplementation(async () => {
                await pendingMute;
                return mute();
            });
            return publication;
        });
        await waitFor(() => expect(publishTrack).toHaveBeenCalledTimes(1));
        expect(result.current.isAudioReady).toBe(false);

        act(() => result.current.handleAudioBitrateChange(96_000));
        await waitFor(() => expect(result.current.isAudioReady).toBe(true));
        const latestPublication = [...publications.keys()];
        expect(latestPublication).toHaveLength(1);

        await act(async () => {
            finishMute();
        });
        expect([...publications.keys()]).toEqual(latestPublication);
        expect(result.current.audioBitrate).toBe(96_000);
    });
});
