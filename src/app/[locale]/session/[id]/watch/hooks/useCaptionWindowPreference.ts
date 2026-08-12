"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "watch_caption_window_preferences";

export type CaptionWindowSettings = {
  backgroundColor: string;
  backgroundOpacity: number;
  textColor: string;
  fontSize: number;
  lineHeight: number;
  maxLines: number;
  width: number;
  height: number;
};

const DEFAULT_SETTINGS: CaptionWindowSettings = {
  backgroundColor: "#000000",
  backgroundOpacity: 78,
  textColor: "#ffffff",
  fontSize: 28,
  lineHeight: 1.35,
  maxLines: 20,
  width: 720,
  height: 360,
};

const LIMITS = {
  opacity: { min: 0, max: 100 },
  fontSize: { min: 16, max: 56 },
  lineHeight: { min: 1.1, max: 1.8 },
  maxLines: { min: 2, max: 40 },
  width: { min: 360, max: 1280 },
  height: { min: 180, max: 720 },
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  return /^#[0-9a-f]{6}$/i.test(value)
    ? value.toLowerCase()
    : fallback;
}

function normalizeBackgroundColor(
  candidate: Partial<CaptionWindowSettings> & {
    background?: { r?: unknown; g?: unknown; b?: unknown };
  }
): string {
  if (typeof candidate.backgroundColor === "string") {
    return normalizeHexColor(
      candidate.backgroundColor,
      DEFAULT_SETTINGS.backgroundColor
    );
  }

  const background = candidate.background;
  if (!background || typeof background !== "object") {
    return DEFAULT_SETTINGS.backgroundColor;
  }

  return `#${(["r", "g", "b"] as const)
    .map((channel) =>
      Math.round(clamp(Number(background[channel]), 0, 255))
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;
}

function normalizeSettings(value: unknown): CaptionWindowSettings {
  const candidate =
    value && typeof value === "object"
      ? (value as Partial<CaptionWindowSettings>)
      : {};

  return {
    backgroundColor: normalizeBackgroundColor(candidate),
    backgroundOpacity: Math.round(
      clamp(
        Number(candidate.backgroundOpacity ?? DEFAULT_SETTINGS.backgroundOpacity),
        LIMITS.opacity.min,
        LIMITS.opacity.max
      )
    ),
    textColor: normalizeHexColor(candidate.textColor, DEFAULT_SETTINGS.textColor),
    fontSize: Math.round(
      clamp(
        Number(candidate.fontSize ?? DEFAULT_SETTINGS.fontSize),
        LIMITS.fontSize.min,
        LIMITS.fontSize.max
      )
    ),
    lineHeight:
      Math.round(
        clamp(
          Number(candidate.lineHeight ?? DEFAULT_SETTINGS.lineHeight),
          LIMITS.lineHeight.min,
          LIMITS.lineHeight.max
        ) * 100
      ) / 100,
    maxLines: Math.round(
      clamp(
        Number(candidate.maxLines ?? DEFAULT_SETTINGS.maxLines),
        LIMITS.maxLines.min,
        LIMITS.maxLines.max
      )
    ),
    width: Math.round(
      clamp(
        Number(candidate.width ?? DEFAULT_SETTINGS.width),
        LIMITS.width.min,
        LIMITS.width.max
      )
    ),
    height: Math.round(
      clamp(
        Number(candidate.height ?? DEFAULT_SETTINGS.height),
        LIMITS.height.min,
        LIMITS.height.max
      )
    ),
  };
}

function readStoredSettings(): CaptionWindowSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? normalizeSettings(JSON.parse(saved)) : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function getCaptionBackground(settings: CaptionWindowSettings): string {
  const alpha = settings.backgroundOpacity / 100;
  const value = Number.parseInt(settings.backgroundColor.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function useCaptionWindowPreference() {
  const [settings, setSettings] =
    useState<CaptionWindowSettings>(readStoredSettings);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Ignore storage failures. The current in-memory settings still apply.
    }
  }, [settings]);

  const updateSettings = useCallback(
    (patch: Partial<CaptionWindowSettings>) => {
      setSettings((prev) => normalizeSettings({ ...prev, ...patch }));
    },
    []
  );

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  return {
    settings,
    limits: LIMITS,
    updateSettings,
    resetSettings,
  };
}
