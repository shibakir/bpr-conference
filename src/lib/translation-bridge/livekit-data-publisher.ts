import type { Room } from "@livekit/rtc-node";

import { createLogger } from "../logger";

export type TranslationDataPublisherOptions = {
  targetLanguage: string;
  organizerIdentity: string;
};

function parseCaptionLanguages(value: unknown): string[] {
  if (typeof value !== "string") return [];

  return value
    .split(",")
    .map((language) => language.trim())
    .filter(Boolean);
}

function participantWantsTranscription(
  participantAttributes: Record<string, string> | undefined,
  targetLanguage: string
) {
  return (
    participantAttributes?.["language"] === targetLanguage ||
    parseCaptionLanguages(participantAttributes?.["captionLanguages"]).includes(
      targetLanguage
    )
  );
}

/** Publishes translated text and organizer diagnostics through LiveKit data channels. */
export class TranslationDataPublisher {
  private readonly log;
  private readonly options: TranslationDataPublisherOptions;

  constructor(options: TranslationDataPublisherOptions) {
    this.options = options;
    this.log = createLogger({
      component: "translation-data-publisher",
      targetLanguage: options.targetLanguage,
    });
  }

  async publishTranscription(
    room: Room | null,
    text: string,
    interim: boolean,
    segmentId: number
  ): Promise<void> {
    if (!room?.localParticipant) return;

    try {
      const destinationIdentities = Array.from(room.remoteParticipants.values())
        .filter((participant) =>
          participantWantsTranscription(
            participant.attributes,
            this.options.targetLanguage
          )
        )
        .map((participant) => participant.identity);

      const payload = JSON.stringify({
        type: "transcription",
        language: this.options.targetLanguage,
        segmentId: `${this.options.targetLanguage}-${segmentId}`,
        text,
        final: !interim,
        timestamp: Date.now(),
      });

      await room.localParticipant.publishData(new TextEncoder().encode(payload), {
        reliable: true,
        topic: "transcription",
        ...(destinationIdentities.length > 0
          ? { destination_identities: destinationIdentities }
          : {}),
      });
    } catch (error) {
      this.log.error({ err: error }, "Error publishing transcription");
    }
  }

  async publishInputDiagnostic(
    room: Room | null,
    text: string,
    interim: boolean,
    segmentId: number
  ): Promise<void> {
    if (!room?.localParticipant) return;

    try {
      const destinationIdentities = Array.from(room.remoteParticipants.values())
        .filter(
          (participant) => participant.identity === this.options.organizerIdentity
        )
        .map((participant) => participant.identity);

      if (destinationIdentities.length === 0) return;

      const payload = JSON.stringify({
        type: "input-diagnostic",
        targetLanguage: this.options.targetLanguage,
        segmentId: `${this.options.targetLanguage}-input-${segmentId}`,
        text,
        final: !interim,
        timestamp: Date.now(),
      });

      await room.localParticipant.publishData(new TextEncoder().encode(payload), {
        reliable: !interim,
        topic: "translation-diagnostics",
        destination_identities: destinationIdentities,
      });
    } catch (error) {
      this.log.error({ err: error }, "Error publishing input diagnostic");
    }
  }
}
