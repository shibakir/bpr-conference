import { type NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import type { z } from "zod";

import type { Locale } from "@/i18n/routing";
import { API_ERROR_CODES, apiError } from "@/lib/api-errors";
import { parseJsonRequest } from "@/lib/api-request";
import { createSessionRequestSchema, zodErrorDetails } from "@/lib/api-schemas";
import { getLanguageByCode } from "@/lib/languages";
import { createLogger } from "@/lib/logger";
import { getConfiguredAttendeeOrigin } from "@/lib/public-origin";
import { getBroadcastPassword } from "@/lib/server-env";
import { MAX_SESSION_DURATION_MINUTES, MIN_SESSION_DURATION_MINUTES } from "@/lib/session-duration";
import TranslationSessionManager from "@/lib/translation-session-manager";

const log = createLogger({ route: "/api/sessions" });

function getSessionPath(locale: Locale, sessionId: string, mode: "watch" | "broadcast") {
    return `/${locale}/session/${sessionId}/${mode}`;
}

function getRequestOrigin(req: NextRequest) {
    const protocol = req.headers.get("x-forwarded-proto") || "http";
    const host = req.headers.get("host") || "localhost:3000";

    return `${protocol}://${host}`;
}

function hasValidationIssue(error: z.ZodError, field: string) {
    return error.issues.some((issue) => issue.path[0] === field);
}

function invalidCreateSessionRequest(error: z.ZodError) {
    if (hasValidationIssue(error, "durationMinutes")) {
        return NextResponse.json(
            apiError(
                API_ERROR_CODES.INVALID_SESSION_DURATION,
                `Session duration must be between ${MIN_SESSION_DURATION_MINUTES} and ${MAX_SESSION_DURATION_MINUTES} minutes`,
                {
                    ...zodErrorDetails(error),
                    min: MIN_SESSION_DURATION_MINUTES,
                    max: MAX_SESSION_DURATION_MINUTES,
                },
            ),
            { status: 400 },
        );
    }

    if (hasValidationIssue(error, "locale")) {
        return NextResponse.json(
            apiError(API_ERROR_CODES.INVALID_LOCALE, "Invalid locale", zodErrorDetails(error)),
            { status: 400 },
        );
    }

    return NextResponse.json(
        apiError(
            API_ERROR_CODES.INVALID_REQUEST,
            "Invalid session request",
            zodErrorDetails(error),
        ),
        { status: 400 },
    );
}

// POST /api/sessions — Create a new broadcast session
export async function POST(req: NextRequest) {
    try {
        const parsed = await parseJsonRequest(req, createSessionRequestSchema);
        if (!parsed.success) {
            return invalidCreateSessionRequest(parsed.error);
        }

        const body = parsed.data;
        const { durationMinutes, eventId, inputLanguageMode, locale, organizerName, password } =
            body;
        let sourceLanguage: string | undefined = undefined;

        if (inputLanguageMode === "single") {
            if (!body.sourceLanguage) {
                return NextResponse.json(
                    apiError(API_ERROR_CODES.INVALID_SOURCE_LANGUAGE, "Invalid source language"),
                    { status: 400 },
                );
            }

            const source = getLanguageByCode(body.sourceLanguage);
            if (!source) {
                return NextResponse.json(
                    apiError(
                        API_ERROR_CODES.UNSUPPORTED_SOURCE_LANGUAGE,
                        "Unsupported source language",
                    ),
                    { status: 400 },
                );
            }

            sourceLanguage = source.code;
        }

        let enableAudioTranslation = body.enableAudioTranslation !== false;
        let enableTranscription = body.enableTranscription === true;

        if (body.translationOutputs !== undefined) {
            const translationOutputs = Array.from(new Set(body.translationOutputs));

            enableAudioTranslation = translationOutputs.includes("audio");
            enableTranscription = translationOutputs.includes("text");
        }

        let allowedLanguages: string[] | undefined = undefined;
        if (Array.isArray(body.allowedLanguages)) {
            const normalizedAllowedLanguages = body.allowedLanguages
                .filter((language): language is string => typeof language === "string")
                .map((language) => getLanguageByCode(language)?.code)
                .filter(
                    (language): language is string =>
                        typeof language === "string" &&
                        (inputLanguageMode !== "single" || language !== sourceLanguage),
                );

            allowedLanguages = Array.from(new Set(normalizedAllowedLanguages));
        }

        const expectedPassword = getBroadcastPassword();
        if (expectedPassword && password !== expectedPassword) {
            return NextResponse.json(
                apiError(API_ERROR_CODES.INCORRECT_PASSWORD, "Incorrect password"),
                { status: 401 },
            );
        }

        let sessionId: string;
        if (eventId && eventId.trim().length > 0) {
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
            log.info({ sessionId }, "Overwriting existing session; tearing down previous bridges");
            await manager.removeAllTranslations(sessionId);
        }

        manager.createSession(sessionId, organizerIdentity, {
            inputLanguageMode,
            enableAudioTranslation,
            enableTranscription,
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
        log.error({ err: error }, "Error creating session");
        return NextResponse.json(
            apiError(API_ERROR_CODES.CREATE_SESSION_FAILED, "Failed to create session"),
            { status: 500 },
        );
    }
}

// GET /api/sessions — List all active sessions
export async function GET() {
    const manager = TranslationSessionManager.getInstance();
    const sessions = manager.getAllSessions();
    return NextResponse.json({ sessions });
}
