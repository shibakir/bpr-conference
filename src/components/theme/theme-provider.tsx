"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    useSyncExternalStore,
} from "react";

import {
    DARK_MODE_QUERY,
    DEFAULT_THEME_PREFERENCE,
    isThemePreference,
    type ResolvedTheme,
    THEME_STORAGE_KEY,
    type ThemePreference,
} from "@/components/theme/theme-runtime";

interface ThemeContextValue {
    mounted: boolean;
    resolvedTheme: ResolvedTheme;
    setTheme: (theme: ThemePreference) => void;
    theme: ThemePreference;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function subscribeToHydration() {
    return () => {};
}

function getClientSnapshot() {
    return true;
}

function getServerSnapshot() {
    return false;
}

function useIsHydrated() {
    return useSyncExternalStore(subscribeToHydration, getClientSnapshot, getServerSnapshot);
}

function getSystemTheme(): ResolvedTheme {
    if (typeof window.matchMedia !== "function") {
        return DEFAULT_THEME_PREFERENCE;
    }

    return window.matchMedia(DARK_MODE_QUERY).matches ? "dark" : "light";
}

function getStoredThemePreference(): ThemePreference | null {
    if (typeof window === "undefined") {
        return null;
    }

    try {
        const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
        return isThemePreference(storedTheme) ? storedTheme : null;
    } catch {
        return null;
    }
}

function persistThemePreference(theme: ThemePreference) {
    try {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
        // Storage may be blocked in private or embedded browsing contexts.
    }
}

function getInitialThemePreference(): ThemePreference {
    if (typeof window === "undefined") {
        return DEFAULT_THEME_PREFERENCE;
    }

    return getStoredThemePreference() ?? getSystemTheme();
}

function applyThemePreference(theme: ThemePreference): ResolvedTheme {
    const root = document.documentElement;

    root.classList.toggle("dark", theme === "dark");
    root.dataset["theme"] = theme;
    root.dataset["themePreference"] = theme;
    root.style.colorScheme = theme;

    return theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const mounted = useIsHydrated();
    const [theme, setThemeState] = useState<ThemePreference>(getInitialThemePreference);
    const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(getInitialThemePreference);

    const setTheme = useCallback((nextTheme: ThemePreference) => {
        persistThemePreference(nextTheme);
        setThemeState(nextTheme);
        setResolvedTheme(applyThemePreference(nextTheme));
    }, []);

    useEffect(() => {
        applyThemePreference(theme);
    }, [theme]);

    const value = useMemo(
        () => ({
            mounted,
            resolvedTheme,
            setTheme,
            theme,
        }),
        [mounted, resolvedTheme, setTheme, theme],
    );

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
    const context = useContext(ThemeContext);

    if (!context) {
        throw new Error("useTheme must be used within ThemeProvider");
    }

    return context;
}
