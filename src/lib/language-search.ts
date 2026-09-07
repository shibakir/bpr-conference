import { getLanguageDisplayName, type Language } from "./languages";

export interface LanguageOption extends Language {
    displayName: string;
    searchText: string;
}

function normalizeSearch(value: string) {
    return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

export function getLanguageOptions(
    languages: readonly Language[],
    locale: string,
): LanguageOption[] {
    return languages
        .map((language) => {
            const displayName = getLanguageDisplayName(language, locale);
            const nativeName = getLanguageDisplayName(language, language.code);
            return {
                ...language,
                displayName,
                searchText: normalizeSearch(
                    `${displayName} ${language.name} ${nativeName} ${language.code}`,
                ),
            };
        })
        .sort((a, b) =>
            a.displayName.localeCompare(b.displayName, locale, { sensitivity: "base" }),
        );
}

export function filterLanguageOptions(languages: readonly LanguageOption[], query: string) {
    const words = normalizeSearch(query).split(/\s+/u).filter(Boolean);
    return languages.filter((language) =>
        words.every((word) => language.searchText.includes(word)),
    );
}
