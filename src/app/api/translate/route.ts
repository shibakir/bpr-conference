import { type NextRequest, NextResponse } from "next/server";

import { API_ERROR_CODES, apiError } from "@/lib/api-errors";
import { readJsonObject } from "@/lib/api-request";
import { getLanguageByCode } from "@/lib/languages";
import TranslationSessionManager from "@/lib/translation-session-manager";

interface TranslationRequest {
  previousLanguage?: unknown;
  sessionId?: unknown;
  targetLanguage?: unknown;
}

// POST /api/translate — Request a translation stream for a language
export async function POST(req: NextRequest) {
  try {
    const body: TranslationRequest = await readJsonObject(req);
    const { previousLanguage, sessionId, targetLanguage } = body;

    if (typeof sessionId !== "string" || typeof targetLanguage !== "string") {
      return NextResponse.json(
        apiError(
          API_ERROR_CODES.INVALID_REQUEST,
          "Missing sessionId or targetLanguage"
        ),
        { status: 400 }
      );
    }

    const manager = TranslationSessionManager.getInstance();
    const session = manager.getSession(sessionId);

    if (!session) {
      return NextResponse.json(
        apiError(API_ERROR_CODES.SESSION_NOT_FOUND, "Session not found"),
        { status: 404 }
      );
    }

    const normalizedTargetLanguage =
      targetLanguage === "original"
        ? "original"
        : getLanguageByCode(targetLanguage)?.code;

    if (!normalizedTargetLanguage) {
      return NextResponse.json(
        apiError(
          API_ERROR_CODES.UNSUPPORTED_TARGET_LANGUAGE,
          `Unsupported target language "${targetLanguage}"`,
          { targetLanguage }
        ),
        { status: 400 }
      );
    }

    // Validate targetLanguage against source language and allowedLanguages allowlist
    if (
      session.inputLanguageMode === "single" &&
      normalizedTargetLanguage !== "original" &&
      normalizedTargetLanguage === session.sourceLanguage
    ) {
      return NextResponse.json(
        apiError(
          API_ERROR_CODES.TARGET_LANGUAGE_MATCHES_SOURCE,
          "Target language matches the original audio language"
        ),
        { status: 400 }
      );
    }

    if (
      normalizedTargetLanguage !== "original" &&
      session.allowedLanguages &&
      !session.allowedLanguages.includes(normalizedTargetLanguage)
    ) {
      return NextResponse.json(
        apiError(
          API_ERROR_CODES.LANGUAGE_NOT_ALLOWED,
          `Language "${normalizedTargetLanguage}" is not allowed for this session`,
          { language: normalizedTargetLanguage }
        ),
        { status: 400 }
      );
    }

    // Unsubscribe from the previous language if switching
    if (
      typeof previousLanguage === "string" &&
      previousLanguage !== "original"
    ) {
      const normalizedPreviousLanguage =
        getLanguageByCode(previousLanguage)?.code ?? previousLanguage;
      await manager.unsubscribe(sessionId, normalizedPreviousLanguage);
    }

    // Skip translation for the original language (no bridge needed)
    if (normalizedTargetLanguage === "original") {
      return NextResponse.json({
        translatorIdentity: null,
        status: "original",
        message: "Using original audio",
      });
    }

    const enableAudioTranslation = session.enableAudioTranslation !== false;

    if (!enableAudioTranslation && !session.enableTranscription) {
      return NextResponse.json(
        apiError(
          API_ERROR_CODES.TRANSLATION_OUTPUTS_DISABLED,
          "Translation outputs are disabled for this session"
        ),
        { status: 400 }
      );
    }

    // Get or create the translation bridge
    const bridge = await manager.getOrCreate(
      sessionId,
      normalizedTargetLanguage,
      session.organizerIdentity,
      {
        enableAudioTranslation,
        enableTranscription: session.enableTranscription,
      }
    );

    return NextResponse.json({
      translatorIdentity: bridge.identity,
      status: bridge.status,
      targetLanguage: bridge.targetLanguage,
      enableAudioTranslation,
      enableTranscription: session.enableTranscription,
    });
  } catch (error) {
    console.error("Error requesting translation:", error);
    const message = error instanceof Error ? error.message : String(error);
    if (message === "Session has ended") {
      return NextResponse.json(
        apiError(API_ERROR_CODES.SESSION_INACTIVE, "Session has ended"),
        { status: 410 }
      );
    }

    return NextResponse.json(
      apiError(
        API_ERROR_CODES.TRANSLATION_START_FAILED,
        "Failed to start translation"
      ),
      { status: 500 }
    );
  }
}

// DELETE /api/translate — Unsubscribe from a translation (e.g. on disconnect)
export async function DELETE(req: NextRequest) {
  try {
    const body: TranslationRequest = await readJsonObject(req);
    const { sessionId, targetLanguage } = body;

    if (typeof sessionId !== "string" || typeof targetLanguage !== "string") {
      return NextResponse.json(
        apiError(
          API_ERROR_CODES.INVALID_REQUEST,
          "Missing sessionId or targetLanguage"
        ),
        { status: 400 }
      );
    }

    const manager = TranslationSessionManager.getInstance();
    await manager.unsubscribe(sessionId, targetLanguage);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error unsubscribing:", error);
    return NextResponse.json(
      apiError(API_ERROR_CODES.UNSUBSCRIBE_FAILED, "Failed to unsubscribe"),
      { status: 500 }
    );
  }
}
