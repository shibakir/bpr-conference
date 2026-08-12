export const THEME_STORAGE_KEY = "bpr-conference-theme";
export const THEME_PREFERENCES = ["system", "light", "dark"] as const;
export const DEFAULT_THEME_PREFERENCE: ThemePreference = "system";
export const DARK_MODE_QUERY = "(prefers-color-scheme: dark)";

export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = "light" | "dark";

export function isThemePreference(value: string | null): value is ThemePreference {
    return value === "system" || value === "light" || value === "dark";
}

export function getNextThemePreference(theme: ThemePreference): ThemePreference {
    switch (theme) {
        case "system":
            return "light";
        case "light":
            return "dark";
        case "dark":
            return "system";
        default:
            return DEFAULT_THEME_PREFERENCE;
    }
}
