"use client";

/* eslint-disable react/no-danger -- Next.js recommends this synchronous inline script pattern for persisted theme before first paint. */

import { DARK_MODE_QUERY, DEFAULT_THEME_PREFERENCE, THEME_STORAGE_KEY } from "./theme-runtime";

const themeScript = `
(function() {
    var preference = null;
    var storageKey = ${JSON.stringify(THEME_STORAGE_KEY)};

    try {
        var storedPreference = localStorage.getItem(storageKey);
        if (storedPreference === "light" || storedPreference === "dark") {
            preference = storedPreference;
        }
    } catch (_) {}

    if (preference !== "light" && preference !== "dark") {
        try {
            preference = window.matchMedia(${JSON.stringify(DARK_MODE_QUERY)}).matches
                ? "dark"
                : ${JSON.stringify(DEFAULT_THEME_PREFERENCE)};
        } catch (_) {
            preference = ${JSON.stringify(DEFAULT_THEME_PREFERENCE)};
        }
    }

    try {
        var root = document.documentElement;

        root.classList.toggle("dark", preference === "dark");
        root.dataset.theme = preference;
        root.dataset.themePreference = preference;
        root.style.colorScheme = preference;
    } catch (_) {}
})();
`;

export function ThemeScript() {
    return (
        <script
            id="theme-script"
            type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
            suppressHydrationWarning
            dangerouslySetInnerHTML={{ __html: themeScript }}
        />
    );
}
