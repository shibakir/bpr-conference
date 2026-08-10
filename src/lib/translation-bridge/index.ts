/**
 * TranslationBridge: Connects a LiveKit room to a Gemini Live API WebSocket
 * for real-time audio translation.
 *
 * Each bridge instance:
 * 1. Joins the LiveKit room as a bot participant (e.g., "translator-es")
 * 2. Subscribes to the organizer's audio track
 * 3. Pipes PCM audio frames to Gemini Live API via WebSocket
 * 4. Receives translated audio back and publishes it as a new track
 */

import {
  Room,
  RoomEvent,
  LocalAudioTrack,
  AudioSource,
  TrackPublishOptions,
  TrackSource,
  RemoteTrackPublication,
  RemoteParticipant,
  RemoteAudioTrack,
  TrackKind,
  AudioStream,
  type AudioFrame,
} from "@livekit/rtc-node";
import {
  GeminiLiveConnection,
  type GeminiServerMessage,
} from "./gemini-live-connection";
import { TranslationLatencyMetrics } from "./latency-metrics";
import { TranslationDataPublisher } from "./livekit-data-publisher";
import { TranslatedAudioOutput } from "./translated-audio-output";

export type BridgeStatus = "starting" | "active" | "error" | "closed";

export class TranslationBridge {
  private room: Room | null = null;
  private localTrack: LocalAudioTrack | null = null;
  private publishedTrackSid: string = "";
  private transcriptionSegmentId: number = 0;
  private inputDiagnosticSegmentId: number = 0;
  private framesSentToGemini: number = 0;
  private framesReceivedFromGemini: number = 0;
  private pendingInterimText: string = "";
  private pendingInputDiagnosticText: string = "";
  private interimTimeout: NodeJS.Timeout | null = null;
  private inputDiagnosticTimeout: NodeJS.Timeout | null = null;

  public readonly targetLanguage: string;
  public readonly sessionId: string;
  public readonly identity: string;
  public status: BridgeStatus = "starting";
  public subscriberCount: number = 0;
  public onStop?: () => void;

  // Gemini Live API config
  private readonly geminiApiKey: string;
  private readonly geminiModel: string = "gemini-3.5-live-translate-preview";
  private readonly sampleRate: number = 24000; // Gemini outputs 24kHz
  // AudioStream resamples the 48kHz LiveKit track before it is sent to Gemini.
  private readonly inputSampleRate: number = 16000;
  private readonly channels: number = 1;
  private readonly contextCompressionTriggerTokens: number = 25000;
  private readonly contextCompressionTargetTokens: number = 8000;
  private readonly outputAudioSourceQueueMs: number = 300;
  private readonly maxOutputBacklogMs: number = 1000;
  private readonly targetOutputBacklogMs: number = 500;
  private readonly outputBacklogLogIntervalMs: number = 5000;
  private readonly outputBacklogInfoThresholdMs: number = 500;
  private readonly latencyLogIntervalMs: number = 5000;
  private readonly geminiOutputIdleThresholdMs: number = 750;

  // LiveKit config
  private readonly livekitUrl: string;
  private readonly livekitApiKey: string;
  private readonly livekitApiSecret: string;
  private readonly enableTranscription: boolean;
  private readonly enableInputDiagnostics: boolean;
  private readonly geminiConnection: GeminiLiveConnection;
  private readonly latencyMetrics: TranslationLatencyMetrics;
  private readonly dataPublisher: TranslationDataPublisher;
  private readonly translatedAudioOutput: TranslatedAudioOutput;

  private organizerIdentity: string;
  private activeOrganizerAudioPipelineId: string | null = null;

