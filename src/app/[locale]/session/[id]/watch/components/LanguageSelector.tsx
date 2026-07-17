"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
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
}

export default function LanguageSelector({
  sessionId,
  currentLanguage,
  onLanguageChange,
  disabled = false,
  allowedLanguages,
}: LanguageSelectorProps) {
  const t = useTranslations("LanguageSelector");
  const locale = useLocale();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeLanguageRef = useRef(currentLanguage);

  // Keep ref in sync with current language
  useEffect(() => {
    activeLanguageRef.current = currentLanguage;
  }, [currentLanguage]);

  // Unsubscribe on unmount (attendee disconnects)
  useEffect(() => {
    return () => {
      const lang = activeLanguageRef.current;
      if (lang && lang !== "original") {
        const payload = JSON.stringify({ sessionId, targetLanguage: lang });
        const blob = new Blob([payload], { type: "application/json" });
        // sendBeacon is reliable during page unload
        const sent = navigator.sendBeacon?.("/api/translate/unsubscribe", blob);
        if (!sent) {
          fetch("/api/translate/unsubscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
            keepalive: true,
          }).catch(() => { });
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
        // Unsubscribe from the current translation
        if (previousLanguage && previousLanguage !== "original") {
          fetch("/api/translate", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId,
              targetLanguage: previousLanguage,
            }),
          }).catch(() => { });
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
        ? SUPPORTED_LANGUAGES.filter((lang) => allowedLanguages.includes(lang.code))
        : SUPPORTED_LANGUAGES
      ).map((lang) => ({
        ...lang,
        displayName: getLanguageDisplayName(lang, locale),
      })).sort((a, b) =>
        a.displayName.localeCompare(b.displayName, locale, {
          sensitivity: "base",
        })
      ),
    [allowedLanguages, locale]
  );

  return (
    <div style={{ width: "100%" }}>
      <label htmlFor="language-select" className="label" style={{ display: "block", marginBottom: 10 }}>
        {t("language")}
      </label>

      <div style={{ position: "relative" }}>
        <select
          id="language-select"
          className="select-field"
          value={currentLanguage}
          onChange={handleChange}
          disabled={loading || disabled}
          style={{
            opacity: (loading || disabled) ? 0.5 : 1,
            cursor: (loading || disabled) ? "not-allowed" : "pointer",
          }}
        >
          <option value="original">{t("originalAudio")}</option>
          <optgroup label={t("translations")}>
            {visibleLanguages.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.displayName} {lang.flag}
              </option>
            ))}
          </optgroup>
        </select>

        {loading && (
          <div style={{ position: "absolute", right: 40, top: "50%", transform: "translateY(-50%)" }}>
            <span className="spinner" />
          </div>
        )}
      </div>

      {/* State feedback */}
      <div style={{ marginTop: 10, minHeight: 20 }}>
        {currentLanguage !== "original" && currentLang && !loading && (
          <span className="status status--active">
            <span className="status-dot pulse" />
            {t("translatingTo", { language: currentLangName })}
          </span>
        )}

        {loading && (
          <span className="status status--waiting">
            <span className="status-dot pulse" />
            {t("startingTranslation")}
          </span>
        )}

        {error && (
          <span className="status status--error">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
