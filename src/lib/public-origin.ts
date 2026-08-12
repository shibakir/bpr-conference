import { clientEnv } from "../env/client";

export function normalizeOrigin(origin: string | undefined) {
  return origin?.trim().replace(/\/+$/, "") ?? "";
}

export function getConfiguredAttendeeOrigin() {
  return normalizeOrigin(clientEnv.NEXT_PUBLIC_ATTENDEE_ORIGIN);
}