  constructor(
    sessionId: string,
    targetLanguage: string,
    organizerIdentity: string,
    config: {
      geminiApiKey: string;
      livekitUrl: string;
      livekitApiKey: string;
      livekitApiSecret: string;
      enableTranscription?: boolean;
      enableInputDiagnostics?: boolean;
    }
  ) {
    this.sessionId = sessionId;
    this.targetLanguage = targetLanguage;
    this.organizerIdentity = organizerIdentity;
    this.identity = `translator-${targetLanguage}`;
    this.geminiApiKey = config.geminiApiKey;
    this.livekitUrl = config.livekitUrl;
    this.livekitApiKey = config.livekitApiKey;
    this.livekitApiSecret = config.livekitApiSecret;
    this.enableTranscription = config.enableTranscription === true;
    this.enableInputDiagnostics = config.enableInputDiagnostics === true;
    this.geminiConnection = new GeminiLiveConnection({
      apiKey: this.geminiApiKey,
      model: this.geminiModel,
      targetLanguage,
      enableTranscription: this.enableTranscription,
      enableInputDiagnostics: this.enableInputDiagnostics,
      contextCompressionTriggerTokens: this.contextCompressionTriggerTokens,
      contextCompressionTargetTokens: this.contextCompressionTargetTokens,
      shouldReconnect: () => this.status === "active",
      onMessage: (message) => this.handleGeminiMessage(message),
    });
    this.dataPublisher = new TranslationDataPublisher({
      targetLanguage,
      organizerIdentity,
    });
    this.latencyMetrics = new TranslationLatencyMetrics({
      sessionId,
      targetLanguage,
      inputSampleRate: this.inputSampleRate,
      logIntervalMs: this.latencyLogIntervalMs,
      geminiOutputIdleThresholdMs: this.geminiOutputIdleThresholdMs,
    });
    this.translatedAudioOutput = new TranslatedAudioOutput({
      targetLanguage,
      sampleRate: this.sampleRate,
      channels: this.channels,
      maxBacklogMs: this.maxOutputBacklogMs,
      targetBacklogMs: this.targetOutputBacklogMs,
      backlogLogIntervalMs: this.outputBacklogLogIntervalMs,
      backlogInfoThresholdMs: this.outputBacklogInfoThresholdMs,
      isClosed: () => this.status === "closed",
      onFramePublished: (geminiAudioReceivedAt, publishedAt) => {
        this.latencyMetrics.recordLiveKitAudioPublished(
          geminiAudioReceivedAt,
          publishedAt
        );
        this.latencyMetrics.maybeLog(
          publishedAt,
          this.translatedAudioOutput.getTotalBacklogMs()
        );
      },
    });
  }

  async start(): Promise<void> {
    console.log(
      `[TranslationBridge:${this.targetLanguage}] Starting bridge for session ${this.sessionId}`
    );

    try {
      // 1. Generate token and join LiveKit room
      await this.joinLiveKitRoom();

      // 2. Connect to Gemini Live API
      await this.connectGemini();

      // 3. Subscribe to organizer's audio and wire up the pipeline
      await this.subscribeToOrganizer();

      this.status = "active";
      console.log(
        `[TranslationBridge:${this.targetLanguage}] Bridge is active`
      );
    } catch (error) {
      console.error(
        `[TranslationBridge:${this.targetLanguage}] Failed to start:`,
        error
      );
      this.status = "error";
      throw error;
    }
  }

  async stop(): Promise<void> {
    console.log(
      `[TranslationBridge:${this.targetLanguage}] Stopping bridge`
    );
    this.status = "closed";

    if (this.interimTimeout) {
      clearTimeout(this.interimTimeout);
      this.interimTimeout = null;
    }
    this.pendingInterimText = "";
    if (this.inputDiagnosticTimeout) {
      clearTimeout(this.inputDiagnosticTimeout);
      this.inputDiagnosticTimeout = null;
    }
    this.pendingInputDiagnosticText = "";

    this.geminiConnection.stop();

    if (this.room) {
      await this.room.disconnect();
      this.room = null;
    }

    this.translatedAudioOutput.detach();
    this.localTrack = null;
    this.activeOrganizerAudioPipelineId = null;

    if (this.onStop) {
      this.onStop();
    }
  }

