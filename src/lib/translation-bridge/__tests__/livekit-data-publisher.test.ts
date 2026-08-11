import { describe, expect, it, vi } from "vitest";
import type { Room } from "@livekit/rtc-node";
import { TranslationDataPublisher } from "../livekit-data-publisher";

function createRoom(participants: Array<{ identity: string; language?: string }>) {
  const publishData = vi.fn().mockResolvedValue(undefined);
  const room = {
    localParticipant: { publishData },
    remoteParticipants: new Map(
      participants.map((participant) => [
        participant.identity,
        {
          identity: participant.identity,
          attributes: participant.language
            ? { language: participant.language }
            : {},
        },
      ])
    ),
  } as unknown as Room;

  return { room, publishData };
}

describe("TranslationDataPublisher", () => {
  it("sends a final transcription only to listeners of the target language", async () => {
    const { room, publishData } = createRoom([
      { identity: "listener-cs", language: "cs" },
      { identity: "listener-en", language: "en" },
    ]);
    const publisher = new TranslationDataPublisher({
      targetLanguage: "cs",
      organizerIdentity: "organizer-host",
    });

    await publisher.publishTranscription(room, "Ahoj", false, 4);

    const [encodedPayload, options] = publishData.mock.calls[0];
    expect(JSON.parse(new TextDecoder().decode(encodedPayload))).toMatchObject({
      type: "transcription",
      language: "cs",
      segmentId: "cs-4",
      text: "Ahoj",
      final: true,
    });
    expect(options).toEqual({
      reliable: true,
      topic: "transcription",
      destination_identities: ["listener-cs"],
    });
  });

  it("sends interim transcription reliably because Gemini may not emit final markers", async () => {
    const { room, publishData } = createRoom([
      { identity: "listener-cs", language: "cs" },
    ]);
    const publisher = new TranslationDataPublisher({
      targetLanguage: "cs",
      organizerIdentity: "organizer-host",
    });

    await publisher.publishTranscription(room, " průběžný text", true, 4);

    const [encodedPayload, options] = publishData.mock.calls[0];
    expect(JSON.parse(new TextDecoder().decode(encodedPayload))).toMatchObject({
      type: "transcription",
      language: "cs",
      segmentId: "cs-4",
      text: " průběžný text",
      final: false,
    });
    expect(options).toEqual({
      reliable: true,
      topic: "transcription",
      destination_identities: ["listener-cs"],
    });
  });

  it("broadcasts transcription when listener language attributes have not synced yet", async () => {
    const { room, publishData } = createRoom([
      { identity: "listener-pending" },
    ]);
    const publisher = new TranslationDataPublisher({
      targetLanguage: "cs",
      organizerIdentity: "organizer-host",
    });

    await publisher.publishTranscription(room, "Ahoj", true, 4);

    const [, options] = publishData.mock.calls[0];
    expect(options).toEqual({
      reliable: true,
      topic: "transcription",
    });
  });

  it("sends input diagnostics only to the organizer as lossy interim data", async () => {
    const { room, publishData } = createRoom([
      { identity: "organizer-host" },
      { identity: "listener-cs", language: "cs" },
    ]);
    const publisher = new TranslationDataPublisher({
      targetLanguage: "cs",
      organizerIdentity: "organizer-host",
    });

    await publisher.publishInputDiagnostic(room, "Dobrý den", true, 2);

    const [encodedPayload, options] = publishData.mock.calls[0];
    expect(JSON.parse(new TextDecoder().decode(encodedPayload))).toMatchObject({
      type: "input-diagnostic",
      targetLanguage: "cs",
      segmentId: "cs-input-2",
      text: "Dobrý den",
      final: false,
    });
    expect(options).toEqual({
      reliable: false,
      topic: "translation-diagnostics",
      destination_identities: ["organizer-host"],
    });
  });
});
