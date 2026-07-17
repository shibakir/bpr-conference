import { NextRequest, NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { API_ERROR_CODES, apiError } from "@/lib/api-errors";
import TranslationSessionManager from "@/lib/translation-session-manager";

// GET /api/token — Generate a LiveKit access token
export async function GET(req: NextRequest) {
  const room = req.nextUrl.searchParams.get("room");
  const identity = req.nextUrl.searchParams.get("identity");
  const role = req.nextUrl.searchParams.get("role") || "attendee";

  if (!room || !identity) {
    return NextResponse.json(
      apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        "Missing room or identity parameter"
      ),
      { status: 400 }
    );
  }

  const isOrganizer = role === "organizer";

  const expectedPassword = process.env.BROADCAST_PASSWORD;
  if (isOrganizer && expectedPassword) {
    const password = req.nextUrl.searchParams.get("password");
    if (password !== expectedPassword) {
      return NextResponse.json(
        apiError(API_ERROR_CODES.INCORRECT_PASSWORD, "Incorrect password"),
        { status: 401 }
      );
    }
  }

  const manager = TranslationSessionManager.getInstance();
  const session = manager.getSession(room);
  console.log(`[TokenAPI] Checking session for room "${room}". Found session:`, session);
  if (!session) {
    return NextResponse.json(
      apiError(
        API_ERROR_CODES.SESSION_INACTIVE,
        "Broadcast session has not started yet or has ended"
      ),
      { status: 404 }
    );
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!apiKey || !apiSecret) {
    return NextResponse.json(
      apiError(
        API_ERROR_CODES.LIVEKIT_NOT_CONFIGURED,
        "LiveKit credentials not configured"
      ),
      { status: 500 }
    );
  }

  const remainingSeconds = Math.max(
    1,
    Math.ceil((session.expiresAt.getTime() - Date.now()) / 1000)
  );
  const at = new AccessToken(apiKey, apiSecret, {
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
  const serverUrl = process.env.LIVEKIT_URL || "ws://localhost:7880";

  return NextResponse.json({
    token,
    serverUrl,
    durationMinutes: session.durationMinutes,
    expiresAt: session.expiresAt.toISOString(),
  });
}
