"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "watch_caption_window_preferences";

export type CaptionWindowSettings = {
  background: {
    r: number;
    g: number;
    b: number;
  };
  backgroundOpacity: number;
  textColor: string;
  fontSize: number;
  lineHeight: number;
  maxLines: number;
  width: number;
  height: number;
};

const DEFAULT_SETTINGS: CaptionWindowSettings = {
  background: {
    r: 0,
    g: 0,
    b: 0,
  },
  backgroundOpacity: 78,
  textColor: "#ffffff",
  fontSize: 28,
  lineHeight: 1.35,
  maxLines: 20,
  width: 720,
  height: 360,
};

const LIMITS = {
  color: { min: 0, max: 255 },
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

function normalizeHexColor(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_SETTINGS.textColor;
  return /^#[0-9a-f]{6}$/i.test(value) ? value : DEFAULT_SETTINGS.textColor;
}

function normalizeSettings(value: unknown): CaptionWindowSettings {
  const candidate =
    value && typeof value === "object"
      ? (value as Partial<CaptionWindowSettings>)
      : {};
  const background =
    candidate.background && typeof candidate.background === "object"
      ? candidate.background
      : DEFAULT_SETTINGS.background;

  return {
    background: {
      r: Math.round(
        clamp(Number(background.r), LIMITS.color.min, LIMITS.color.max)
      ),
      g: Math.round(
        clamp(Number(background.g), LIMITS.color.min, LIMITS.color.max)
      ),
      b: Math.round(
        clamp(Number(background.b), LIMITS.color.min, LIMITS.color.max)
      ),
    },
    backgroundOpacity: Math.round(
      clamp(
        Number(candidate.backgroundOpacity ?? DEFAULT_SETTINGS.backgroundOpacity),
        LIMITS.opacity.min,
        LIMITS.opacity.max
      )
    ),
    textColor: normalizeHexColor(candidate.textColor),
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
  return `rgba(${settings.background.r}, ${settings.background.g}, ${settings.background.b}, ${alpha})`;
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

  const updateBackground = useCallback(
    (channel: keyof CaptionWindowSettings["background"], value: number) => {
      setSettings((prev) =>
        normalizeSettings({
          ...prev,
          background: {
            ...prev.background,
            [channel]: value,
          },
        })
      );
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
    updateBackground,
    resetSettings,
  };
}
