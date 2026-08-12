const DEFAULT_LIVEKIT_URL = "ws://localhost:7880";

type PositiveNumberEnvName =
  | "TRANSLATION_EMPTY_BRIDGE_GRACE_MS"
  | "TRANSLATION_RECONCILE_INTERVAL_MS";

export function getBroadcastPassword() {
  return process.env["BROADCAST_PASSWORD"];
}

export function getGeminiApiKey() {
  return process.env["GEMINI_API_KEY"];
}

export function getLiveKitUrl() {
  return process.env["LIVEKIT_URL"] || DEFAULT_LIVEKIT_URL;
}

export function getLiveKitCredentials() {
  const apiKey = process.env["LIVEKIT_API_KEY"];
  const apiSecret = process.env["LIVEKIT_API_SECRET"];

  if (!apiKey || !apiSecret) {
    return null;
  }

  return { apiKey, apiSecret };
}

export function getPositiveNumberEnv(
  name: PositiveNumberEnvName,
  fallback: number
) {
  const rawValue = process.env[name];
  if (!rawValue) return fallback;

  const value = Number(rawValue);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
