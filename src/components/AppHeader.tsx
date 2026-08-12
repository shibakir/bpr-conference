"use client";

import {
    CheckIcon,
    ChevronDownIcon,
    Globe2Icon,
    LanguagesIcon,
    MoonIcon,
    SunIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverHeader,
    PopoverTitle,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Toggle } from "@/components/ui/toggle";
import { Link, usePathname } from "@/i18n/navigation";
import { locales } from "@/i18n/routing";
import { cn } from "@/lib/utils";

import { useTheme } from "./theme/theme-provider";
import {
    DEFAULT_THEME_PREFERENCE,
    getNextThemePreference,
    type ThemePreference,
} from "./theme/theme-runtime";

const THEME_ICONS = {
    dark: MoonIcon,
    light: SunIcon,
} satisfies Record<ThemePreference, typeof SunIcon>;

function LanguagePopover() {
    const locale = useLocale();
    const pathname = usePathname();
    const t = useTranslations("Header");

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="max-w-28 gap-1.5 px-2 sm:max-w-none"
                    aria-label={t("currentLanguage", { language: t(`languages.${locale}`) })}
                >
                    <Globe2Icon />
                    <span className="truncate font-mono uppercase">{locale}</span>
                    <ChevronDownIcon className="hidden size-3.5 sm:block" />
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-52">
                <PopoverHeader>
                    <PopoverTitle>{t("language")}</PopoverTitle>
                </PopoverHeader>
                <div className="grid gap-1">
                    {locales.map((item) => {
                        const selected = item === locale;
                        const language = t(`languages.${item}`);

                        return (
                            <Button
                                key={item}
                                asChild
                                variant="ghost"
                                className="w-full justify-between"
                            >
                                <Link
                                    href={pathname}
                                    locale={item}
                                    aria-label={t("switchLanguage", { language })}
                                >
                                    <span className="flex min-w-0 items-center gap-2">
                                        <span className="font-mono text-xs uppercase">{item}</span>
                                        <span className="truncate">{language}</span>
                                    </span>
                                    <CheckIcon
                                        className={cn(
                                            "size-4",
                                            selected ? "opacity-100" : "opacity-0",
                                        )}
                                    />
                                </Link>
                            </Button>
                        );
                    })}
                </div>
            </PopoverContent>
        </Popover>
    );
}

function ThemeToggle() {
    const t = useTranslations("Theme");
    const { mounted, resolvedTheme, setTheme } = useTheme();
    const currentTheme = mounted ? resolvedTheme : DEFAULT_THEME_PREFERENCE;
    const nextTheme = getNextThemePreference(currentTheme);
    const Icon = THEME_ICONS[currentTheme];

    return (
        <Toggle
            type="button"
            variant="outline"
            size="sm"
            pressed={currentTheme === "dark"}
            className="max-w-28 gap-1.5 px-2 sm:max-w-none"
            aria-label={t("switchTheme", { theme: t(nextTheme) })}
            onPressedChange={(pressed) => setTheme(pressed ? "dark" : "light")}
        >
            <Icon />
            <span className="hidden truncate sm:inline">{t(currentTheme)}</span>
        </Toggle>
    );
}

export function AppHeader() {
    const t = useTranslations("Header");

    return (
        <header className="pointer-events-none sticky top-0 z-40 flex h-(--app-header-height) justify-center px-4 pt-3 sm:px-6">
            <div className="pointer-events-auto mx-auto grid min-h-16 w-full max-w-xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-lg bg-card/85 px-3 py-2 shadow-sm shadow-foreground/5 backdrop-blur supports-backdrop-filter:bg-card/70">
                <div className="flex min-w-0 justify-start">
                    <ThemeToggle />
                </div>

                <div className="flex min-w-0 flex-col items-center gap-1">
                    <Link
                        href="/"
                        className="min-w-0 text-center font-heading text-base font-semibold tracking-normal sm:text-lg"
                        aria-label="BPR Conference"
                    >
                        <span className="text-primary">BPR</span>{" "}
                        <span className="text-foreground">Conference</span>
                    </Link>
                    <Badge
                        variant="outline"
                        className="max-w-full gap-1.5 border-transparent bg-muted/45"
                    >
                        <LanguagesIcon className="size-3" />
                        <span className="truncate">{t("liveTranslation")}</span>
                    </Badge>
                </div>

                <div className="flex min-w-0 justify-end">
                    <LanguagePopover />
                </div>
            </div>
        </header>
    );
}
