import type { Room } from "@livekit/rtc-node";

export type TranslationDataPublisherOptions = {
  targetLanguage: string;
  organizerIdentity: string;
};

/** Publishes translated text and organizer diagnostics through LiveKit data channels. */
export class TranslationDataPublisher {
  constructor(private readonly options: TranslationDataPublisherOptions) {}

  async publishTranscription(
    room: Room | null,
    text: string,
    interim: boolean,
    segmentId: number
  ): Promise<void> {
    if (!room?.localParticipant) return;

    try {
      const destinationIdentities = Array.from(room.remoteParticipants.values())
        .filter((participant) => participant.attributes?.language === this.options.targetLanguage)
        .map((participant) => participant.identity);

      if (destinationIdentities.length === 0) return;

      const payload = JSON.stringify({
        type: "transcription",
        language: this.options.targetLanguage,
        segmentId: `${this.options.targetLanguage}-${segmentId}`,
        text,
        final: !interim,
        timestamp: Date.now(),
      });

      await room.localParticipant.publishData(new TextEncoder().encode(payload), {
        reliable: !interim,
        topic: "transcription",
        destination_identities: destinationIdentities,
      });
    } catch (error) {
      console.error(
        `[TranslationBridge:${this.options.targetLanguage}] Error publishing transcription:`,
        error
      );
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
      console.error(
        `[TranslationBridge:${this.options.targetLanguage}] Error publishing input diagnostic:`,
        error
      );
    }
  }
}
