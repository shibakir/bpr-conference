"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
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

interface LanguageSelectorProps {
  sessionId: string;
  currentLanguage: string;
  onLanguageChange: (
    languageCode: string,
    translatorIdentity: string | null
  ) => void;
  disabled?: boolean;
  allowedLanguages?: string[];
  sourceLanguage?: string;
}

export default function LanguageSelector({
  sessionId,
  currentLanguage,
  onLanguageChange,
  disabled = false,
  allowedLanguages,
  sourceLanguage,
}: LanguageSelectorProps) {
  const t = useTranslations("LanguageSelector");
  const locale = useLocale();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeLanguageRef = useRef(currentLanguage);

  useEffect(() => {
    activeLanguageRef.current = currentLanguage;
  }, [currentLanguage]);

  useEffect(() => {
    return () => {
      const lang = activeLanguageRef.current;
      if (lang && lang !== "original") {
        const payload = JSON.stringify({ sessionId, targetLanguage: lang });
        const blob = new Blob([payload], { type: "application/json" });
        const sent = navigator.sendBeacon?.("/api/translate/unsubscribe", blob);
        if (!sent) {
          fetch("/api/translate/unsubscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
            keepalive: true,
          }).catch(() => {});
        }
      }
    };
  }, [sessionId]);

  const handleChange = useCallback(
    async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const langCode = e.target.value;
      const previousLanguage = activeLanguageRef.current;
      setError(null);

      if (langCode === "original") {
        if (previousLanguage && previousLanguage !== "original") {
          fetch("/api/translate", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId,
              targetLanguage: previousLanguage,
            }),
          }).catch(() => {});
        }
        onLanguageChange("original", null);
        return;
      }

      setLoading(true);
      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            targetLanguage: langCode,
            previousLanguage:
              previousLanguage !== "original" ? previousLanguage : undefined,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || t("translationError"));
        }

        onLanguageChange(langCode, data.translatorIdentity);
      } catch (err) {
        setError((err as Error).message);
        console.error("Translation request error:", err);
      } finally {
        setLoading(false);
      }
    },
    [sessionId, onLanguageChange, t]
  );

  const currentLang = getLanguageByCode(currentLanguage);
  const currentLangName = currentLang
    ? getLanguageDisplayName(currentLang, locale)
    : currentLanguage.toUpperCase();

  const visibleLanguages = useMemo(
    () =>
      (allowedLanguages
        ? SUPPORTED_LANGUAGES.filter((lang) =>
            allowedLanguages.includes(lang.code)
          )
        : SUPPORTED_LANGUAGES
      )
        .filter((lang) => lang.code !== sourceLanguage)
        .map((lang) => ({
          ...lang,
          displayName: getLanguageDisplayName(lang, locale),
        }))
        .sort((a, b) =>
          a.displayName.localeCompare(b.displayName, locale, {
            sensitivity: "base",
          })
        ),
    [allowedLanguages, locale, sourceLanguage]
  );

  return (
    <div className="grid gap-2">
      <Label htmlFor="language-select" className="text-xs uppercase tracking-wide text-muted-foreground">
        {t("language")}
      </Label>

      <div className="relative">
        <NativeSelect
          id="language-select"
          className="w-full"
          value={currentLanguage}
          onChange={handleChange}
          disabled={loading || disabled}
        >
          <NativeSelectOption value="original">
            {t("originalAudio")}
          </NativeSelectOption>
          <NativeSelectOptGroup label={t("translations")}>
            {visibleLanguages.map((lang) => (
              <NativeSelectOption key={lang.code} value={lang.code}>
                {lang.displayName} {lang.flag}
              </NativeSelectOption>
            ))}
          </NativeSelectOptGroup>
        </NativeSelect>

        {loading && (
          <div className="absolute right-9 top-1/2 -translate-y-1/2">
            <Spinner className="size-3.5 text-muted-foreground" />
          </div>
        )}
      </div>

      <div className="min-h-5">
        {currentLanguage !== "original" && currentLang && !loading && (
          <Badge variant="outline" className="gap-1 border-success/30 text-success">
            <span className="size-1.5 rounded-full bg-current animate-pulse" />
            {t("translatingTo", { language: currentLangName })}
          </Badge>
        )}

        {loading && (
          <Badge variant="outline" className="gap-1 border-warning/30 text-warning">
            <span className="size-1.5 rounded-full bg-current animate-pulse" />
            {t("startingTranslation")}
          </Badge>
        )}

        {error && (
          <Badge variant="destructive" className="max-w-full whitespace-normal">
            {error}
          </Badge>
        )}
      </div>
    </div>
  );
}
