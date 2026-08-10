"use client";

import { useEffect, useState } from "react";

type NavigatorWithWakeLock = Navigator & {
  wakeLock: {
    request: (type: "screen") => Promise<WakeLockSentinel>;
  };
};

export function useWakeLock() {
  const [isWakeLockActive, setIsWakeLockActive] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("wakeLock" in navigator)) {
      return;
    }

    let wakeLock: WakeLockSentinel | null = null;

    async function requestWakeLock() {
      try {
        wakeLock = await (navigator as NavigatorWithWakeLock).wakeLock.request(
          "screen"
        );
        setIsWakeLockActive(true);

        wakeLock.addEventListener("release", () => {
          setIsWakeLockActive(false);
        });
      } catch (err) {
        console.error("Failed to acquire Screen Wake Lock:", err);
      }
    }

    requestWakeLock();

    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible" && !wakeLock) {
        await requestWakeLock();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (wakeLock) {
        wakeLock.release().catch((err: unknown) => {
          console.error("Failed to release Screen Wake Lock:", err);
        });
      }
    };
  }, []);

  return isWakeLockActive;
}
