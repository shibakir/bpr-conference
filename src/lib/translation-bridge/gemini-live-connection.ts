import WebSocket from "ws";

export type GeminiServerMessage = {
  setupComplete?: Record<string, never>;
  sessionResumptionUpdate?: {
    resumable?: boolean;
    newHandle?: string;
  };
  goAway?: {
    timeLeft?: string;
  };
  serverContent?: {
    modelTurn?: {
      parts?: Array<{
        inlineData?: {
          data?: string;
        };
      }>;
    };
    outputTranscription?: {
      text?: string;
    };
    inputTranscription?: {
      text?: string;
    };
    turnComplete?: boolean;
  };
};

export type GeminiLiveConnectionOptions = {
  apiKey: string;
  model: string;
  targetLanguage: string;
  enableTranscription: boolean;
  enableInputDiagnostics: boolean;
  contextCompressionTriggerTokens: number;
  contextCompressionTargetTokens: number;
  shouldReconnect: () => boolean;
  onMessage: (message: GeminiServerMessage) => void;
  webSocketFactory?: (url: string) => WebSocket;
};

type GeminiSetup = {
  model: string;
  inputAudioTranscription?: Record<string, never>;
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
};

/**
 * Owns the Gemini Live WebSocket lifecycle, including setup, session
 * resumption and reconnects. Domain-specific handling of Gemini responses is
 * delegated to the bridge through `onMessage`.
 */
export class GeminiLiveConnection {
  private ws: WebSocket | null = null;
  private setupComplete = false;
  private isReconnecting = false;
  private resumptionHandle: string | null = null;
  private isStopped = false;

  constructor(private readonly options: GeminiLiveConnectionOptions) {}

