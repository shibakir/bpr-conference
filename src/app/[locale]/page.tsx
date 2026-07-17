"use client";

import { useState, useEffect, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { locales } from "@/i18n/routing";
import { SUPPORTED_LANGUAGES, getLanguageDisplayName } from "@/lib/languages";

export default function Home() {
  const t = useTranslations("Home");
  const locale = useLocale();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [password, setPassword] = useState("");
  const [eventId, setEventId] = useState("");
  const [error, setError] = useState<string | null>(null);
  
  const [restrictLanguages, setRestrictLanguages] = useState(true);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([
    "en", "zh-Hans", "hi", "es", "fr", "ar", "bn", "pt-BR", "ru", "ur"
  ]);
  const [langSearch, setLangSearch] = useState("");

  const languageOptions = useMemo(
    () =>
      SUPPORTED_LANGUAGES.map((lang) => ({
        ...lang,
        displayName: getLanguageDisplayName(lang, locale),
      })).sort((a, b) =>
        a.displayName.localeCompare(b.displayName, locale, {
          sensitivity: "base",
        })
      ),
    [locale]
  );

  const filteredLanguages = languageOptions.filter((lang) => {
    const query = langSearch.trim().toLocaleLowerCase(locale);
    return (
      lang.displayName.toLocaleLowerCase(locale).includes(query) ||
      lang.name.toLowerCase().includes(query.toLowerCase()) ||
      lang.code.toLowerCase().includes(query.toLowerCase())
    );
  });

  useEffect(() => {
    async function checkAuthStatus() {
      try {
        const res = await fetch("/api/auth/status");
        const data = await res.json();
        setPasswordRequired(data.passwordRequired);
      } catch (err) {
        console.error("Failed to check auth status:", err);
      }
    }
    checkAuthStatus();
  }, []);

  async function createSession() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          organizerName: "host", 
          password, 
          eventId,
          allowedLanguages: restrictLanguages ? selectedLanguages : undefined
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || t("createError"));
      }
      if (passwordRequired) {
        sessionStorage.setItem("broadcast_password", password);
      }
      router.push(`/session/${data.sessionId}/broadcast`);
    } catch (err) {
      console.error("Failed to create session:", err);
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="container" style={{ textAlign: "center" }}>
        <div
          className="enter"
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 8,
            marginBottom: 24,
          }}
        >
          {locales.map((item) => (
            <Link
              key={item}
              href="/"
              locale={item}
              aria-label={t("switchLocale", { locale: item.toUpperCase() })}
              className="mono"
              style={{
                color: item === locale ? "var(--fg)" : "var(--fg-tertiary)",
                textDecoration: item === locale ? "underline" : "none",
              }}
            >
              {item.toUpperCase()}
            </Link>
          ))}
        </div>

        {/* Title */}
        <h1 className="display display-lg enter" style={{ marginBottom: 24 }}>
          {t("title")}
        </h1>

        {/* Subtitle */}
        <p
          className="body enter-d1"
          style={{ maxWidth: 340, margin: "0 auto 48px" }}
        >
          {t("subtitle")}
        </p>

        {/* Inputs */}
        <div
          className="enter-d2"
          style={{
            maxWidth: 340,
            margin: "0 auto 20px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {passwordRequired && (
            <input
              type="password"
              className="input-field"
              placeholder={t("passwordPlaceholder")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ textAlign: "center" }}
              disabled={loading}
            />
          )}
          <input
            type="text"
            className="input-field"
            placeholder={t("eventPlaceholder")}
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            style={{ textAlign: "center" }}
            disabled={loading}
          />

          {/* Allowlisting control */}
          <div style={{ textAlign: "left", marginTop: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "13px", color: "var(--fg-secondary)" }}>
              <input
                type="checkbox"
                checked={restrictLanguages}
                onChange={(e) => {
                  setRestrictLanguages(e.target.checked);
                }}
                style={{ accentColor: "var(--fg)", cursor: "pointer" }}
              />
              {t("restrictLanguages")}
            </label>

            {restrictLanguages && (
              <div className="enter" style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                {/* Chip container to show selected languages at a glance */}
                {selectedLanguages.length > 0 && (
                  <div style={{ 
                    display: "flex", 
                    flexWrap: "wrap", 
                    gap: "6px", 
                    marginBottom: "4px",
                    padding: "8px",
                    border: "1px dashed var(--border)",
                    background: "var(--bg-elevated)" 
                  }}>
                    {selectedLanguages.map((code) => {
                      const lang = languageOptions.find((l) => l.code === code);
                      if (!lang) return null;
                      return (
                        <div
                          key={code}
                          onClick={() => setSelectedLanguages((prev) => prev.filter((c) => c !== code))}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            background: "var(--bg)",
                            border: "1px solid var(--border)",
                            padding: "3px 6px",
                            fontSize: "11px",
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                          }}
                          title={t("removeLanguage")}
                        >
                          <span>{lang.flag}</span>
                          <span style={{ color: "var(--fg-secondary)" }}>{lang.displayName}</span>
                          <span style={{ marginLeft: "2px", opacity: 0.5, fontWeight: "bold" }}>×</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                <input
                  type="text"
                  placeholder={t("searchLanguages")}
                  className="input-field"
                  value={langSearch}
                  onChange={(e) => setLangSearch(e.target.value)}
                  style={{ padding: "8px 12px", fontSize: "13px" }}
                />
                
                <div style={{ 
                  maxHeight: "130px", 
                  overflowY: "auto", 
                  border: "1px solid var(--border)", 
                  padding: "8px", 
                  background: "var(--bg-elevated)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6
                }}>
                  {filteredLanguages.length === 0 ? (
                    <span style={{ fontSize: "12px", color: "var(--fg-tertiary)" }}>{t("noLanguagesFound")}</span>
                  ) : (
                    filteredLanguages.map(lang => {
                      const isChecked = selectedLanguages.includes(lang.code);
                      return (
                        <label key={lang.code} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "13px" }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              setSelectedLanguages(prev => 
                                isChecked ? prev.filter(c => c !== lang.code) : [...prev, lang.code]
                              );
                            }}
                            style={{ accentColor: "var(--fg)" }}
                          />
                          <span>{lang.flag} {lang.displayName}</span>
                        </label>
                      );
                    })
                  )}
                </div>
                
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--fg-tertiary)" }}>
                  <span>{t("selectedCount", { count: selectedLanguages.length })}</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button 
                      type="button" 
                      onClick={() => setSelectedLanguages(SUPPORTED_LANGUAGES.map(l => l.code))}
                      style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", textDecoration: "underline" }}
                    >
                      {t("selectAll")}
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setSelectedLanguages([])}
                      style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", textDecoration: "underline" }}
                    >
                      {t("clear")}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Error message */}
        {error && (
          <p className="body-sm enter-d2" style={{ color: "var(--error)", marginBottom: 20 }}>
            {error}
          </p>
        )}

        {/* CTA */}
        <div className="enter-d2">
          <button
            className="btn btn-dark"
            onClick={createSession}
            disabled={loading}
            id="create-session-btn"
          >
            {loading ? (
              <>
                <span className="spinner" /> {t("creating")}
              </>
            ) : (
              t("createSession")
            )}
          </button>
        </div>

        {/* Steps */}
        <div
          className="enter-d3"
          style={{
            marginTop: 80,
            display: "flex",
            flexDirection: "column",
            gap: 0,
            textAlign: "left",
          }}
        >
          <hr className="rule" />
          {[
            t("steps.speak"),
            t("steps.share"),
            t("steps.languages"),
          ].map((text, i) => (
            <div key={i}>
              <div
                style={{
                  display: "flex",
                  gap: 16,
                  padding: "18px 0",
                  alignItems: "baseline",
                }}
              >
                <span className="mono" style={{ flexShrink: 0 }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p className="body-sm" style={{ color: "var(--fg-secondary)" }}>
                  {text}
                </p>
              </div>
              <hr className="rule" />
            </div>
          ))}
        </div>

        {/* Footer */}
        <p className="mono enter-d4" style={{ marginTop: 48 }}>
          <a target="_blank" href="https://bpr.cz/" rel="noopener noreferrer">BPR s.r.o</a>
        </p>
      </div>
    </div>
  );
}
