"use client";

import { CheckIcon, ChevronsUpDownIcon, Volume2Icon, VolumeXIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import { FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { Toggle } from "@/components/ui/toggle";
import { filterLanguageOptions, getLanguageOptions } from "@/lib/language-search";
import { getLanguageByCode, getLanguageDisplayName, SUPPORTED_LANGUAGES } from "@/lib/languages";

interface LanguageSelectorProps {
    audioMuted: boolean;
    currentLanguage: string;
    onLanguageChange: (languageCode: string) => void;
    onAudioMutedChange: (muted: boolean) => void;
    disabled?: boolean;
    allowedLanguages?: string[];
    translationError?: string | null;
    translationLoading?: boolean;
    translationsEnabled: boolean;
}

export default function LanguageSelector({
    audioMuted,
    currentLanguage,
    onLanguageChange,
    onAudioMutedChange,
    disabled = false,
    allowedLanguages,
    translationError,
    translationLoading = false,
    translationsEnabled,
}: LanguageSelectorProps) {
    const t = useTranslations("LanguageSelector");
    const pickerT = useTranslations("LanguagePicker");
    const locale = useLocale();
    const id = useId();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const searchRef = useRef<HTMLInputElement>(null);

    const currentLang = getLanguageByCode(currentLanguage);
    const currentLangName = currentLang
        ? getLanguageDisplayName(currentLang, locale)
        : currentLanguage.toUpperCase();

    const visibleLanguages = useMemo(() => {
        const baseTranslationLanguages = translationsEnabled
            ? allowedLanguages
                ? SUPPORTED_LANGUAGES.filter((lang) => allowedLanguages.includes(lang.code))
                : SUPPORTED_LANGUAGES
            : [];

        return getLanguageOptions(baseTranslationLanguages, locale);
    }, [allowedLanguages, locale, translationsEnabled]);
    const filteredLanguages = useMemo(
        () => filterLanguageOptions(visibleLanguages, query),
        [visibleLanguages, query],
    );

    function selectLanguage(code: string) {
        if (disabled || translationLoading) return;
        if (code !== "original" && !visibleLanguages.some((language) => language.code === code))
            return;
        onLanguageChange(code);
        setOpen(false);
    }

    return (
        <div className="grid gap-2">
            <FieldLabel id={`${id}-label`} htmlFor={id}>
                {t("voiceLanguage")}
            </FieldLabel>

            <div className="flex items-center gap-2">
                <Popover
                    open={open && !disabled && !translationLoading}
                    onOpenChange={(nextOpen) => {
                        setOpen(nextOpen);
                        if (nextOpen) setQuery("");
                    }}
                >
                    <PopoverTrigger asChild>
                        <Button
                            id={id}
                            type="button"
                            variant="outline"
                            className="min-w-0 flex-1 justify-between font-normal"
                            disabled={translationLoading || disabled}
                            aria-labelledby={`${id}-label ${id}-value`}
                        >
                            <span id={`${id}-value`} className="truncate">
                                {currentLanguage === "original"
                                    ? t("originalAudio")
                                    : `${currentLang?.flag ?? ""} ${currentLangName}`}
                            </span>
                            {translationLoading ? (
                                <Spinner className="size-3.5" />
                            ) : (
                                <ChevronsUpDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
                            )}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent
                        align="start"
                        className="max-h-(--radix-popover-content-available-height) w-(--radix-popover-trigger-width) gap-0 overflow-hidden p-1"
                        aria-labelledby={`${id}-label`}
                        onOpenAutoFocus={(event) => {
                            if (translationsEnabled) {
                                event.preventDefault();
                                searchRef.current?.focus();
                            }
                        }}
                    >
                        <Button
                            type="button"
                            variant="ghost"
                            className="w-full shrink-0 justify-between px-2 font-normal"
                            aria-pressed={currentLanguage === "original"}
                            onClick={() => selectLanguage("original")}
                        >
                            {t("originalAudio")}
                            {currentLanguage === "original" && (
                                <CheckIcon aria-hidden="true" className="size-4" />
                            )}
                        </Button>
                        {translationsEnabled && (
                            <Command
                                shouldFilter={false}
                                defaultValue={currentLanguage}
                                className="min-h-0 rounded-none! border-t"
                                label={pickerT("searchIn", { label: t("voiceLanguage") })}
                            >
                                <CommandInput
                                    ref={searchRef}
                                    value={query}
                                    onValueChange={setQuery}
                                    placeholder={pickerT("searchLanguages")}
                                />
                                <CommandList>
                                    <CommandEmpty>{pickerT("noMatches")}</CommandEmpty>
                                    <CommandGroup heading={t("translations")}>
                                        {filteredLanguages.map((language) => (
                                            <CommandItem
                                                key={language.code}
                                                value={language.code}
                                                data-checked={currentLanguage === language.code}
                                                onSelect={selectLanguage}
                                            >
                                                <span className="min-w-0 truncate">
                                                    {language.flag} {language.displayName}
                                                </span>
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        )}
                    </PopoverContent>
                </Popover>

                <Toggle
                    type="button"
                    pressed={audioMuted}
                    variant="outline"
                    size="sm"
                    onPressedChange={onAudioMutedChange}
                    disabled={disabled}
                    title={audioMuted ? t("unmuteAudio") : t("muteAudio")}
                    className="data-[state=on]:bg-secondary data-[state=on]:text-secondary-foreground"
                >
                    {audioMuted ? (
                        <Volume2Icon className="size-3.5" />
                    ) : (
                        <VolumeXIcon className="size-3.5" />
                    )}
                    <span className="hidden sm:inline">
                        {audioMuted ? t("unmuteAudio") : t("muteAudio")}
                    </span>
                </Toggle>
            </div>

            <div className="min-h-5">
                {audioMuted && (
                    <Badge variant="outline" className="gap-1">
                        <span className="size-1.5 rounded-full bg-current" />
                        {t("audioMuted")}
                    </Badge>
                )}

                {!audioMuted &&
                    currentLanguage !== "original" &&
                    currentLang &&
                    !translationLoading &&
                    !translationError && (
                        <Badge variant="outline" className="gap-1 border-success/30 text-success">
                            <span className="size-1.5 rounded-full bg-current animate-pulse" />
                            {t("translatingTo", { language: currentLangName })}
                        </Badge>
                    )}

                {!audioMuted && translationLoading && (
                    <Badge variant="outline" className="gap-1 border-warning/30 text-warning">
                        <span className="size-1.5 rounded-full bg-current animate-pulse" />
                        {t("startingTranslation")}
                    </Badge>
                )}

                {!audioMuted && !translationsEnabled && !translationLoading && (
                    <Badge variant="outline" className="max-w-full whitespace-normal">
                        {t("translationsDisabled")}
                    </Badge>
                )}

                {!audioMuted && translationError && (
                    <Badge variant="destructive" className="max-w-full whitespace-normal">
                        {translationError}
                    </Badge>
                )}
            </div>
        </div>
    );
}
