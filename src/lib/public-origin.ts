export function normalizeOrigin(origin: string | undefined) {
  return origin?.trim().replace(/\/+$/, "") ?? "";
}

export function getConfiguredAttendeeOrigin() {
  return normalizeOrigin(process.env["NEXT_PUBLIC_ATTENDEE_ORIGIN"]);
}
