"use client";

import { useCallback, useEffect, useState } from "react";
import { z } from "zod";

const STORAGE_KEY = "watch_caption_window_preferences";

export const CAPTION_FONT_OPTIONS = [
    {
        value: "geist",
        label: "Geist",
        css: '"Geist", "Geist Fallback", ui-sans-serif, system-ui, sans-serif',
    },
    {
        value: "system",
        label: "System UI",
        css: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },
    {
        value: "arial",
        label: "Arial",
        css: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
    },
    {
        value: "verdana",
        label: "Verdana",
        css: "Verdana, Geneva, sans-serif",
    },
    {
        value: "georgia",
        label: "Georgia",
        css: "Georgia, serif",
    },
    {
        value: "times",
        label: "Times New Roman",
        css: '"Times New Roman", Times, serif',
    },
    {
        value: "courier",
        label: "Courier New",
        css: '"Courier New", Courier, monospace',
    },
] as const;

export type CaptionFontFamily = (typeof CAPTION_FONT_OPTIONS)[number]["value"];

const CAPTION_FONT_FAMILIES = CAPTION_FONT_OPTIONS.map((option) => option.value) as [
    CaptionFontFamily,
    ...CaptionFontFamily[],
];

export type CaptionWindowSettings = {
    backgroundColor: string;
    backgroundOpacity: number;
    textColor: string;
    fontFamily: CaptionFontFamily;
    fontSize: number;
    lineHeight: number;
    maxLines: number;
};

const DEFAULT_SETTINGS: CaptionWindowSettings = {
    backgroundColor: "#000000",
    backgroundOpacity: 78,
    textColor: "#ffffff",
    fontFamily: "geist",
    fontSize: 28,
    lineHeight: 1.35,
    maxLines: 20,
};

const LIMITS = {
    opacity: { min: 0, max: 100 },
    fontSize: { min: 16, max: 56 },
    lineHeight: { min: 1.1, max: 1.8 },
    maxLines: { min: 2, max: 40 },
};

const hexColorSchema = z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .transform((value) => value.toLowerCase());

const legacyBackgroundSchema = z.object({
    b: z.coerce.number(),
    g: z.coerce.number(),
    r: z.coerce.number(),
});

const persistedSettingsSchema = z.object({
    background: legacyBackgroundSchema.optional(),
    backgroundColor: hexColorSchema.optional(),
    backgroundOpacity: z.coerce.number().optional(),
    fontFamily: z.enum(CAPTION_FONT_FAMILIES).optional(),
    fontSize: z.coerce.number().optional(),
    lineHeight: z.coerce.number().optional(),
    maxLines: z.coerce.number().optional(),
    textColor: hexColorSchema.optional(),
});

function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, value));
}

function normalizeBackgroundColor(candidate: z.infer<typeof persistedSettingsSchema>): string {
    if (candidate.backgroundColor) {
        return candidate.backgroundColor;
    }

    const background = candidate.background;
    if (!background || typeof background !== "object") {
        return DEFAULT_SETTINGS.backgroundColor;
    }

    return `#${(["r", "g", "b"] as const)
        .map((channel) =>
            Math.round(clamp(Number(background[channel]), 0, 255))
                .toString(16)
                .padStart(2, "0"),
        )
        .join("")}`;
}

function normalizeSettings(value: unknown): CaptionWindowSettings {
    const parsed = persistedSettingsSchema.safeParse(value);
    const candidate = parsed.success ? parsed.data : {};

    return {
        backgroundColor: normalizeBackgroundColor(candidate),
        backgroundOpacity: Math.round(
            clamp(
                Number(candidate.backgroundOpacity ?? DEFAULT_SETTINGS.backgroundOpacity),
                LIMITS.opacity.min,
                LIMITS.opacity.max,
            ),
        ),
        textColor: candidate.textColor ?? DEFAULT_SETTINGS.textColor,
        fontFamily: candidate.fontFamily ?? DEFAULT_SETTINGS.fontFamily,
        fontSize: Math.round(
            clamp(
                Number(candidate.fontSize ?? DEFAULT_SETTINGS.fontSize),
                LIMITS.fontSize.min,
                LIMITS.fontSize.max,
            ),
        ),
        lineHeight:
            Math.round(
                clamp(
                    Number(candidate.lineHeight ?? DEFAULT_SETTINGS.lineHeight),
                    LIMITS.lineHeight.min,
                    LIMITS.lineHeight.max,
                ) * 100,
            ) / 100,
        maxLines: Math.round(
            clamp(
                Number(candidate.maxLines ?? DEFAULT_SETTINGS.maxLines),
                LIMITS.maxLines.min,
                LIMITS.maxLines.max,
            ),
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

export function getCaptionFontCssValue(fontFamily: CaptionFontFamily): string {
    return (
        CAPTION_FONT_OPTIONS.find((option) => option.value === fontFamily)?.css ??
        CAPTION_FONT_OPTIONS[0].css
    );
}

export function useCaptionWindowPreference() {
    const [settings, setSettings] = useState<CaptionWindowSettings>(readStoredSettings);

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch {
            // Ignore storage failures. The current in-memory settings still apply.
        }
    }, [settings]);

    const updateSettings = useCallback((patch: Partial<CaptionWindowSettings>) => {
        setSettings((prev) => normalizeSettings({ ...prev, ...patch }));
    }, []);

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