  async connect(): Promise<void> {
    this.isStopped = false;

    return new Promise<void>((resolve, reject) => {
      const ws = this.createWebSocket();
      this.ws = ws;
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearInterval(checkSetup);
        clearTimeout(setupTimeout);
        callback();
      };

      ws.on("open", () => {
        console.log(
          `[TranslationBridge:${this.options.targetLanguage}] Gemini WebSocket connected`
        );
        this.sendSetup(ws);
      });

      ws.on("message", (data: WebSocket.Data) => {
        this.handleInitialMessage(data, () => finish(resolve));
      });

      ws.on("error", (error) => {
        console.error(
          `[TranslationBridge:${this.options.targetLanguage}] Gemini WebSocket error:`,
          error
        );
        if (!this.setupComplete) {
          finish(() => reject(error));
        }
      });

      ws.on("close", (code: number, reason: Buffer) => {
        const reasonString = reason.toString();
        console.log(
          `[TranslationBridge:${this.options.targetLanguage}] Gemini WebSocket closed`,
          { code, reason: reasonString }
        );
        if (!this.setupComplete) {
          finish(() =>
            reject(
              new Error(
                `Gemini WebSocket closed before setup: code=${code} reason=${reasonString}`
              )
            )
          );
        } else if (this.canReconnect()) {
          console.log(
            `[TranslationBridge:${this.options.targetLanguage}] Reconnecting Gemini WebSocket...`
          );
          this.setupComplete = false;
          void this.reconnect();
        }
      });

      const checkSetup = setInterval(() => {
        if (this.setupComplete) {
          finish(resolve);
        }
      }, 100);

      const setupTimeout = setTimeout(() => {
        if (!this.setupComplete) {
          finish(() => reject(new Error("Gemini setup timeout")));
        }
      }, 15_000);
    });
  }

  stop(): void {
    this.isStopped = true;
    this.setupComplete = false;
    this.ws?.close();
    this.ws = null;
  }

  get isReady(): boolean {
    return (
      this.ws?.readyState === WebSocket.OPEN && this.setupComplete
    );
  }

  sendAudio(base64Audio: string, sampleRate: number): boolean {
    if (!this.ws || !this.isReady) {
      return false;
    }

    this.ws.send(
      JSON.stringify({
        realtimeInput: {
          audio: {
            mimeType: `audio/pcm;rate=${sampleRate}`,
            data: base64Audio,
          },
        },
      })
    );
    return true;
  }

  private async reconnect(): Promise<void> {
    if (this.isReconnecting) {
      console.log(
        `[TranslationBridge:${this.options.targetLanguage}] Reconnection already in progress. Skipping duplicate request.`
      );
      return;
    }
    this.isReconnecting = true;

    try {
      console.log(
        `[TranslationBridge:${this.options.targetLanguage}] Reconnecting Gemini WebSocket with handle: ${this.resumptionHandle || "none"}...`
      );
      const nextWs = this.createWebSocket();
      let nextSetupComplete = false;

      nextWs.on("open", () => {
        console.log(
          `[TranslationBridge:${this.options.targetLanguage}] Gemini reconnect WebSocket opened`
        );
        this.sendSetup(nextWs);
      });

      nextWs.on("message", (data: WebSocket.Data) => {
        try {
          const message = this.parseMessage(data);
          if (!nextSetupComplete && message.setupComplete) {
            console.log(
              `[TranslationBridge:${this.options.targetLanguage}] Gemini reconnect setup complete`
            );
            nextSetupComplete = true;
            this.setupComplete = true;

            const oldWs = this.ws;
            this.ws = nextWs;
            this.isReconnecting = false;

            if (oldWs) {
              console.log(
                `[TranslationBridge:${this.options.targetLanguage}] Gracefully closing old Gemini WebSocket`
              );
              oldWs.removeAllListeners();
              oldWs.close();
            }
            return;
          }

          this.handleServerMessage(message);
        } catch (error) {
          console.error(
            `[TranslationBridge:${this.options.targetLanguage}] Error handling reconnect message:`,
            error
          );
        }
      });

      nextWs.on("error", (error) => {
        console.error(
          `[TranslationBridge:${this.options.targetLanguage}] Gemini reconnect error:`,
          error
        );
      });

      nextWs.on("close", (code: number, reason: Buffer) => {
        const reasonString = reason.toString();
        console.log(
          `[TranslationBridge:${this.options.targetLanguage}] Gemini reconnect WebSocket closed`,
          { code, reason: reasonString }
        );

        if (!this.canReconnect()) return;

        if (this.ws === nextWs) {
          this.setupComplete = false;
          setTimeout(() => void this.reconnect(), 1000);
        } else {
          this.isReconnecting = false;
          setTimeout(() => void this.reconnect(), 2000);
        }
      });
    } catch (error) {
      console.error(
        `[TranslationBridge:${this.options.targetLanguage}] Gemini reconnect initialization failed:`,
        error
      );
      this.isReconnecting = false;
      if (this.canReconnect()) {
        setTimeout(() => void this.reconnect(), 5000);
      }
    }
  }

  private handleInitialMessage(
    data: WebSocket.Data,
    onSetupComplete: () => void
  ): void {
    try {
      const message = this.parseMessage(data);
      if (!this.setupComplete) {
        console.log(
          `[TranslationBridge:${this.options.targetLanguage}] Gemini message (pre-setup):`,
          JSON.stringify(message).slice(0, 500)
        );
      }

      if (message.setupComplete) {
        console.log(
          `[TranslationBridge:${this.options.targetLanguage}] Gemini setup complete`
        );
        this.setupComplete = true;
        onSetupComplete();
        return;
      }

      this.handleServerMessage(message);
    } catch (error) {
      console.error(
        `[TranslationBridge:${this.options.targetLanguage}] Error parsing Gemini message:`,
        error
      );
    }
  }

  private handleServerMessage(message: GeminiServerMessage): void {
    const update = message.sessionResumptionUpdate;
    if (update?.resumable && update.newHandle) {
      this.resumptionHandle = update.newHandle;
      console.log(
        `[TranslationBridge:${this.options.targetLanguage}] Received sessionResumptionUpdate with newHandle: ${this.resumptionHandle}`
      );
    }

    if (message.goAway) {
      console.log(
        `[TranslationBridge:${this.options.targetLanguage}] Received goAway message from Gemini. Time left: ${message.goAway.timeLeft || "unknown"}. Initiating graceful session resumption...`
      );
      void this.reconnect();
    }

    this.options.onMessage(message);
  }

  private sendSetup(ws: WebSocket): void {
    const setup: GeminiSetup = {
      model: `models/${this.options.model}`,
      generationConfig: {
        responseModalities: ["AUDIO"],
        translationConfig: {
          targetLanguageCode: this.options.targetLanguage,
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
        triggerTokens: this.options.contextCompressionTriggerTokens,
        slidingWindow: {
          targetTokens: this.options.contextCompressionTargetTokens,
        },
      },
    };

    if (this.options.enableTranscription) {
      setup.outputAudioTranscription = {};
    }
    if (this.options.enableInputDiagnostics) {
      setup.inputAudioTranscription = {};
    }

    const setupMessage = { setup };
    console.log(
      `[TranslationBridge:${this.options.targetLanguage}] Sending Gemini setup (resuming: ${!!this.resumptionHandle}):`,
      JSON.stringify(setupMessage, null, 2)
    );
    ws.send(JSON.stringify(setupMessage));
  }

  private createWebSocket(): WebSocket {
    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${this.options.apiKey}`;
    return this.options.webSocketFactory?.(url) ?? new WebSocket(url);
  }

  private parseMessage(data: WebSocket.Data): GeminiServerMessage {
    return JSON.parse(data.toString()) as GeminiServerMessage;
  }

  private canReconnect(): boolean {
    return !this.isStopped && this.options.shouldReconnect();
  }
}
