export const API_ERROR_CODES = {
  CREATE_SESSION_FAILED: "create_session_failed",
  INCORRECT_PASSWORD: "incorrect_password",
  INVALID_LOCALE: "invalid_locale",
  INVALID_REQUEST: "invalid_request",
  INVALID_SESSION_DURATION: "invalid_session_duration",
  INVALID_SOURCE_LANGUAGE: "invalid_source_language",
  LANGUAGE_NOT_ALLOWED: "language_not_allowed",
  LIVEKIT_NOT_CONFIGURED: "livekit_not_configured",
  SESSION_INACTIVE: "session_inactive",
  SESSION_NOT_FOUND: "session_not_found",
  TARGET_LANGUAGE_MATCHES_SOURCE: "target_language_matches_source",
  TRANSLATION_START_FAILED: "translation_start_failed",
  UNSUPPORTED_SOURCE_LANGUAGE: "unsupported_source_language",
  UNSUPPORTED_TARGET_LANGUAGE: "unsupported_target_language",
  UNSUBSCRIBE_FAILED: "unsubscribe_failed",
} as const;

export type ApiErrorCode =
  (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

export type ApiErrorResponse = {
  code?: ApiErrorCode;
  error?: string;
  details?: Record<string, unknown>;
};

const API_ERROR_CODE_VALUES = new Set<string>(Object.values(API_ERROR_CODES));

export function apiError(
  code: ApiErrorCode,
  error: string,
  details?: Record<string, unknown>
): ApiErrorResponse {
  return details ? { code, error, details } : { code, error };
}

export function getApiErrorCode(payload: unknown): ApiErrorCode | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const code = (payload as { code?: unknown }).code;
  if (typeof code !== "string" || !API_ERROR_CODE_VALUES.has(code)) {
    return undefined;
  }

  return code as ApiErrorCode;
}
