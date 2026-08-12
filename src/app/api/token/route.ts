import { AccessToken } from "livekit-server-sdk";
import { type NextRequest, NextResponse } from "next/server";

import { API_ERROR_CODES, apiError } from "@/lib/api-errors";
import { parseSearchParams } from "@/lib/api-request";
import { tokenQuerySchema, zodErrorDetails } from "@/lib/api-schemas";
import { createLogger } from "@/lib/logger";
import { getBroadcastPassword, getLiveKitCredentials, getLiveKitUrl } from "@/lib/server-env";
import TranslationSessionManager from "@/lib/translation-session-manager";

const log = createLogger({ route: "/api/token" });

// GET /api/token — Generate a LiveKit access token
export async function GET(req: NextRequest) {
    const parsed = parseSearchParams(req.nextUrl.searchParams, tokenQuerySchema);
    if (!parsed.success) {
        return NextResponse.json(
            apiError(
                API_ERROR_CODES.INVALID_REQUEST,
                "Missing room or identity parameter",
                zodErrorDetails(parsed.error),
            ),
            { status: 400 },
        );
    }

    const { identity, password, role, room } = parsed.data;
    const isOrganizer = role === "organizer";

    const expectedPassword = getBroadcastPassword();
    if (isOrganizer && expectedPassword) {
        if (password !== expectedPassword) {
            return NextResponse.json(
                apiError(API_ERROR_CODES.INCORRECT_PASSWORD, "Incorrect password"),
                { status: 401 },
            );
        }
    }

    const manager = TranslationSessionManager.getInstance();
    const session = manager.getSession(room);
    log.info({ found: !!session, room }, "Checking session for token request");
    if (!session) {
        return NextResponse.json(
            apiError(
                API_ERROR_CODES.SESSION_INACTIVE,
                "Broadcast session has not started yet or has ended",
            ),
            { status: 404 },
        );
    }

    const credentials = getLiveKitCredentials();

    if (!credentials) {
        return NextResponse.json(
            apiError(API_ERROR_CODES.LIVEKIT_NOT_CONFIGURED, "LiveKit credentials not configured"),
            { status: 500 },
        );
    }

    const remainingSeconds = Math.max(
        1,
        Math.ceil((session.expiresAt.getTime() - Date.now()) / 1000),
    );
    const at = new AccessToken(credentials.apiKey, credentials.apiSecret, {
        identity,
        name: identity,
        ttl: remainingSeconds,
    });

    at.addGrant({
        roomJoin: true,
        room,
        canPublish: isOrganizer,
        canSubscribe: true,
        canPublishData: isOrganizer,
        canUpdateOwnMetadata: true,
    });

    const token = await at.toJwt();
    const serverUrl = getLiveKitUrl();

    return NextResponse.json({
        token,
        serverUrl,
        durationMinutes: session.durationMinutes,
        expiresAt: session.expiresAt.toISOString(),
    });
}
