import { describe, expect, it } from "vitest";

import { filterLanguageOptions, getLanguageOptions } from "../language-search";
import { SUPPORTED_LANGUAGES } from "../languages";

describe("Language search", () => {
    const englishOptions = getLanguageOptions(SUPPORTED_LANGUAGES, "en");
    const czechOptions = getLanguageOptions(SUPPORTED_LANGUAGES, "cs");

    it.each(["Czech", "Čeština", "CESTINA", " cs "])("finds Czech using %s", (query) => {
        expect(
            filterLanguageOptions(englishOptions, query).map((language) => language.code),
        ).toContain("cs");
        expect(
            filterLanguageOptions(czechOptions, query).map((language) => language.code),
        ).toContain("cs");
    });

    it("searches native scripts, localized names, and regional codes", () => {
        expect(
            filterLanguageOptions(englishOptions, "русский").map((language) => language.code),
        ).toEqual(["ru"]);
        expect(
            filterLanguageOptions(czechOptions, "nemcina").map((language) => language.code),
        ).toEqual(["de"]);
        expect(
            filterLanguageOptions(englishOptions, "ZH-HANT").map((language) => language.code),
        ).toEqual(["zh-Hant"]);
        expect(
            filterLanguageOptions(englishOptions, "portuguese brazil").map(
                (language) => language.code,
            ),
        ).toEqual(["pt-BR"]);
    });

    it("preserves the available catalog and its order while filtering", () => {
        const restricted = getLanguageOptions(
            SUPPORTED_LANGUAGES.filter((language) => ["cs", "de"].includes(language.code)),
            "en",
        );
        expect(filterLanguageOptions(restricted, "Russian")).toEqual([]);
        expect(filterLanguageOptions(restricted, "not-a-language")).toEqual([]);
        expect(filterLanguageOptions(restricted, " \t")).toEqual(restricted);
        expect(restricted.map((language) => language.code)).toEqual(["cs", "de"]);
    });
});
