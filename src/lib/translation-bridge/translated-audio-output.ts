import { AudioFrame, AudioSource } from "@livekit/rtc-node";

type QueuedTranslatedAudioFrame = {
  pcmBuffer: Buffer;
  durationMs: number;
  receivedAt: number;
  sequenceNumber: number;
};

export type TranslatedAudioOutputOptions = {
  targetLanguage: string;
  sampleRate: number;
  channels: number;
  maxBacklogMs: number;
  targetBacklogMs: number;
  backlogLogIntervalMs: number;
  backlogInfoThresholdMs: number;
  isClosed: () => boolean;
  onFramePublished: (geminiAudioReceivedAt: number, publishedAt: number) => void;
};

/**
 * Buffers PCM audio returned by Gemini and publishes it sequentially to a
 * LiveKit AudioSource. It bounds the queue to keep listeners close to live.
 */
export class TranslatedAudioOutput {
  private audioSource: AudioSource | null = null;
  private pendingFrames: QueuedTranslatedAudioFrame[] = [];
  private pendingDurationMs = 0;
  private isPublishing = false;
  private droppedFrames = 0;
  private droppedDurationMs = 0;
  private lastLoggedDroppedFrames = 0;
  private lastBacklogLogAt = 0;
  private lastBacklogWarningAt = 0;
  private lastPublishedAt = 0;

  constructor(private readonly options: TranslatedAudioOutputOptions) {}

  attach(audioSource: AudioSource): void {
    this.audioSource = audioSource;
  }

  detach(): void {
    this.audioSource = null;
    this.pendingFrames = [];
    this.pendingDurationMs = 0;
    this.isPublishing = false;
  }

  getTotalBacklogMs(): number {
    return this.getNativeQueueMs() + this.pendingDurationMs;
  }

  enqueue(
    base64Audio: string,
    receivedAt: number,
    sequenceNumber: number
  ): void {
    try {
      const pcmBuffer = Buffer.from(base64Audio, "base64");
      const durationMs = this.getPcmDurationMs(pcmBuffer);
      if (durationMs <= 0) return;

      this.pendingFrames.push({
        pcmBuffer,
        durationMs,
        receivedAt,
        sequenceNumber,
      });
      this.pendingDurationMs += durationMs;

      this.trimBacklog("enqueue", false);
      this.maybeLogBacklog();

      if (!this.isPublishing) {
        this.drain().catch((error) => {
          console.error(
            `[TranslationBridge:${this.options.targetLanguage}] Error draining translated audio queue:`,
            error
          );
        });
      }
    } catch (error) {
      console.error(
        `[TranslationBridge:${this.options.targetLanguage}] Error queueing translated audio frame:`,
        error
      );
    }
  }

  private async drain(): Promise<void> {
    if (this.isPublishing) return;

    this.isPublishing = true;
    try {
      while (this.pendingFrames.length > 0 && !this.options.isClosed()) {
        this.trimBacklog("drain", true);

        const queuedFrame = this.pendingFrames.shift();
        if (!queuedFrame) continue;

        this.pendingDurationMs = Math.max(
          this.pendingDurationMs - queuedFrame.durationMs,
          0
        );
        await this.publish(queuedFrame);
      }
    } finally {
      this.isPublishing = false;

      if (this.options.isClosed()) {
        this.pendingFrames = [];
        this.pendingDurationMs = 0;
      } else if (this.pendingFrames.length > 0) {
        this.drain().catch((error) => {
          console.error(
            `[TranslationBridge:${this.options.targetLanguage}] Error restarting translated audio queue drain:`,
            error
          );
        });
      }
    }
  }

