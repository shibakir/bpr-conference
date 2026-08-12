import { type NextRequest, NextResponse } from "next/server";

import { API_ERROR_CODES, apiError } from "@/lib/api-errors";
import { parseSearchParams } from "@/lib/api-request";
import {
  translateStatusQuerySchema,
  zodErrorDetails,
} from "@/lib/api-schemas";
import TranslationSessionManager from "@/lib/translation-session-manager";

// GET /api/translate/status — List active translations for a session
export async function GET(req: NextRequest) {
  const parsed = parseSearchParams(
    req.nextUrl.searchParams,
    translateStatusQuerySchema,
  );
  if (!parsed.success) {
    return NextResponse.json(
      apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        "Missing sessionId parameter",
        zodErrorDetails(parsed.error),
      ),
      { status: 400 },
    );
  }

  const { sessionId } = parsed.data;
  const manager = TranslationSessionManager.getInstance();
  const translations = manager.getActiveTranslations(sessionId);

  return NextResponse.json({ translations });
}
