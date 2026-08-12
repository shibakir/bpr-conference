import { type NextRequest, NextResponse } from "next/server";

import { API_ERROR_CODES, apiError } from "@/lib/api-errors";
import { parseJsonRequest } from "@/lib/api-request";
import { translationRequestSchema, zodErrorDetails } from "@/lib/api-schemas";
import { createLogger } from "@/lib/logger";
import TranslationSessionManager from "@/lib/translation-session-manager";

const log = createLogger({ route: "/api/translate/unsubscribe" });

// POST /api/translate/unsubscribe — Decrement subscriber count for a language
// Uses POST because navigator.sendBeacon only supports POST
export async function POST(req: NextRequest) {
    try {
        const parsed = await parseJsonRequest(req, translationRequestSchema);
        if (!parsed.success) {
            return NextResponse.json(
                apiError(
                    API_ERROR_CODES.INVALID_REQUEST,
                    "Missing sessionId or targetLanguage",
                    zodErrorDetails(parsed.error),
                ),
                { status: 400 },
            );
        }

        const { sessionId, targetLanguage } = parsed.data;
        const manager = TranslationSessionManager.getInstance();
        await manager.unsubscribe(sessionId, targetLanguage);

        return NextResponse.json({ success: true });
    } catch (error) {
        log.error({ err: error }, "Error unsubscribing from translation");
        return NextResponse.json(
            apiError(API_ERROR_CODES.UNSUBSCRIBE_FAILED, "Failed to unsubscribe"),
            { status: 500 },
        );
    }
}
