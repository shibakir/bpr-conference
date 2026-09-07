import { describe, expect, it } from "vitest";

import {
    filterLanguageOptions,
    getLanguageOptions,
    prioritizeSelectedLanguages,
} from "../language-search";
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

    it("groups selected languages first in localized alphabetical order, not selection order", () => {
        const selected = new Set(["de", "cs", "en"]);
        const sorted = prioritizeSelectedLanguages(czechOptions, selected);
        expect(sorted.slice(0, 3).map((language) => language.code)).toEqual(["en", "cs", "de"]);
        expect(sorted.slice(3)).toEqual(
            czechOptions.filter((language) => !selected.has(language.code)),
        );
        expect(prioritizeSelectedLanguages(czechOptions, new Set())).toEqual(czechOptions);
    });

    it("keeps selected matches first during search and returns deselected languages to the alphabetical group", () => {
        const matches = filterLanguageOptions(englishOptions, "portuguese");
        expect(
            prioritizeSelectedLanguages(matches, new Set(["pt-PT", "cs"])).map(
                (language) => language.code,
            ),
        ).toEqual(["pt-PT", "pt-BR"]);
        expect(
            prioritizeSelectedLanguages(matches, new Set(["cs"])).map((language) => language.code),
        ).toEqual(["pt-BR", "pt-PT"]);
        expect(matches.map((language) => language.code)).toEqual(["pt-BR", "pt-PT"]);
    });
});
