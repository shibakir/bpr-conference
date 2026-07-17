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
  AudioFrame,
  TrackPublishOptions,
  TrackSource,
  RemoteTrackPublication,
  RemoteParticipant,
  RemoteAudioTrack,
  TrackKind,
  AudioStream,
} from "@livekit/rtc-node";
import WebSocket from "ws";

type QueuedTranslatedAudioFrame = {
  pcmBuffer: Buffer;
  durationMs: number;
};

function getPositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getBooleanEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

export type BridgeStatus = "starting" | "active" | "error" | "closed";

export class TranslationBridge {
  private room: Room | null = null;
  private geminiWs: WebSocket | null = null;
  private audioSource: AudioSource | null = null;
  private localTrack: LocalAudioTrack | null = null;
  private publishedTrackSid: string = "";
  private transcriptionSegmentId: number = 0;
  private framesSentToGemini: number = 0;
  private framesReceivedFromGemini: number = 0;
  private framesPublishedToLiveKit: number = 0;
  private resumptionHandle: string | null = null;
  private isReconnecting: boolean = false;
  private pendingInterimText: string = "";
  private interimTimeout: NodeJS.Timeout | null = null;

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
  private readonly inputSampleRate: number = 48000; // LiveKit default
  private readonly channels: number = 1;
  private readonly contextCompressionTriggerTokens: number = 25000;
  private readonly contextCompressionTargetTokens: number = 8000;
  private readonly outputAudioSourceQueueMs: number = getPositiveIntegerEnv(
    "TRANSLATION_OUTPUT_QUEUE_MS",
    700
  );
  private readonly maxOutputBacklogMs: number = getPositiveIntegerEnv(
    "TRANSLATION_MAX_OUTPUT_BACKLOG_MS",
    3000
  );
  private readonly targetOutputBacklogMs: number = getPositiveIntegerEnv(
    "TRANSLATION_TARGET_OUTPUT_BACKLOG_MS",
    1500
  );
  private readonly outputBacklogLogIntervalMs: number = 5000;
  private readonly outputBacklogInfoThresholdMs: number = 500;
  private readonly dropStaleOutputAudio: boolean = getBooleanEnv(
    "TRANSLATION_DROP_STALE_AUDIO",
    true
  );

  // LiveKit config
  private readonly livekitUrl: string;
  private readonly livekitApiKey: string;
  private readonly livekitApiSecret: string;
  private readonly enableTranscription: boolean;

  private geminiSetupComplete: boolean = false;
  private organizerIdentity: string;
  private lastAudioFrameTime: number = 0;
  private pendingTranslatedAudioFrames: QueuedTranslatedAudioFrame[] = [];
  private pendingTranslatedAudioDurationMs: number = 0;
  private isPublishingTranslatedAudio: boolean = false;
  private droppedTranslatedAudioFrames: number = 0;
  private droppedTranslatedAudioDurationMs: number = 0;
  private lastLoggedDroppedTranslatedAudioFrames: number = 0;
  private lastOutputBacklogLogAt: number = 0;
  private lastOutputBacklogWarningAt: number = 0;
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

    if (this.geminiWs) {
      this.geminiWs.close();
      this.geminiWs = null;
    }

    if (this.room) {
      await this.room.disconnect();
      this.room = null;
    }

    this.audioSource = null;
    this.localTrack = null;
    this.geminiSetupComplete = false;
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
    this.audioSource = new AudioSource(
      this.sampleRate,
      this.channels,
      this.outputAudioSourceQueueMs
    );
    console.log(
      `[TranslationBridge:${this.targetLanguage}] Output audio config: sourceQueue=${this.outputAudioSourceQueueMs}ms, maxBacklog=${this.maxOutputBacklogMs}ms, targetBacklog=${this.targetOutputBacklogMs}ms, dropStale=${this.dropStaleOutputAudio}`
    );

