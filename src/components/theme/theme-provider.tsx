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
    return window.matchMedia(DARK_MODE_QUERY).matches ? "dark" : "light";
}

function resolveThemePreference(theme: ThemePreference): ResolvedTheme {
    return theme === "system" ? getSystemTheme() : theme;
}

function getStoredThemePreference(): ThemePreference {
    if (typeof window === "undefined") {
        return DEFAULT_THEME_PREFERENCE;
    }

    try {
        const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
        return isThemePreference(storedTheme) ? storedTheme : DEFAULT_THEME_PREFERENCE;
    } catch {
        return DEFAULT_THEME_PREFERENCE;
    }
}

function persistThemePreference(theme: ThemePreference) {
    try {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
        // Storage may be blocked in private or embedded browsing contexts.
    }
}

function getInitialResolvedTheme(): ResolvedTheme {
    if (typeof window === "undefined") {
        return "light";
    }

    return resolveThemePreference(getStoredThemePreference());
}

function applyThemePreference(theme: ThemePreference): ResolvedTheme {
    const resolvedTheme = resolveThemePreference(theme);
    const root = document.documentElement;

    root.classList.toggle("dark", resolvedTheme === "dark");
    root.dataset["theme"] = resolvedTheme;
    root.dataset["themePreference"] = theme;
    root.style.colorScheme = resolvedTheme;

    return resolvedTheme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const mounted = useIsHydrated();
    const [theme, setThemeState] = useState<ThemePreference>(getStoredThemePreference);
    const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(getInitialResolvedTheme);

    const setTheme = useCallback((nextTheme: ThemePreference) => {
        persistThemePreference(nextTheme);
        setThemeState(nextTheme);
        setResolvedTheme(applyThemePreference(nextTheme));
    }, []);

    useEffect(() => {
        if (theme !== "system") {
            return;
        }

        const mediaQuery = window.matchMedia(DARK_MODE_QUERY);
        const handleChange = () => {
            setResolvedTheme(applyThemePreference("system"));
        };

        mediaQuery.addEventListener("change", handleChange);
        return () => mediaQuery.removeEventListener("change", handleChange);
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
