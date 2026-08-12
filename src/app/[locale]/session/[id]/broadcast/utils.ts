import { getConfiguredAttendeeOrigin } from "@/lib/public-origin";

export function subscribeToOrigin() {
  return () => {};
}

export function getClientOrigin() {
  return getConfiguredAttendeeOrigin() || window.location.origin;
}

export function getServerOrigin() {
  return getConfiguredAttendeeOrigin();
}

export async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.select();

  try {
    const copied = document.execCommand("copy");
    if (!copied) {
      throw new Error("Copy command was rejected");
    }
  } finally {
    document.body.removeChild(textArea);
  }
}
