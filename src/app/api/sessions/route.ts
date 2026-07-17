import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { isLocale, routing, type Locale } from "@/i18n/routing";
import TranslationSessionManager from "@/lib/translation-session-manager";

interface CreateSessionRequest {
  organizerName?: unknown;
  password?: unknown;
  eventId?: unknown;
  locale?: unknown;
  allowedLanguages?: unknown;
}

function getSessionPath(locale: Locale, sessionId: string, mode: "watch" | "broadcast") {
  return `/${locale}/session/${sessionId}/${mode}`;
}

// POST /api/sessions — Create a new broadcast session
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as CreateSessionRequest;
    const organizerName = typeof body.organizerName === "string" ? body.organizerName : "organizer";
    const password = body.password;
    const eventId = body.eventId;
    let locale: Locale = routing.defaultLocale;

    if (body.locale !== undefined) {
      if (typeof body.locale !== "string" || !isLocale(body.locale)) {
        return NextResponse.json(
          { error: "Invalid locale" },
          { status: 400 }
        );
      }

      locale = body.locale;
    }

    let allowedLanguages: string[] | undefined = undefined;
    if (Array.isArray(body.allowedLanguages)) {
      allowedLanguages = body.allowedLanguages.filter(
        (language): language is string => typeof language === "string"
      );
    }

    const expectedPassword = process.env.BROADCAST_PASSWORD;
    if (expectedPassword && password !== expectedPassword) {
      return NextResponse.json(
        { error: "Incorrect password" },
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
    if (manager.getSession(sessionId)) {
      console.log(`[SessionsAPI] Overwriting existing session ${sessionId}. Tearing down previous bridges...`);
      await manager.removeAllTranslations(sessionId);
    }

    manager.createSession(sessionId, organizerIdentity, allowedLanguages);

    // Build the attendee join URL
    const protocol = req.headers.get("x-forwarded-proto") || "http";
    const host = req.headers.get("host") || "localhost:3000";
    const origin = `${protocol}://${host}`;
    const joinUrl = `${origin}${getSessionPath(locale, sessionId, "watch")}`;

    return NextResponse.json({
      sessionId,
      organizerIdentity,
      locale,
      joinUrl,
      broadcastUrl: `${origin}${getSessionPath(locale, sessionId, "broadcast")}`,
    });
  } catch (error) {
    console.error("Error creating session:", error);
    return NextResponse.json(
      { error: "Failed to create session" },
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
