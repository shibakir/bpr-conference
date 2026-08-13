export const THEME_STORAGE_KEY = "bpr-conference-theme";
export const THEME_PREFERENCES = ["light", "dark"] as const;
export const DARK_MODE_QUERY = "(prefers-color-scheme: dark)";

export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = ThemePreference;

export const DEFAULT_THEME_PREFERENCE: ThemePreference = "light";

export function isThemePreference(value: string | null): value is ThemePreference {
    return value === "light" || value === "dark";
}

export function getNextThemePreference(theme: ThemePreference): ThemePreference {
    return theme === "dark" ? "light" : "dark";
}
