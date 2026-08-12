"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "watch_font_size";
const DEFAULT_FONT_SIZE = 16;
const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 28;

export function useFontSizePreference() {
    const [fontSize, setFontSize] = useState<number>(() => {
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = parseInt(saved, 10);
                if (!Number.isNaN(parsed) && parsed >= MIN_FONT_SIZE && parsed <= MAX_FONT_SIZE) {
                    return parsed;
                }
            }
        }
        return DEFAULT_FONT_SIZE;
    });

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, fontSize.toString());
    }, [fontSize]);

    return {
        fontSize,
        canDecreaseFontSize: fontSize > MIN_FONT_SIZE,
        canIncreaseFontSize: fontSize < MAX_FONT_SIZE,
        decreaseFontSize: () => setFontSize((prev) => Math.max(prev - 2, MIN_FONT_SIZE)),
        increaseFontSize: () => setFontSize((prev) => Math.min(prev + 2, MAX_FONT_SIZE)),
    };
}
