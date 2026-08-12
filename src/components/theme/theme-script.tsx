"use client";

/* eslint-disable react/no-danger -- Next.js recommends this synchronous inline script pattern for persisted theme before first paint. */

import { DARK_MODE_QUERY, DEFAULT_THEME_PREFERENCE, THEME_STORAGE_KEY } from "./theme-runtime";

const themeScript = `
(function() {
    try {
        var storageKey = ${JSON.stringify(THEME_STORAGE_KEY)};
        var preference = localStorage.getItem(storageKey);
        if (preference !== "light" && preference !== "dark" && preference !== "system") {
            preference = ${JSON.stringify(DEFAULT_THEME_PREFERENCE)};
        }

        var resolvedTheme = preference === "system"
            ? (window.matchMedia(${JSON.stringify(DARK_MODE_QUERY)}).matches ? "dark" : "light")
            : preference;
        var root = document.documentElement;

        root.classList.toggle("dark", resolvedTheme === "dark");
        root.dataset.theme = resolvedTheme;
        root.dataset.themePreference = preference;
        root.style.colorScheme = resolvedTheme;
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
