export const MIN_SESSION_DURATION_MINUTES = 1;
export const MAX_SESSION_DURATION_MINUTES = 10;
export const DEFAULT_SESSION_DURATION_MINUTES = MAX_SESSION_DURATION_MINUTES;

export function parseSessionDurationMinutes(
  value: unknown
): number | undefined {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_SESSION_DURATION_MINUTES;
  }

  const duration =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  if (
    !Number.isInteger(duration) ||
    duration < MIN_SESSION_DURATION_MINUTES ||
    duration > MAX_SESSION_DURATION_MINUTES
  ) {
    return undefined;
  }

  return duration;
}

export function formatRemainingSessionTime(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