    this.localTrack = LocalAudioTrack.createAudioTrack(
      `translated-audio-${this.targetLanguage}`,
      this.audioSource
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
    const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${this.geminiApiKey}`;

    return new Promise<void>((resolve, reject) => {
      this.geminiWs = new WebSocket(wsUrl);

      this.geminiWs.on("open", () => {
        console.log(
          `[TranslationBridge:${this.targetLanguage}] Gemini WebSocket connected`
        );
        this.sendGeminiSetup();
      });

      this.geminiWs.on("message", (data: WebSocket.Data) => {
        this.handleGeminiMessage(data);
        if (!this.geminiSetupComplete) {
          // Wait for setup complete message
          // resolve will be called in handleGeminiMessage
        }
      });

      this.geminiWs.on("error", (error) => {
        console.error(
          `[TranslationBridge:${this.targetLanguage}] Gemini WebSocket error:`,
          error
        );
        if (!this.geminiSetupComplete) {
          reject(error);
        }
      });

      this.geminiWs.on("close", (code: number, reason: Buffer) => {
        const reasonStr = reason.toString();
        console.log(
          `[TranslationBridge:${this.targetLanguage}] Gemini WebSocket closed`,
          { code, reason: reasonStr }
        );
        if (!this.geminiSetupComplete) {
          reject(new Error(`Gemini WebSocket closed before setup: code=${code} reason=${reasonStr}`));
        } else if (this.status === "active") {
          // Auto-reconnect on GoAway or unexpected closure
          console.log(
            `[TranslationBridge:${this.targetLanguage}] Reconnecting Gemini WebSocket...`
          );
          this.geminiSetupComplete = false;
          this.reconnectGemini();
        }
      });

      // Store resolve for use when setup complete arrives
      const checkSetup = setInterval(() => {
        if (this.geminiSetupComplete) {
          clearInterval(checkSetup);
          resolve();
        }
      }, 100);

      // Timeout after 15 seconds
      setTimeout(() => {
        if (!this.geminiSetupComplete) {
          clearInterval(checkSetup);
          reject(new Error("Gemini setup timeout"));
        }
      }, 15000);
    });
  }

  /**
   * Reconnect the Gemini WebSocket after a GoAway or unexpected closure.
   * Reuses the existing LiveKit room + audio pipeline.
   */
  private async reconnectGemini(): Promise<void> {
    if (this.isReconnecting) {
      console.log(
        `[TranslationBridge:${this.targetLanguage}] Reconnection already in progress. Skipping duplicate request.`
      );
      return;
    }
    this.isReconnecting = true;

    try {
      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${this.geminiApiKey}`;
      console.log(
        `[TranslationBridge:${this.targetLanguage}] Reconnecting Gemini WebSocket with handle: ${this.resumptionHandle || "none"}...`
      );

      const nextWs = new WebSocket(wsUrl);
      let nextSetupComplete = false;

      nextWs.on("open", () => {
        console.log(
          `[TranslationBridge:${this.targetLanguage}] Gemini reconnect WebSocket opened`
        );
        this.sendGeminiSetup(nextWs);
      });

      nextWs.on("message", (data: WebSocket.Data) => {
        try {
          if (!nextSetupComplete) {
            const msg = JSON.parse(data.toString());
            if (msg.setupComplete) {
              console.log(
                `[TranslationBridge:${this.targetLanguage}] Gemini reconnect setup complete`
              );
              nextSetupComplete = true;
              this.geminiSetupComplete = true;

              const oldWs = this.geminiWs;
              this.geminiWs = nextWs;
              this.isReconnecting = false;

              if (oldWs) {
                console.log(
                  `[TranslationBridge:${this.targetLanguage}] Gracefully closing old Gemini WebSocket`
                );
                oldWs.removeAllListeners();
                oldWs.close();
              }
              return;
            }
          }
          this.handleGeminiMessage(data);
        } catch (error) {
          console.error(
            `[TranslationBridge:${this.targetLanguage}] Error handling reconnect message:`,
            error
          );
        }
      });

      nextWs.on("error", (error) => {
        console.error(
          `[TranslationBridge:${this.targetLanguage}] Gemini reconnect error:`,
          error
        );
      });

      nextWs.on("close", (code: number, reason: Buffer) => {
        const reasonStr = reason.toString();
        console.log(
          `[TranslationBridge:${this.targetLanguage}] Gemini reconnect WebSocket closed`,
          { code, reason: reasonStr }
        );

        if (this.geminiWs === nextWs) {
          this.geminiSetupComplete = false;
          if (this.status === "active") {
            setTimeout(() => {
              this.reconnectGemini();
            }, 1000);
          }
        } else {
          this.isReconnecting = false;
          if (this.status === "active") {
            setTimeout(() => {
              this.reconnectGemini();
            }, 2000);
          }
        }
      });
    } catch (error) {
      console.error(
        `[TranslationBridge:${this.targetLanguage}] Gemini reconnect initialization failed:`,
        error
      );
      this.isReconnecting = false;
      if (this.status === "active") {
        setTimeout(() => {
          this.reconnectGemini();
        }, 5000);
      }
    }
  }

  private sendGeminiSetup(ws: WebSocket = this.geminiWs!): void {
    const setup: {
      model: string;
      outputAudioTranscription?: Record<string, never>;
      generationConfig: {
        responseModalities: string[];
        translationConfig: {
          targetLanguageCode: string;
          echoTargetLanguage: boolean;
        };
      };
      realtimeInputConfig: {
        automaticActivityDetection: {
          disabled: boolean;
          startOfSpeechSensitivity: "START_SENSITIVITY_HIGH";
          endOfSpeechSensitivity: "END_SENSITIVITY_HIGH";
          prefixPaddingMs: number;
          silenceDurationMs: number;
        };
      };
      sessionResumption: {
        handle?: string;
      };
      contextWindowCompression: {
        triggerTokens: number;
        slidingWindow: {
          targetTokens: number;
        };
      };
    } = {
      model: `models/${this.geminiModel}`,
      generationConfig: {
        responseModalities: ["AUDIO"],
        translationConfig: {
          targetLanguageCode: this.targetLanguage,
          echoTargetLanguage: true,
        },
      },
      realtimeInputConfig: {
        automaticActivityDetection: {
          disabled: false,
          startOfSpeechSensitivity: "START_SENSITIVITY_HIGH",
          endOfSpeechSensitivity: "END_SENSITIVITY_HIGH",
          prefixPaddingMs: 100,
          silenceDurationMs: 500,
        },
      },
      sessionResumption: this.resumptionHandle
        ? { handle: this.resumptionHandle }
        : {},
      contextWindowCompression: {
        triggerTokens: this.contextCompressionTriggerTokens,
        slidingWindow: {
          targetTokens: this.contextCompressionTargetTokens,
        },
      },
    };

    if (this.enableTranscription) {
      setup.outputAudioTranscription = {};
    }

    const setupMessage = { setup };

    console.log(
      `[TranslationBridge:${this.targetLanguage}] Sending Gemini setup (resuming: ${!!this.resumptionHandle}):`,
      JSON.stringify(setupMessage, null, 2)
    );

    ws.send(JSON.stringify(setupMessage));
  }

  private handleGeminiMessage(data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString());

      // Log all messages before setup is complete for debugging
      if (!this.geminiSetupComplete) {
        console.log(
          `[TranslationBridge:${this.targetLanguage}] Gemini message (pre-setup):`,
          JSON.stringify(message).slice(0, 500)
        );
      }

      // Handle setup complete
      if (message.setupComplete) {
        console.log(
          `[TranslationBridge:${this.targetLanguage}] Gemini setup complete`
        );
        this.geminiSetupComplete = true;
        return;
      }

      // Handle session resumption update
      if (message.sessionResumptionUpdate) {
        const update = message.sessionResumptionUpdate;
        if (update.resumable && update.newHandle) {
          this.resumptionHandle = update.newHandle;
          console.log(
            `[TranslationBridge:${this.targetLanguage}] Received sessionResumptionUpdate with newHandle: ${this.resumptionHandle}`
          );
        }
      }

      // Handle GoAway message
      if (message.goAway) {
        console.log(
          `[TranslationBridge:${this.targetLanguage}] Received goAway message from Gemini. Time left: ${message.goAway.timeLeft || "unknown"}. Initiating graceful session resumption...`
        );
        this.reconnectGemini().catch((err) => {
          console.error(
            `[TranslationBridge:${this.targetLanguage}] Error during goAway reconnection:`,
            err
          );
        });
      }

      // Handle audio response
      const serverContent = message?.serverContent;
      const parts = serverContent?.modelTurn?.parts;

      if (parts?.length) {
        for (const part of parts) {
          if (part.inlineData?.data) {
            this.framesReceivedFromGemini++;
            if (this.framesReceivedFromGemini <= 3 || this.framesReceivedFromGemini % 100 === 0) {
              console.log(
                `[TranslationBridge:${this.targetLanguage}] Received audio frame #${this.framesReceivedFromGemini} from Gemini (${part.inlineData.data.length} bytes base64)`
              );
            }
            // Queue frame for sequential capture (avoid promise pile-up)
            this.queueAudioFrame(part.inlineData.data);
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
          this.publishTranscriptionText(finalText, false);
        }
      }

      // If turn is complete, flush remaining interim buffer and advance the segment id
      if (this.enableTranscription && serverContent?.turnComplete) {
        if (this.interimTimeout) {
          clearTimeout(this.interimTimeout);
          this.interimTimeout = null;
        }
        if (this.pendingInterimText) {
          this.publishTranscriptionText(this.pendingInterimText, false);
          this.pendingInterimText = "";
        }
        this.transcriptionSegmentId++;
      }
    } catch (error) {
      console.error(
        `[TranslationBridge:${this.targetLanguage}] Error parsing Gemini message:`,
        error
      );
    }
  }

  /**
   * Queue translated audio for sequential capture.
   * If Gemini produces audio faster than LiveKit can play it, discard stale
   * pending frames so listeners stay close to live instead of drifting behind.
   */
  private queueAudioFrame(base64Audio: string): void {
    try {
      const pcmBuffer = Buffer.from(base64Audio, "base64");
      const durationMs = this.getPcmDurationMs(pcmBuffer);

      if (durationMs <= 0) return;

      this.pendingTranslatedAudioFrames.push({ pcmBuffer, durationMs });
      this.pendingTranslatedAudioDurationMs += durationMs;

      this.maybeLogOutputBacklog();

      if (!this.isPublishingTranslatedAudio) {
        this.drainTranslatedAudioQueue().catch((error) => {
          console.error(
            `[TranslationBridge:${this.targetLanguage}] Error draining translated audio queue:`,
            error
          );
        });
      }
    } catch (error) {
      console.error(
        `[TranslationBridge:${this.targetLanguage}] Error queueing translated audio frame:`,
        error
      );
    }
  }

  private async drainTranslatedAudioQueue(): Promise<void> {
    if (this.isPublishingTranslatedAudio) return;

    this.isPublishingTranslatedAudio = true;
    try {
      while (
        this.pendingTranslatedAudioFrames.length > 0 &&
        this.status !== "closed"
      ) {
        this.trimTranslatedAudioBacklog("drain", true);

        const queuedFrame = this.pendingTranslatedAudioFrames.shift();
        if (!queuedFrame) continue;

        this.pendingTranslatedAudioDurationMs = Math.max(
          this.pendingTranslatedAudioDurationMs - queuedFrame.durationMs,
          0
        );

        await this.publishTranslatedAudio(queuedFrame);
      }
    } finally {
      this.isPublishingTranslatedAudio = false;

      if (this.status === "closed") {
        this.pendingTranslatedAudioFrames = [];
        this.pendingTranslatedAudioDurationMs = 0;
      } else if (this.pendingTranslatedAudioFrames.length > 0) {
        this.drainTranslatedAudioQueue().catch((error) => {
          console.error(
            `[TranslationBridge:${this.targetLanguage}] Error restarting translated audio queue drain:`,
            error
          );
        });
      }
    }
  }

  private async publishTranslatedAudio(
    queuedFrame: QueuedTranslatedAudioFrame
  ): Promise<void> {
    if (!this.audioSource || this.status === "closed") return;

    try {
      const int16 = new Int16Array(
        queuedFrame.pcmBuffer.buffer,
        queuedFrame.pcmBuffer.byteOffset,
        queuedFrame.pcmBuffer.byteLength / 2
      );

      const frame = new AudioFrame(int16, this.sampleRate, this.channels, int16.length);
      await this.audioSource.captureFrame(frame);
      this.framesPublishedToLiveKit++;

      if (this.framesPublishedToLiveKit <= 3 || this.framesPublishedToLiveKit % 100 === 0) {
        console.log(
          `[TranslationBridge:${this.targetLanguage}] Published translated audio frame #${this.framesPublishedToLiveKit} to LiveKit (${Math.round(
            queuedFrame.durationMs
          )}ms)`
        );
      }

      const now = Date.now();
      if (this.lastAudioFrameTime && now - this.lastAudioFrameTime > 2000) {
        console.log(
          `[TranslationBridge:${this.targetLanguage}] Audio resumed after ${now - this.lastAudioFrameTime}ms gap (frame #${this.framesReceivedFromGemini})`
        );
      }
      this.lastAudioFrameTime = now;
      this.maybeLogOutputBacklog();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("InvalidState") || msg.includes("closed")) {
        console.warn(
          `[TranslationBridge:${this.targetLanguage}] AudioSource closed — stopping capture`
        );
        this.audioSource = null;
      } else {
        console.error(
          `[TranslationBridge:${this.targetLanguage}] Error capturing audio frame:`,
          error
        );
      }
    }
  }

  private getPcmDurationMs(pcmBuffer: Buffer): number {
    const samplesPerChannel = pcmBuffer.byteLength / 2 / this.channels;
    return (samplesPerChannel / this.sampleRate) * 1000;
  }

  private getNativeOutputQueueMs(): number {
    return this.audioSource?.queuedDuration ?? 0;
  }

  private getTotalOutputBacklogMs(): number {
    return this.getNativeOutputQueueMs() + this.pendingTranslatedAudioDurationMs;
  }

  private trimTranslatedAudioBacklog(
    reason: "enqueue" | "drain",
    allowNativeClear: boolean
  ): void {
    if (!this.dropStaleOutputAudio) return;

    const source = this.audioSource;
    let nativeQueuedMs = this.getNativeOutputQueueMs();
    const totalBeforeMs = nativeQueuedMs + this.pendingTranslatedAudioDurationMs;

    if (totalBeforeMs <= this.maxOutputBacklogMs) return;

    let clearedNativeMs = 0;
    let droppedFrames = 0;
    let droppedDurationMs = 0;

    if (
      allowNativeClear &&
      source &&
      nativeQueuedMs > this.targetOutputBacklogMs
    ) {
      source.clearQueue();
      clearedNativeMs = nativeQueuedMs;
      nativeQueuedMs = 0;
    }

    const targetBacklogMs = Math.min(
      this.targetOutputBacklogMs,
      this.maxOutputBacklogMs
    );

    while (
      nativeQueuedMs + this.pendingTranslatedAudioDurationMs >
        targetBacklogMs &&
      this.pendingTranslatedAudioFrames.length > 1
    ) {
      const dropped = this.pendingTranslatedAudioFrames.shift();
      if (!dropped) break;

      this.pendingTranslatedAudioDurationMs = Math.max(
        this.pendingTranslatedAudioDurationMs - dropped.durationMs,
        0
      );
      droppedFrames++;
      droppedDurationMs += dropped.durationMs;
    }

    if (clearedNativeMs === 0 && droppedFrames === 0) return;

    this.droppedTranslatedAudioFrames += droppedFrames;
    this.droppedTranslatedAudioDurationMs += clearedNativeMs + droppedDurationMs;

    const now = Date.now();
    if (now - this.lastOutputBacklogWarningAt < 2000) return;
    this.lastOutputBacklogWarningAt = now;

    console.warn(
      `[TranslationBridge:${this.targetLanguage}] Output audio backlog capped during ${reason}: total=${Math.round(
        totalBeforeMs
      )}ms, clearedNative=${Math.round(
        clearedNativeMs
      )}ms, droppedPending=${droppedFrames} frames/${Math.round(
        droppedDurationMs
      )}ms, remaining=${Math.round(this.getTotalOutputBacklogMs())}ms`
    );
  }

  private maybeLogOutputBacklog(): void {
    const now = Date.now();
    if (now - this.lastOutputBacklogLogAt < this.outputBacklogLogIntervalMs) {
      return;
    }

    const nativeQueuedMs = this.getNativeOutputQueueMs();
    const totalBacklogMs = nativeQueuedMs + this.pendingTranslatedAudioDurationMs;
    const droppedFrameCountChanged =
      this.droppedTranslatedAudioFrames !==
      this.lastLoggedDroppedTranslatedAudioFrames;

    if (
      totalBacklogMs < this.outputBacklogInfoThresholdMs &&
      !droppedFrameCountChanged
    ) {
      return;
    }

    this.lastOutputBacklogLogAt = now;
    this.lastLoggedDroppedTranslatedAudioFrames =
      this.droppedTranslatedAudioFrames;

    console.log(
      `[TranslationBridge:${this.targetLanguage}] Output audio backlog: total=${Math.round(
        totalBacklogMs
      )}ms, native=${Math.round(nativeQueuedMs)}ms, pending=${Math.round(
        this.pendingTranslatedAudioDurationMs
      )}ms, pendingFrames=${
        this.pendingTranslatedAudioFrames.length
      }, dropped=${this.droppedTranslatedAudioFrames} frames/${Math.round(
        this.droppedTranslatedAudioDurationMs
      )}ms`
    );
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
    if (
      !this.geminiWs ||
      this.geminiWs.readyState !== WebSocket.OPEN ||
      !this.geminiSetupComplete
    ) {
      return;
    }

    try {
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

      const message = {
        realtimeInput: {
          audio: {
            mimeType: `audio/pcm;rate=${this.inputSampleRate}`,
            data: base64,
          },
        },
      };

      this.geminiWs.send(JSON.stringify(message));
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
      this.publishTranscriptionText(this.pendingInterimText, true);
      this.pendingInterimText = "";
    }
  }

  private async publishTranscriptionText(text: string, interim: boolean): Promise<void> {
    if (!this.enableTranscription) return;
    if (!this.room || !this.room.localParticipant) return;

    try {
      // Find all remote participants who have set their 'language' attribute to this.targetLanguage
      const destinationIdentities = Array.from(this.room.remoteParticipants.values())
        .filter((p) => p.attributes?.language === this.targetLanguage)
        .map((p) => p.identity);

      // If no one is listening to this language, skip publishing to save bandwidth
      if (destinationIdentities.length === 0) {
        return;
      }

      const payload = JSON.stringify({
        type: "transcription",
        language: this.targetLanguage,
        segmentId: `${this.targetLanguage}-${this.transcriptionSegmentId}`,
        text,
        final: !interim,
        timestamp: Date.now(),
      });

      await this.room.localParticipant.publishData(
        new TextEncoder().encode(payload),
        {
          reliable: !interim, // reliable only for final transcripts, lossy for interim
          topic: "transcription",
          destination_identities: destinationIdentities,
        }
      );
    } catch (error) {
      console.error(
        `[TranslationBridge:${this.targetLanguage}] Error publishing transcription:`,
        error
      );
    }
  }
}