  private async joinLiveKitRoom(): Promise<void> {
    // Generate a token for the bot participant using the server SDK
    const { AccessToken } = await import("livekit-server-sdk");

    const at = new AccessToken(this.livekitApiKey, this.livekitApiSecret, {
      identity: this.identity,
      name: `Translator (${this.targetLanguage.toUpperCase()})`,
    });

    at.addGrant({
      roomJoin: true,
      room: this.sessionId,
      canPublish: true,
      canSubscribe: true,
    });

    const token = await at.toJwt();

    // Create and connect to the room
    this.room = new Room();

    this.room.on(RoomEvent.Disconnected, () => {
      console.log(
        `[TranslationBridge:${this.targetLanguage}] Disconnected from room`
      );
      this.status = "closed";
    });

    this.room.on(
      RoomEvent.ParticipantDisconnected,
      (participant: RemoteParticipant) => {
        if (participant.identity === this.organizerIdentity) {
          console.log(
            `[TranslationBridge:${this.targetLanguage}] Organizer ${this.organizerIdentity} disconnected, stopping bridge`
          );
          this.stop().catch((err) => {
            console.error(
              `[TranslationBridge:${this.targetLanguage}] Error stopping bridge after organizer disconnect:`,
              err
            );
          });
        }
      }
    );

    await this.room.connect(this.livekitUrl, token, {
      autoSubscribe: false,
      dynacast: false,
    });

    console.log(
      `[TranslationBridge:${this.targetLanguage}] Joined room as ${this.identity}`
    );

    // Create an AudioSource to publish translated audio
    // Gemini outputs 24kHz mono PCM
    const audioSource = new AudioSource(
      this.sampleRate,
      this.channels,
      this.outputAudioSourceQueueMs
    );
    this.translatedAudioOutput.attach(audioSource);
    this.localTrack = LocalAudioTrack.createAudioTrack(
      `translated-audio-${this.targetLanguage}`,
      audioSource
    );

    const publishOptions = new TrackPublishOptions();
    publishOptions.source = TrackSource.SOURCE_MICROPHONE;

    await this.room.localParticipant!.publishTrack(
      this.localTrack,
      publishOptions
    );

    // Save published track SID for transcription
    const pubs = this.room.localParticipant!.trackPublications;
    for (const [, pub] of pubs) {
      if (pub.track === this.localTrack) {
        this.publishedTrackSid = pub.sid || "";
        break;
      }
    }

    console.log(
      `[TranslationBridge:${this.targetLanguage}] Published translated audio track (sid: ${this.publishedTrackSid || 'pending'})`
    );
  }

  private async connectGemini(): Promise<void> {
    await this.geminiConnection.connect();
  }

  private handleGeminiMessage(message: GeminiServerMessage): void {
    try {
      // Handle audio response
      const serverContent = message?.serverContent;
      const parts = serverContent?.modelTurn?.parts;

      if (parts?.length) {
        for (const part of parts) {
          if (part.inlineData?.data) {
            const receivedAt = Date.now();
            this.framesReceivedFromGemini++;
            this.latencyMetrics.recordGeminiAudioReceived(receivedAt);
            if (this.framesReceivedFromGemini <= 3 || this.framesReceivedFromGemini % 100 === 0) {
              console.log(
                `[TranslationBridge:${this.targetLanguage}] Received audio frame #${this.framesReceivedFromGemini} from Gemini (${part.inlineData.data.length} bytes base64)`
              );
            }
            // Queue frame for sequential capture (avoid promise pile-up)
            this.translatedAudioOutput.enqueue(
              part.inlineData.data,
              receivedAt,
              this.framesReceivedFromGemini
            );
          }
        }
      }

      // Handle output transcription (separate field from modelTurn)
      if (this.enableTranscription && serverContent?.outputTranscription?.text) {
        const text = serverContent.outputTranscription.text;
        const isInterim = !serverContent.turnComplete;

        if (isInterim) {
          this.handleInterimTranscription(text);
        } else {
          if (this.interimTimeout) {
            clearTimeout(this.interimTimeout);
            this.interimTimeout = null;
          }
          const finalText = this.pendingInterimText + text;
          this.pendingInterimText = "";
          console.log(
            `[TranslationBridge:${this.targetLanguage}] Final Transcription:`,
            finalText.slice(0, 100)
          );
          void this.dataPublisher.publishTranscription(
            this.room,
            finalText,
            false,
            this.transcriptionSegmentId
          );
        }
      }

      if (
        this.enableInputDiagnostics &&
        serverContent?.inputTranscription?.text
      ) {
        const text = serverContent.inputTranscription.text;
        const isInterim = !serverContent.turnComplete;

        console.log(
          `[TranslationBridge:${this.targetLanguage}] Input diagnostic${isInterim ? " interim" : " final"}:`,
          text.slice(0, 160)
        );

        if (isInterim) {
          this.handleInputDiagnosticInterim(text);
        } else {
          if (this.inputDiagnosticTimeout) {
            clearTimeout(this.inputDiagnosticTimeout);
            this.inputDiagnosticTimeout = null;
          }
          const finalText = this.pendingInputDiagnosticText + text;
          this.pendingInputDiagnosticText = "";
          void this.dataPublisher.publishInputDiagnostic(
            this.room,
            finalText,
            false,
            this.inputDiagnosticSegmentId
          );
        }
      }

      // If turn is complete, flush remaining interim buffer and advance the segment id
      if (this.enableTranscription && serverContent?.turnComplete) {
        if (this.interimTimeout) {
          clearTimeout(this.interimTimeout);
          this.interimTimeout = null;
        }
        if (this.pendingInterimText) {
          void this.dataPublisher.publishTranscription(
            this.room,
            this.pendingInterimText,
            false,
            this.transcriptionSegmentId
          );
          this.pendingInterimText = "";
        }
        this.transcriptionSegmentId++;
      }

      if (this.enableInputDiagnostics && serverContent?.turnComplete) {
        if (this.inputDiagnosticTimeout) {
          clearTimeout(this.inputDiagnosticTimeout);
          this.inputDiagnosticTimeout = null;
        }
        if (this.pendingInputDiagnosticText) {
          void this.dataPublisher.publishInputDiagnostic(
            this.room,
            this.pendingInputDiagnosticText,
            false,
            this.inputDiagnosticSegmentId
          );
          this.pendingInputDiagnosticText = "";
        }
        this.inputDiagnosticSegmentId++;
      }
    } catch (error) {
      console.error(
        `[TranslationBridge:${this.targetLanguage}] Error parsing Gemini message:`,
        error
      );
    }
  }

