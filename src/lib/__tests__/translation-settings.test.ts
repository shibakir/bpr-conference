import { describe, expect, it } from "vitest";

import {
    DEFAULT_TRANSLATION_SETTINGS,
    getTranslationPreset,
    TRANSLATION_PRESETS,
    translationSettingsSnapshotSchema,
    updateTranslationSettingsSchema,
} from "../translation-settings";

describe("Translation presets", () => {
    it("defaults to balance and preserves an explicit manual selection", () => {
        expect(getTranslationPreset(DEFAULT_TRANSLATION_SETTINGS)).toBe("balanced");
        expect(DEFAULT_TRANSLATION_SETTINGS).toMatchObject(TRANSLATION_PRESETS.balanced);
        expect(getTranslationPreset({ ...DEFAULT_TRANSLATION_SETTINGS, preset: "manual" })).toBe(
            "manual",
        );
    });

    it("can read older server responses without relabelling their settings", () => {
        const settings = translationSettingsSnapshotSchema.parse({
            maxOutputBacklogMs: 1000,
            inputFrameSizeMs: 100,
            version: 1,
        });
        expect(getTranslationPreset(settings)).toBe("manual");
    });

    it("accepts 300 ms and validates the association between preset and values", () => {
        const request = {
            ...TRANSLATION_PRESETS.poorConnection,
            preset: "poorConnection",
            organizerKey: "owner",
            expectedVersion: 1,
        };
        expect(updateTranslationSettingsSchema.safeParse(request).success).toBe(true);
        expect(
            updateTranslationSettingsSchema.safeParse({ ...request, preset: "quality" }).success,
        ).toBe(false);
        expect(
            updateTranslationSettingsSchema.safeParse({ ...request, preset: "manual" }).success,
        ).toBe(true);
        expect(
            updateTranslationSettingsSchema.safeParse({ ...request, inputFrameSizeMs: 400 })
                .success,
        ).toBe(false);
    });
});
