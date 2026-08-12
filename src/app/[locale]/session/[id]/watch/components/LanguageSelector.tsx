"use client";

import { useCallback, useMemo } from "react";
import { Volume2Icon, VolumeXIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import {
  SUPPORTED_LANGUAGES,
  getLanguageByCode,
  getLanguageDisplayName,
} from "@/lib/languages";
import type { InputLanguageMode } from "@/lib/session-types";

interface LanguageSelectorProps {
  audioMuted: boolean;
  currentLanguage: string;
  onLanguageChange: (languageCode: string) => void;
  onAudioMutedChange: (muted: boolean) => void;
  disabled?: boolean;
  allowedLanguages?: string[];
  inputLanguageMode?: InputLanguageMode;
  sourceLanguage?: string;
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
  inputLanguageMode = "multi",
  sourceLanguage,
  translationError,
  translationLoading = false,
  translationsEnabled,
}: LanguageSelectorProps) {
  const t = useTranslations("LanguageSelector");
  const locale = useLocale();

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const langCode = e.target.value;

      if (langCode === "original") {
        onLanguageChange("original");
        return;
      }

      if (!translationsEnabled) {
        onLanguageChange("original");
        return;
      }

      onLanguageChange(langCode);
    },
    [onLanguageChange, translationsEnabled]
  );

  const currentLang = getLanguageByCode(currentLanguage);
  const currentLangName = currentLang
    ? getLanguageDisplayName(currentLang, locale)
    : currentLanguage.toUpperCase();

  const visibleLanguages = useMemo(() => {
    const baseTranslationLanguages = translationsEnabled
      ? allowedLanguages
        ? SUPPORTED_LANGUAGES.filter((lang) =>
            allowedLanguages.includes(lang.code)
          )
        : SUPPORTED_LANGUAGES
      : [];

    return baseTranslationLanguages
      .filter(
        (lang) =>
          inputLanguageMode !== "single" || lang.code !== sourceLanguage
      )
      .map((lang) => ({
        ...lang,
        displayName: getLanguageDisplayName(lang, locale),
      }))
      .sort((a, b) =>
        a.displayName.localeCompare(b.displayName, locale, {
          sensitivity: "base",
        })
      );
  }, [
    allowedLanguages,
    inputLanguageMode,
    locale,
    sourceLanguage,
    translationsEnabled,
  ]);

  return (
    <div className="grid gap-2">
      <Label
        htmlFor="language-select"
        className="text-xs uppercase tracking-wide text-muted-foreground"
      >
        {t("voiceLanguage")}
      </Label>

      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <NativeSelect
            id="language-select"
            className="w-full"
            value={currentLanguage}
            onChange={handleChange}
            disabled={translationLoading || disabled}
          >
            <NativeSelectOption value="original">
              {t("originalAudio")}
            </NativeSelectOption>
            {translationsEnabled && (
              <NativeSelectOptGroup label={t("translations")}>
                {visibleLanguages.map((lang) => (
                  <NativeSelectOption key={lang.code} value={lang.code}>
                    {lang.displayName} {lang.flag}
                  </NativeSelectOption>
                ))}
              </NativeSelectOptGroup>
            )}
          </NativeSelect>

          {translationLoading && (
            <div className="absolute right-9 top-1/2 -translate-y-1/2">
              <Spinner className="size-3.5 text-muted-foreground" />
            </div>
          )}
        </div>

        <Button
          type="button"
          variant={audioMuted ? "secondary" : "outline"}
          size="sm"
          onClick={() => onAudioMutedChange(!audioMuted)}
          disabled={disabled}
          aria-pressed={audioMuted}
          title={audioMuted ? t("unmuteAudio") : t("muteAudio")}
        >
          {audioMuted ? (
            <Volume2Icon className="size-3.5" />
          ) : (
            <VolumeXIcon className="size-3.5" />
          )}
          <span>{audioMuted ? t("unmuteAudio") : t("muteAudio")}</span>
        </Button>
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
            <Badge
              variant="outline"
              className="gap-1 border-success/30 text-success"
            >
              <span className="size-1.5 rounded-full bg-current animate-pulse" />
              {t("translatingTo", { language: currentLangName })}
            </Badge>
          )}

        {!audioMuted && translationLoading && (
          <Badge
            variant="outline"
            className="gap-1 border-warning/30 text-warning"
          >
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