  private async subscribeToOrganizer(): Promise<void> {
    if (!this.room) return;

    // Find the organizer participant and subscribe to their audio
    const participants = this.room.remoteParticipants;

    for (const [, participant] of participants) {
      if (participant.identity === this.organizerIdentity) {
        this.subscribeToParticipantAudio(participant);
        return;
      }
    }

    // If organizer hasn't joined yet, wait for them
    console.log(
      `[TranslationBridge:${this.targetLanguage}] Waiting for organizer ${this.organizerIdentity}...`
    );

    // Listen for the organizer to publish their track
    this.room.on(
      RoomEvent.TrackPublished,
      (
        publication: RemoteTrackPublication,
        participant: RemoteParticipant
      ) => {
        if (
          participant.identity === this.organizerIdentity &&
          publication.kind === TrackKind.KIND_AUDIO
        ) {
          publication.setSubscribed(true);
        }
      }
    );

    // Once subscribed, pipe to Gemini
    this.room.on(
      RoomEvent.TrackSubscribed,
      (
        track: RemoteAudioTrack,
        publication: RemoteTrackPublication,
        participant: RemoteParticipant
      ) => {
        if (
          participant.identity === this.organizerIdentity &&
          publication.kind === TrackKind.KIND_AUDIO
        ) {
          this.pipeTrackToGemini(track, publication);
        }
      }
    );
  }

  /**
   * Manually subscribe to a participant's audio track (needed when autoSubscribe is off).
   */
  private subscribeToParticipantAudio(
    participant: RemoteParticipant
  ): void {
    // Listen before setSubscribed() so the subscription event cannot race past us.
    this.room!.on(
      RoomEvent.TrackSubscribed,
      (
        track: RemoteAudioTrack,
        pub: RemoteTrackPublication,
        p: RemoteParticipant
      ) => {
        if (
          p.identity === this.organizerIdentity &&
          pub.kind === TrackKind.KIND_AUDIO
        ) {
          this.pipeTrackToGemini(track, pub);
        }
      }
    );

    const audioPublications = Array.from(participant.trackPublications.values())
      .filter((publication) => publication.kind === TrackKind.KIND_AUDIO);
    const preferredPublication =
      audioPublications.find((publication) => publication.name === "broadcast-audio") ??
      audioPublications[0];

    if (!preferredPublication) {
      console.log(
        `[TranslationBridge:${this.targetLanguage}] Organizer ${this.organizerIdentity} has no audio tracks yet`
      );
      return;
    }

    console.log(
      `[TranslationBridge:${this.targetLanguage}] Subscribing to organizer audio publication ${this.getPublicationLabel(preferredPublication)}`
    );
    preferredPublication.setSubscribed(true);
  }

