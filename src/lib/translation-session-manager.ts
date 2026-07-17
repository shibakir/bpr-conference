/**
 * TranslationSessionManager: Singleton that enforces "max 1 Gemini Live API
 * session per language per room" constraint.
 *
 * Usage:
 *   const manager = TranslationSessionManager.getInstance();
 *   const bridge = await manager.getOrCreate(sessionId, targetLanguage, organizerIdentity);
 */

import { TranslationBridge, BridgeStatus } from "./translation-bridge";
import { RoomServiceClient, type ParticipantInfo } from "livekit-server-sdk";
import { DEFAULT_SESSION_DURATION_MINUTES } from "./session-duration";

export interface TranslationInfo {
  language: string;
  translatorIdentity: string;
  status: BridgeStatus;
  subscriberCount: number;
}

export interface SessionInfo {
  sessionId: string;
  organizerIdentity: string;
  createdAt: Date;
  durationMinutes: number;
  expiresAt: Date;
  sourceLanguage: string;
  enableTranscription: boolean;
  allowedLanguages?: string[];
}

const globalForSessionManager = global as unknown as {
  sessionManagerInstance: TranslationSessionManager;
};

function getPositiveNumberEnv(name: string, fallback: number): number {
  const rawValue = process.env[name];
  if (!rawValue) return fallback;

  const value = Number(rawValue);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getLiveKitApiUrl(): string {
  const configuredUrl = process.env.LIVEKIT_URL || "ws://localhost:7880";

  if (configuredUrl.startsWith("wss://")) {
    return `https://${configuredUrl.slice("wss://".length)}`;
  }

  if (configuredUrl.startsWith("ws://")) {
    return `http://${configuredUrl.slice("ws://".length)}`;
  }

  if (!/^https?:\/\//.test(configuredUrl)) {
    return `http://${configuredUrl}`;
  }

  return configuredUrl;
}

class TranslationSessionManager {
  // Map<sessionId, Map<languageCode, TranslationBridge>>
  private translations: Map<string, Map<string, TranslationBridge>> = new Map();

  // Map<sessionId, SessionInfo>
  private sessions: Map<string, SessionInfo> = new Map();

  private sessionExpirationTimers: Map<string, NodeJS.Timeout> = new Map();
  private roomServiceClient: RoomServiceClient | null = null;
  private reconcileInterval: NodeJS.Timeout | null = null;
  private reconcileInFlight: Promise<void> | null = null;
  private bridgeLastSubscriberSeenAt: WeakMap<TranslationBridge, number> =
    new WeakMap();
  private readonly reconcileIntervalMs = getPositiveNumberEnv(
    "TRANSLATION_RECONCILE_INTERVAL_MS",
    30_000
  );
  private readonly emptyBridgeGraceMs = getPositiveNumberEnv(
    "TRANSLATION_EMPTY_BRIDGE_GRACE_MS",
    60_000
  );

  private constructor() {}

  static getInstance(): TranslationSessionManager {
    if (!globalForSessionManager.sessionManagerInstance) {
      globalForSessionManager.sessionManagerInstance = new TranslationSessionManager();
    }
    return globalForSessionManager.sessionManagerInstance;
  }

  // Session management
  createSession(
    sessionId: string,
    organizerIdentity: string,
    options: {
      sourceLanguage: string;
      enableTranscription: boolean;
      allowedLanguages?: string[];
      durationMinutes?: number;
    }
  ): SessionInfo {
    const createdAt = new Date();
    const durationMinutes =
      options.durationMinutes ?? DEFAULT_SESSION_DURATION_MINUTES;
    const info: SessionInfo = {
      sessionId,
      organizerIdentity,
      createdAt,
      durationMinutes,
      expiresAt: new Date(createdAt.getTime() + durationMinutes * 60_000),
      sourceLanguage: options.sourceLanguage,
      enableTranscription: options.enableTranscription,
      allowedLanguages: options.allowedLanguages,
    };
    this.sessions.set(sessionId, info);
    this.scheduleSessionExpiration(info);
    console.log(
      `[SessionManager] Created session ${sessionId} for organizer ${organizerIdentity} with source language ${options.sourceLanguage}, transcriptions ${options.enableTranscription ? "enabled" : "disabled"}, duration ${durationMinutes}m, allowed languages: ${options.allowedLanguages?.join(", ") || "all"}`
    );
    return info;
  }

  getSession(sessionId: string): SessionInfo | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;

    if (this.hasSessionExpired(session)) {
      void this.expireSession(sessionId, session.expiresAt.getTime());
      return undefined;
    }

    return session;
  }

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId) || this.translations.has(sessionId);
  }

  // Translation management
  async getOrCreate(
    sessionId: string,
    targetLanguage: string,
    organizerIdentity: string,
    options: {
      enableTranscription?: boolean;
    } = {}
  ): Promise<TranslationBridge> {
    if (!this.getSession(sessionId)) {
      throw new Error("Session has ended");
    }

    // Check if we already have a bridge for this language
    let languageMap = this.translations.get(sessionId);
    if (languageMap) {
      const existingBridge = languageMap.get(targetLanguage);
      if (existingBridge && existingBridge.status === "active") {
        console.log(
          `[SessionManager] Reusing existing bridge for ${targetLanguage} in session ${sessionId}`
        );
        existingBridge.subscriberCount++;
        this.bridgeLastSubscriberSeenAt.set(existingBridge, Date.now());
        this.ensureReconcileTimer();
        return existingBridge;
      }
      // If bridge exists but is in error/closed state, clean it up
      if (existingBridge && (existingBridge.status === "error" || existingBridge.status === "closed")) {
        console.log(
          `[SessionManager] Cleaning up stale bridge for ${targetLanguage}`
        );
        await existingBridge.stop();
        this.cleanupBridgeReference(sessionId, targetLanguage, existingBridge);
        languageMap = this.translations.get(sessionId);
      }
    }

    // Create a new bridge
    console.log(
      `[SessionManager] Creating new bridge for ${targetLanguage} in session ${sessionId}`
    );

    const config = {
      geminiApiKey: process.env.GEMINI_API_KEY!,
      livekitUrl: process.env.LIVEKIT_URL || "ws://localhost:7880",
      livekitApiKey: process.env.LIVEKIT_API_KEY!,
      livekitApiSecret: process.env.LIVEKIT_API_SECRET!,
      enableTranscription: options.enableTranscription === true,
    };

    const bridge = new TranslationBridge(
      sessionId,
      targetLanguage,
      organizerIdentity,
      config
    );

    bridge.onStop = () => {
      this.cleanupBridgeReference(sessionId, targetLanguage, bridge);
    };

    // Store the bridge before starting (to prevent race conditions)
    if (!languageMap) {
      languageMap = new Map();
      this.translations.set(sessionId, languageMap);
    }
    languageMap.set(targetLanguage, bridge);
    this.bridgeLastSubscriberSeenAt.set(bridge, Date.now());
    this.ensureReconcileTimer();

    try {
      await bridge.start();
      bridge.subscriberCount = 1;
      return bridge;
    } catch (error) {
      // Clean up on failure
      this.cleanupBridgeReference(sessionId, targetLanguage, bridge);
      throw error;
    }
  }

  getActiveTranslations(sessionId: string): TranslationInfo[] {
    if (!this.getSession(sessionId)) return [];

    const languageMap = this.translations.get(sessionId);
    if (!languageMap) return [];

    const result: TranslationInfo[] = [];
    for (const [language, bridge] of languageMap) {
      result.push({
        language,
        translatorIdentity: bridge.identity,
        status: bridge.status,
        subscriberCount: bridge.subscriberCount,
      });
    }
    return result;
  }

  /**
   * Decrement subscriber count for a language. If the last subscriber
   * leaves, stop the bridge and tear down the Gemini session.
   */
  async unsubscribe(
    sessionId: string,
    targetLanguage: string
  ): Promise<void> {
    const languageMap = this.translations.get(sessionId);
    if (!languageMap) return;

    const bridge = languageMap.get(targetLanguage);
    if (!bridge) return;

    bridge.subscriberCount = Math.max(0, bridge.subscriberCount - 1);
    console.log(
      `[SessionManager] Unsubscribed from ${targetLanguage} in session ${sessionId} (${bridge.subscriberCount} remaining)`
    );

    if (bridge.subscriberCount === 0) {
      console.log(
        `[SessionManager] No more subscribers for ${targetLanguage}, tearing down bridge`
      );
      await bridge.stop();
      this.cleanupBridgeReference(sessionId, targetLanguage, bridge);
    }
  }

  async removeTranslation(
    sessionId: string,
    targetLanguage: string
  ): Promise<void> {
    const languageMap = this.translations.get(sessionId);
    if (!languageMap) return;

    const bridge = languageMap.get(targetLanguage);
    if (bridge) {
      await bridge.stop();
      this.cleanupBridgeReference(sessionId, targetLanguage, bridge);
      console.log(
        `[SessionManager] Removed bridge for ${targetLanguage} in session ${sessionId}`
      );
    }
  }

  async removeAllTranslations(sessionId: string): Promise<void> {
    this.clearSessionExpirationTimer(sessionId);

    const languageMap = this.translations.get(sessionId);
    if (languageMap) {
      for (const [, bridge] of languageMap) {
        await bridge.stop();
      }
      languageMap.clear();
      this.translations.delete(sessionId);
    }
    this.sessions.delete(sessionId);
    this.stopReconcileTimerIfIdle();
    await this.deleteLiveKitRoom(sessionId);
    console.log(
      `[SessionManager] Removed all bridges and session for ${sessionId}`
    );
  }

  getAllSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).filter((session) => {
      if (this.hasSessionExpired(session)) {
        void this.expireSession(session.sessionId, session.expiresAt.getTime());
        return false;
      }

      return true;
    });
  }

  private hasSessionExpired(session: SessionInfo): boolean {
    return session.expiresAt.getTime() <= Date.now();
  }

  private scheduleSessionExpiration(session: SessionInfo): void {
    this.clearSessionExpirationTimer(session.sessionId);

    const delayMs = session.expiresAt.getTime() - Date.now();
    if (delayMs <= 0) {
      void this.expireSession(session.sessionId, session.expiresAt.getTime());
      return;
    }

    const timeout = setTimeout(() => {
      void this.expireSession(session.sessionId, session.expiresAt.getTime());
    }, delayMs);

    timeout.unref?.();
    this.sessionExpirationTimers.set(session.sessionId, timeout);
  }

  private clearSessionExpirationTimer(sessionId: string): void {
    const timeout = this.sessionExpirationTimers.get(sessionId);
    if (timeout) {
      clearTimeout(timeout);
      this.sessionExpirationTimers.delete(sessionId);
    }
  }

  private async expireSession(
    sessionId: string,
    expectedExpiresAtMs: number
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.expiresAt.getTime() !== expectedExpiresAtMs) {
      return;
    }

    console.log(`[SessionManager] Session ${sessionId} reached its time limit`);
    await this.removeAllTranslations(sessionId);
  }

  private async deleteLiveKitRoom(sessionId: string): Promise<void> {
    const roomServiceClient = this.getRoomServiceClient();
    if (!roomServiceClient) return;

    try {
      await roomServiceClient.deleteRoom(sessionId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/not found|does not exist/i.test(message)) {
        return;
      }

      console.error(
        `[SessionManager] Failed to delete LiveKit room ${sessionId}:`,
        error
      );
    }
  }

  async reconcileActiveTranslations(): Promise<void> {
    if (this.reconcileInFlight) {
      return this.reconcileInFlight;
    }

    this.reconcileInFlight = this.reconcileActiveTranslationsOnce().finally(
      () => {
        this.reconcileInFlight = null;
      }
    );

    return this.reconcileInFlight;
  }

  private getRoomServiceClient(): RoomServiceClient | null {
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!apiKey || !apiSecret) {
      console.warn(
        "[SessionManager] LiveKit credentials are not configured; skipping LiveKit room operation."
      );
      return null;
    }

    if (!this.roomServiceClient) {
      this.roomServiceClient = new RoomServiceClient(
        getLiveKitApiUrl(),
        apiKey,
        apiSecret
      );
    }

    return this.roomServiceClient;
  }

  private ensureReconcileTimer(): void {
    if (this.reconcileInterval || this.translations.size === 0) return;

    this.reconcileInterval = setInterval(() => {
      void this.reconcileActiveTranslations().catch((error) => {
        console.error("[SessionManager] Translation reconcile failed:", error);
      });
    }, this.reconcileIntervalMs);

    this.reconcileInterval.unref?.();
  }

  private stopReconcileTimerIfIdle(): void {
    if (this.translations.size > 0 || !this.reconcileInterval) return;

    clearInterval(this.reconcileInterval);
    this.reconcileInterval = null;
  }

  private async reconcileActiveTranslationsOnce(): Promise<void> {
    if (this.translations.size === 0) {
      this.stopReconcileTimerIfIdle();
      return;
    }

    const roomServiceClient = this.getRoomServiceClient();
    if (!roomServiceClient) return;

    const now = Date.now();
    const sessionEntries = Array.from(this.translations.entries());

    for (const [sessionId, languageMap] of sessionEntries) {
      const bridges = Array.from(languageMap.entries());
      if (bridges.length === 0) continue;

      let participants: ParticipantInfo[];
      try {
        participants = await roomServiceClient.listParticipants(sessionId);
      } catch (error) {
        console.error(
          `[SessionManager] Failed to list LiveKit participants for session ${sessionId}:`,
          error
        );
        continue;
      }

      const session = this.getSession(sessionId);
      if (!session) continue;

      for (const [targetLanguage, bridge] of bridges) {
        if (this.translations.get(sessionId)?.get(targetLanguage) !== bridge) {
          continue;
        }

        if (bridge.status !== "active") {
          await this.stopBridge(
            sessionId,
            targetLanguage,
            bridge,
            `bridge status is ${bridge.status}`
          );
          continue;
        }

        const actualSubscriberCount = this.countLanguageSubscribers(
          participants,
          targetLanguage,
          session?.organizerIdentity,
          bridge.identity
        );

        if (actualSubscriberCount > 0) {
          if (bridge.subscriberCount !== actualSubscriberCount) {
            console.log(
              `[SessionManager] Reconciled ${targetLanguage} in session ${sessionId}: ${bridge.subscriberCount} -> ${actualSubscriberCount} subscribers`
            );
          }

          bridge.subscriberCount = actualSubscriberCount;
          this.bridgeLastSubscriberSeenAt.set(bridge, now);
          continue;
        }

        bridge.subscriberCount = 0;

        const lastSeenAt =
          this.bridgeLastSubscriberSeenAt.get(bridge) ?? now;
        if (now - lastSeenAt < this.emptyBridgeGraceMs) {
          continue;
        }

        await this.stopBridge(
          sessionId,
          targetLanguage,
          bridge,
          `no LiveKit participants have selected ${targetLanguage} for ${this.emptyBridgeGraceMs}ms`
        );
      }
    }
  }

  private countLanguageSubscribers(
    participants: ParticipantInfo[],
    targetLanguage: string,
    organizerIdentity: string | undefined,
    translatorIdentity: string
  ): number {
    return participants.filter((participant) => {
      const identity = participant.identity;
      if (!identity) return false;
      if (identity === organizerIdentity || identity === translatorIdentity) {
        return false;
      }
      if (
        identity.startsWith("organizer-") ||
        identity.startsWith("translator-")
      ) {
        return false;
      }

      return participant.attributes?.language === targetLanguage;
    }).length;
  }

  private async stopBridge(
    sessionId: string,
    targetLanguage: string,
    bridge: TranslationBridge,
    reason: string
  ): Promise<void> {
    if (this.translations.get(sessionId)?.get(targetLanguage) !== bridge) {
      return;
    }

    console.log(
      `[SessionManager] Stopping bridge for ${targetLanguage} in session ${sessionId}: ${reason}`
    );

    try {
      await bridge.stop();
    } finally {
      this.cleanupBridgeReference(sessionId, targetLanguage, bridge);
    }
  }

  private cleanupBridgeReference(
    sessionId: string,
    targetLanguage: string,
    bridge: TranslationBridge
  ): void {
    const languageMap = this.translations.get(sessionId);
    if (!languageMap) {
      this.bridgeLastSubscriberSeenAt.delete(bridge);
      this.stopReconcileTimerIfIdle();
      return;
    }

    if (languageMap.get(targetLanguage) === bridge) {
      languageMap.delete(targetLanguage);
      this.bridgeLastSubscriberSeenAt.delete(bridge);
    }

    if (languageMap.size === 0) {
      this.translations.delete(sessionId);
      console.log(
        `[SessionManager] Cleaned up active translations for session ${sessionId} as all translation bridges stopped.`
      );
    }

    this.stopReconcileTimerIfIdle();
  }
}

export default TranslationSessionManager;
