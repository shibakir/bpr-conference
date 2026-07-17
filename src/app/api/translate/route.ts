import { NextRequest, NextResponse } from "next/server";
import { getLanguageByCode } from "@/lib/languages";
import TranslationSessionManager from "@/lib/translation-session-manager";

// POST /api/translate — Request a translation stream for a language
export async function POST(req: NextRequest) {
  try {
    const { sessionId, targetLanguage, previousLanguage } = await req.json();

    if (!sessionId || !targetLanguage) {
      return NextResponse.json(
        { error: "Missing sessionId or targetLanguage" },
        { status: 400 }
      );
    }

    const manager = TranslationSessionManager.getInstance();
    const session = manager.getSession(sessionId);

    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    const normalizedTargetLanguage =
      targetLanguage === "original"
        ? "original"
        : getLanguageByCode(targetLanguage)?.code;

    if (!normalizedTargetLanguage) {
      return NextResponse.json(
        { error: `Unsupported target language "${targetLanguage}"` },
        { status: 400 }
      );
    }

    // Validate targetLanguage against source language and allowedLanguages allowlist
    if (
      normalizedTargetLanguage !== "original" &&
      normalizedTargetLanguage === session.sourceLanguage
    ) {
      return NextResponse.json(
        { error: "Target language matches the original audio language" },
        { status: 400 }
      );
    }

    if (
      normalizedTargetLanguage !== "original" &&
      session.allowedLanguages &&
      !session.allowedLanguages.includes(normalizedTargetLanguage)
    ) {
      return NextResponse.json(
        { error: `Language "${normalizedTargetLanguage}" is not allowed for this session` },
        { status: 400 }
      );
    }

    // Unsubscribe from the previous language if switching
    if (previousLanguage && previousLanguage !== "original") {
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

    // Get or create the translation bridge
    const bridge = await manager.getOrCreate(
      sessionId,
      normalizedTargetLanguage,
      session.organizerIdentity,
      {
        enableTranscription: session.enableTranscription,
      }
    );

    return NextResponse.json({
      translatorIdentity: bridge.identity,
      status: bridge.status,
      targetLanguage: bridge.targetLanguage,
    });
  } catch (error) {
    console.error("Error requesting translation:", error);
    return NextResponse.json(
      { error: "Failed to start translation: " + (error as Error).message },
      { status: 500 }
    );
  }
}

// DELETE /api/translate — Unsubscribe from a translation (e.g. on disconnect)
export async function DELETE(req: NextRequest) {
  try {
    const { sessionId, targetLanguage } = await req.json();

    if (!sessionId || !targetLanguage) {
      return NextResponse.json(
        { error: "Missing sessionId or targetLanguage" },
        { status: 400 }
      );
    }

    const manager = TranslationSessionManager.getInstance();
    await manager.unsubscribe(sessionId, targetLanguage);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error unsubscribing:", error);
    return NextResponse.json(
      { error: "Failed to unsubscribe" },
      { status: 500 }
    );
  }
}