  private pipeTrackToGemini(
    track: RemoteAudioTrack,
    publication: RemoteTrackPublication
  ): void {
    const pipelineId = this.getAudioPipelineId(track, publication);

    if (this.activeOrganizerAudioPipelineId) {
      const duplicateKind =
        this.activeOrganizerAudioPipelineId === pipelineId
          ? "duplicate"
          : "additional";
      console.warn(
        `[TranslationBridge:${this.targetLanguage}] Ignoring ${duplicateKind} organizer audio pipeline ${pipelineId}; active=${this.activeOrganizerAudioPipelineId}`
      );
      return;
    }

    this.activeOrganizerAudioPipelineId = pipelineId;
    console.log(
      `[TranslationBridge:${this.targetLanguage}] Subscribed to organizer audio track ${pipelineId} (${this.getPublicationLabel(publication)}), piping to Gemini`
    );

    const audioStream = new AudioStream(track, {
      sampleRate: this.inputSampleRate,
      numChannels: this.channels,
      frameSizeMs: 100,
    });

    // Process frames as they arrive via ReadableStream reader
    const reader = audioStream.getReader();
    const readLoop = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        this.sendAudioToGemini(value);
      }
    };

    readLoop()
      .catch((err: Error) => {
        console.error(
          `[TranslationBridge:${this.targetLanguage}] Audio stream error:`,
          err
        );
      })
      .finally(() => {
        if (this.activeOrganizerAudioPipelineId === pipelineId) {
          this.activeOrganizerAudioPipelineId = null;
        }
      });
  }

  private getAudioPipelineId(
    track: RemoteAudioTrack,
    publication: RemoteTrackPublication
  ): string {
    return publication.sid || track.sid || publication.name || track.name || "unknown";
  }

  private getPublicationLabel(publication: RemoteTrackPublication): string {
    return `sid=${publication.sid || "unknown"}, name=${publication.name || "unnamed"}`;
  }

  private sendAudioToGemini(frame: AudioFrame): void {
    if (!this.geminiConnection.isReady) {
      return;
    }

    try {
      const frameReceivedAt = Date.now();
      // Convert AudioFrame's Int16Array data to base64
      const int16Data = frame.data;
      const buffer = Buffer.from(int16Data.buffer, int16Data.byteOffset, int16Data.byteLength);
      const base64 = buffer.toString("base64");

      this.framesSentToGemini++;
      if (this.framesSentToGemini <= 3 || this.framesSentToGemini % 500 === 0) {
        console.log(
          `[TranslationBridge:${this.targetLanguage}] Sent audio frame #${this.framesSentToGemini} to Gemini (${base64.length} bytes base64, ${int16Data.length} samples)`
        );
      }

      this.geminiConnection.sendAudio(base64, this.inputSampleRate);
      const sentAt = Date.now();
      this.latencyMetrics.recordInputSent(frameReceivedAt, sentAt);
      this.latencyMetrics.maybeLog(
        sentAt,
        this.translatedAudioOutput.getTotalBacklogMs()
      );
    } catch (error) {
      console.error(
        `[TranslationBridge:${this.targetLanguage}] Error sending audio to Gemini:`,
        error
      );
    }
  }

  private handleInterimTranscription(text: string): void {
    if (!this.enableTranscription) return;

    this.pendingInterimText += text;

    if (!this.interimTimeout) {
      this.interimTimeout = setTimeout(() => {
        this.flushInterimTranscription();
      }, 150); // Throttle interim text updates to 150ms
    }
  }

  private flushInterimTranscription(): void {
    this.interimTimeout = null;
    if (this.enableTranscription && this.pendingInterimText && this.status === "active") {
      void this.dataPublisher.publishTranscription(
        this.room,
        this.pendingInterimText,
        true,
        this.transcriptionSegmentId
      );
      this.pendingInterimText = "";
    }
  }

  private handleInputDiagnosticInterim(text: string): void {
    if (!this.enableInputDiagnostics) return;

    this.pendingInputDiagnosticText += text;

    if (!this.inputDiagnosticTimeout) {
      this.inputDiagnosticTimeout = setTimeout(() => {
        this.flushInputDiagnostic();
      }, 250);
    }
  }

  private flushInputDiagnostic(): void {
    this.inputDiagnosticTimeout = null;
    if (
      this.enableInputDiagnostics &&
      this.pendingInputDiagnosticText &&
      this.status === "active"
    ) {
      void this.dataPublisher.publishInputDiagnostic(
        this.room,
        this.pendingInputDiagnosticText,
        true,
        this.inputDiagnosticSegmentId
      );
      this.pendingInputDiagnosticText = "";
    }
  }

}