  private async publish(queuedFrame: QueuedTranslatedAudioFrame): Promise<void> {
    const source = this.audioSource;
    if (!source || this.options.isClosed()) return;

    try {
      const int16 = new Int16Array(
        queuedFrame.pcmBuffer.buffer,
        queuedFrame.pcmBuffer.byteOffset,
        queuedFrame.pcmBuffer.byteLength / 2
      );
      const frame = new AudioFrame(
        int16,
        this.options.sampleRate,
        this.options.channels,
        int16.length
      );
      await source.captureFrame(frame);

      const now = Date.now();
      this.options.onFramePublished(queuedFrame.receivedAt, now);
      if (this.lastPublishedAt && now - this.lastPublishedAt > 2000) {
        console.log(
          `[TranslationBridge:${this.options.targetLanguage}] Audio resumed after ${now - this.lastPublishedAt}ms gap (frame #${queuedFrame.sequenceNumber})`
        );
      }
      this.lastPublishedAt = now;
      this.maybeLogBacklog();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("InvalidState") || message.includes("closed")) {
        console.warn(
          `[TranslationBridge:${this.options.targetLanguage}] AudioSource closed — stopping capture`
        );
        this.audioSource = null;
      } else {
        console.error(
          `[TranslationBridge:${this.options.targetLanguage}] Error capturing audio frame:`,
          error
        );
      }
    }
  }

  private getPcmDurationMs(pcmBuffer: Buffer): number {
    const samplesPerChannel = pcmBuffer.byteLength / 2 / this.options.channels;
    return (samplesPerChannel / this.options.sampleRate) * 1000;
  }

  private getNativeQueueMs(): number {
    return this.audioSource?.queuedDuration ?? 0;
  }

  private trimBacklog(
    reason: "enqueue" | "drain",
    allowNativeClear: boolean
  ): void {
    const source = this.audioSource;
    let nativeQueuedMs = this.getNativeQueueMs();
    const totalBeforeMs = nativeQueuedMs + this.pendingDurationMs;
    if (totalBeforeMs <= this.options.maxBacklogMs) return;

    let clearedNativeMs = 0;
    let droppedFrames = 0;
    let droppedDurationMs = 0;

    if (
      allowNativeClear &&
      source &&
      nativeQueuedMs > this.options.targetBacklogMs
    ) {
      source.clearQueue();
      clearedNativeMs = nativeQueuedMs;
      nativeQueuedMs = 0;
    }

    while (
      nativeQueuedMs + this.pendingDurationMs > this.options.targetBacklogMs &&
      this.pendingFrames.length > 1
    ) {
      const dropped = this.pendingFrames.shift();
      if (!dropped) break;

      this.pendingDurationMs = Math.max(
        this.pendingDurationMs - dropped.durationMs,
        0
      );
      droppedFrames++;
      droppedDurationMs += dropped.durationMs;
    }

    if (clearedNativeMs === 0 && droppedFrames === 0) return;

    this.droppedFrames += droppedFrames;
    this.droppedDurationMs += clearedNativeMs + droppedDurationMs;

    const now = Date.now();
    if (now - this.lastBacklogWarningAt < 2000) return;
    this.lastBacklogWarningAt = now;

    console.warn(
      `[TranslationBridge:${this.options.targetLanguage}] Output audio backlog capped during ${reason}: total=${Math.round(
        totalBeforeMs
      )}ms, clearedNative=${Math.round(
        clearedNativeMs
      )}ms, droppedPending=${droppedFrames} frames/${Math.round(
        droppedDurationMs
      )}ms, remaining=${Math.round(this.getTotalBacklogMs())}ms`
    );
  }

  private maybeLogBacklog(): void {
    const now = Date.now();
    if (now - this.lastBacklogLogAt < this.options.backlogLogIntervalMs) {
      return;
    }

    const nativeQueuedMs = this.getNativeQueueMs();
    const totalBacklogMs = nativeQueuedMs + this.pendingDurationMs;
    const droppedFramesChanged =
      this.droppedFrames !== this.lastLoggedDroppedFrames;

    if (
      totalBacklogMs < this.options.backlogInfoThresholdMs &&
      !droppedFramesChanged
    ) {
      return;
    }

    this.lastBacklogLogAt = now;
    this.lastLoggedDroppedFrames = this.droppedFrames;

    console.log(
      `[TranslationBridge:${this.options.targetLanguage}] Output audio backlog: total=${Math.round(
        totalBacklogMs
      )}ms, native=${Math.round(nativeQueuedMs)}ms, pending=${Math.round(
        this.pendingDurationMs
      )}ms, pendingFrames=${this.pendingFrames.length}, dropped=${
        this.droppedFrames
      } frames/${Math.round(this.droppedDurationMs)}ms`
    );
  }
}
