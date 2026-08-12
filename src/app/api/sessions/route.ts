import { type NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

import { isLocale, type Locale,routing } from "@/i18n/routing";
import { API_ERROR_CODES, apiError } from "@/lib/api-errors";
import { readJsonObject } from "@/lib/api-request";
import { getLanguageByCode } from "@/lib/languages";
import { getConfiguredAttendeeOrigin } from "@/lib/public-origin";
import { getBroadcastPassword } from "@/lib/server-env";
import {
  MAX_SESSION_DURATION_MINUTES,
  MIN_SESSION_DURATION_MINUTES,
  parseSessionDurationMinutes,
} from "@/lib/session-duration";
import {
  type InputLanguageMode,
  isTranslationOutputMode,
} from "@/lib/session-types";
import TranslationSessionManager from "@/lib/translation-session-manager";

interface CreateSessionRequest {
  organizerName?: unknown;
  password?: unknown;
  eventId?: unknown;
  locale?: unknown;
  allowedLanguages?: unknown;
  inputLanguageMode?: unknown;
  sourceLanguage?: unknown;
  translationOutputs?: unknown;
  enableAudioTranslation?: unknown;
  enableTranscription?: unknown;
  enableInputDiagnostics?: unknown;
  durationMinutes?: unknown;
}

function getSessionPath(locale: Locale, sessionId: string, mode: "watch" | "broadcast") {
  return `/${locale}/session/${sessionId}/${mode}`;
}

function getRequestOrigin(req: NextRequest) {
  const protocol = req.headers.get("x-forwarded-proto") || "http";
  const host = req.headers.get("host") || "localhost:3000";

  return `${protocol}://${host}`;
}

// POST /api/sessions — Create a new broadcast session
export async function POST(req: NextRequest) {
  try {
    const body: CreateSessionRequest = await readJsonObject(req);
    const organizerName = typeof body.organizerName === "string" ? body.organizerName : "organizer";
    const password = body.password;
    const eventId = body.eventId;
    let locale: Locale = routing.defaultLocale;
    const durationMinutes = parseSessionDurationMinutes(body.durationMinutes);

    if (durationMinutes === undefined) {
      return NextResponse.json(
        apiError(
          API_ERROR_CODES.INVALID_SESSION_DURATION,
          `Session duration must be between ${MIN_SESSION_DURATION_MINUTES} and ${MAX_SESSION_DURATION_MINUTES} minutes`,
          {
            min: MIN_SESSION_DURATION_MINUTES,
            max: MAX_SESSION_DURATION_MINUTES,
          }
        ),
        { status: 400 }
      );
    }

    if (body.locale !== undefined) {
      if (typeof body.locale !== "string" || !isLocale(body.locale)) {
        return NextResponse.json(
          apiError(API_ERROR_CODES.INVALID_LOCALE, "Invalid locale"),
          { status: 400 }
        );
      }

      locale = body.locale;
    }

    if (
      body.inputLanguageMode !== undefined &&
      body.inputLanguageMode !== "single" &&
      body.inputLanguageMode !== "multi"
    ) {
      return NextResponse.json(
        apiError(API_ERROR_CODES.INVALID_REQUEST, "Invalid input language mode"),
        { status: 400 }
      );
    }

    const inputLanguageMode: InputLanguageMode =
      body.inputLanguageMode === "single" ? "single" : "multi";
    let sourceLanguage: string | undefined = undefined;

    if (inputLanguageMode === "single") {
      if (typeof body.sourceLanguage !== "string") {
        return NextResponse.json(
          apiError(
            API_ERROR_CODES.INVALID_SOURCE_LANGUAGE,
            "Invalid source language"
          ),
          { status: 400 }
        );
      }

      const source = getLanguageByCode(body.sourceLanguage);
      if (!source) {
        return NextResponse.json(
          apiError(
            API_ERROR_CODES.UNSUPPORTED_SOURCE_LANGUAGE,
            "Unsupported source language"
          ),
          { status: 400 }
        );
      }

      sourceLanguage = source.code;
    }

    let enableAudioTranslation = body.enableAudioTranslation !== false;
    let enableTranscription = body.enableTranscription === true;

    if (body.translationOutputs !== undefined) {
      if (!Array.isArray(body.translationOutputs)) {
        return NextResponse.json(
          apiError(API_ERROR_CODES.INVALID_REQUEST, "Invalid translation outputs"),
          { status: 400 }
        );
      }

      if (!body.translationOutputs.every(isTranslationOutputMode)) {
        return NextResponse.json(
          apiError(API_ERROR_CODES.INVALID_REQUEST, "Invalid translation outputs"),
          { status: 400 }
        );
      }

      const translationOutputs = Array.from(
        new Set(body.translationOutputs)
      );

      enableAudioTranslation = translationOutputs.includes("audio");
      enableTranscription = translationOutputs.includes("text");
    }

    const enableInputDiagnostics = body.enableInputDiagnostics === true;

    let allowedLanguages: string[] | undefined = undefined;
    if (Array.isArray(body.allowedLanguages)) {
      const normalizedAllowedLanguages = body.allowedLanguages
        .filter((language): language is string => typeof language === "string")
        .map((language) => getLanguageByCode(language)?.code)
        .filter(
          (language): language is string =>
            typeof language === "string" &&
            (inputLanguageMode !== "single" || language !== sourceLanguage)
        );

      allowedLanguages = Array.from(new Set(normalizedAllowedLanguages));
    }

    const expectedPassword = getBroadcastPassword();
    if (expectedPassword && password !== expectedPassword) {
      return NextResponse.json(
        apiError(API_ERROR_CODES.INCORRECT_PASSWORD, "Incorrect password"),
        { status: 401 }
      );
    }

    let sessionId: string;
    if (eventId && typeof eventId === "string" && eventId.trim().length > 0) {
      // Sanitize: lowercase, replace spaces/special chars with hyphens, allow alphanumeric, -, _
      sessionId = eventId
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, "-")
        .replace(/^-+|-+$/g, "");

      if (sessionId.length === 0) {
        sessionId = uuidv4().slice(0, 8);
      }
    } else {
      sessionId = uuidv4().slice(0, 8); // Short, readable ID
    }

    const organizerIdentity = `organizer-${organizerName}`;

    const manager = TranslationSessionManager.getInstance();

    // Clean up any stale translations/livekit rooms or translator bots from previous sessions under the same ID
    if (manager.hasSession(sessionId)) {
      console.log(`[SessionsAPI] Overwriting existing session ${sessionId}. Tearing down previous bridges...`);
      await manager.removeAllTranslations(sessionId);
    }

    manager.createSession(sessionId, organizerIdentity, {
      inputLanguageMode,
      enableAudioTranslation,
      enableTranscription,
      enableInputDiagnostics,
      durationMinutes,
      ...(sourceLanguage ? { sourceLanguage } : {}),
      ...(allowedLanguages ? { allowedLanguages } : {}),
    });
    const session = manager.getSession(sessionId);

    const requestOrigin = getRequestOrigin(req);
    const attendeeOrigin = getConfiguredAttendeeOrigin() || requestOrigin;
    const joinUrl = `${attendeeOrigin}${getSessionPath(locale, sessionId, "watch")}`;

    return NextResponse.json({
      sessionId,
      organizerIdentity,
      locale,
      inputLanguageMode,
      sourceLanguage,
      enableAudioTranslation,
      enableTranscription,
      enableInputDiagnostics,
      translationOutputs: [
        ...(enableAudioTranslation ? ["audio"] : []),
        ...(enableTranscription ? ["text"] : []),
      ],
      durationMinutes,
      expiresAt: session?.expiresAt.toISOString(),
      joinUrl,
      broadcastUrl: `${requestOrigin}${getSessionPath(locale, sessionId, "broadcast")}`,
    });
  } catch (error) {
    console.error("Error creating session:", error);
    return NextResponse.json(
      apiError(API_ERROR_CODES.CREATE_SESSION_FAILED, "Failed to create session"),
      { status: 500 }
    );
  }
}

// GET /api/sessions — List all active sessions
export async function GET() {
  const manager = TranslationSessionManager.getInstance();
  const sessions = manager.getAllSessions();
  return NextResponse.json({ sessions });
}
