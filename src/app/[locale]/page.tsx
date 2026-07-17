"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ClockIcon,
  LanguagesIcon,
  RadioTowerIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { Link, useRouter } from "@/i18n/navigation";
import { locales } from "@/i18n/routing";
import {
  API_ERROR_CODES,
  getApiErrorCode,
  type ApiErrorCode,
} from "@/lib/api-errors";
import { SUPPORTED_LANGUAGES, getLanguageDisplayName } from "@/lib/languages";
import {
  DEFAULT_SESSION_DURATION_MINUTES,
  MAX_SESSION_DURATION_MINUTES,
  MIN_SESSION_DURATION_MINUTES,
} from "@/lib/session-duration";

const DEFAULT_LANGUAGES = [
  "en",
  "zh-Hans",
  "fr",
  "de",
  "it",
  "ar",
  "ru",
  "vi",
];

const DEFAULT_SOURCE_LANGUAGE = "cs";

export default function Home() {
  const t = useTranslations("Home");
  const locale = useLocale();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sourceLanguage, setSourceLanguage] = useState(DEFAULT_SOURCE_LANGUAGE);
  const [durationMinutes, setDurationMinutes] = useState(
    DEFAULT_SESSION_DURATION_MINUTES
  );
  const [enableTranscription, setEnableTranscription] = useState(false);
  const [restrictLanguages, setRestrictLanguages] = useState(true);
  const [selectedLanguages, setSelectedLanguages] =
    useState<string[]>(DEFAULT_LANGUAGES);
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

  const translationLanguageOptions = useMemo(
    () => languageOptions.filter((lang) => lang.code !== sourceLanguage),
    [languageOptions, sourceLanguage]
  );

  const selectedTranslationLanguages = useMemo(
    () => selectedLanguages.filter((code) => code !== sourceLanguage),
    [selectedLanguages, sourceLanguage]
  );

  const filteredLanguages = translationLanguageOptions.filter((lang) => {
    const query = langSearch.trim().toLocaleLowerCase(locale);
    return (
      lang.displayName.toLocaleLowerCase(locale).includes(query) ||
      lang.name.toLowerCase().includes(query.toLowerCase()) ||
      lang.code.toLowerCase().includes(query.toLowerCase())
    );
  });

  function handleSourceLanguageChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextSourceLanguage = event.target.value;
    setSourceLanguage(nextSourceLanguage);
    setSelectedLanguages((prev) =>
      prev.filter((code) => code !== nextSourceLanguage)
    );
  }

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

  function getCreateSessionErrorMessage(code: ApiErrorCode | undefined) {
    switch (code) {
      case API_ERROR_CODES.INCORRECT_PASSWORD:
        return t("incorrectPassword");
      case API_ERROR_CODES.INVALID_SESSION_DURATION:
        return t("invalidSessionDuration");
      case API_ERROR_CODES.INVALID_LOCALE:
      case API_ERROR_CODES.INVALID_REQUEST:
      case API_ERROR_CODES.INVALID_SOURCE_LANGUAGE:
      case API_ERROR_CODES.UNSUPPORTED_SOURCE_LANGUAGE:
        return t("invalidSessionSettings");
      default:
        return t("createError");
    }
  }

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
          locale,
          sourceLanguage,
          enableTranscription,
          durationMinutes,
          allowedLanguages: restrictLanguages
            ? selectedTranslationLanguages
            : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(getCreateSessionErrorMessage(getApiErrorCode(data)));
        setLoading(false);
        return;
      }
      if (passwordRequired) {
        sessionStorage.setItem("broadcast_password", password);
      }
      router.push(`/session/${data.sessionId}/broadcast`);
    } catch (err) {
      console.error("Failed to create session:", err);
      setError(t("createError"));
      setLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!loading) {
      createSession();
    }
  }

  const title = t("title");
  const titleHighlight = "BPR";
  const titleHighlightIndex = title.indexOf(titleHighlight);

  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-10 sm:px-6">
      <section className="grid w-full max-w-xl gap-6">
        <nav className="flex justify-center gap-1" aria-label="Language">
          {locales.map((item) => (
            <Button
              key={item}
              asChild
              variant={item === locale ? "secondary" : "ghost"}
              size="xs"
            >
              <Link
                href="/"
                locale={item}
                aria-label={t("switchLocale", {
                  locale: item.toUpperCase(),
                })}
              >
                {item.toUpperCase()}
              </Link>
            </Button>
          ))}
        </nav>

        <div className="space-y-3 text-center">
          <Badge variant="outline" className="mx-auto gap-1.5">
            <LanguagesIcon className="size-3" />
            {t("liveTranslation")}
          </Badge>
          <h1 className="text-balance font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
            {titleHighlightIndex >= 0 ? (
              <>
                {title.slice(0, titleHighlightIndex)}
                <span className="text-primary">{titleHighlight}</span>
                {title.slice(titleHighlightIndex + titleHighlight.length)}
              </>
            ) : (
              title
            )}
          </h1>
          <p className="mx-auto max-w-md text-sm leading-6 text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("createSession")}</CardTitle>
            <CardDescription>{t("subtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={handleSubmit}>
              {passwordRequired && (
                <div className="grid gap-2">
                  <Label htmlFor="broadcast-password">
                    {t("passwordPlaceholder")}
                  </Label>
                  <Input
                    id="broadcast-password"
                    type="password"
                    autoComplete="new-password"
                    placeholder={t("passwordPlaceholder")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                  />
                </div>
              )}

              <div className="grid gap-3 rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-3">
                  <Label
                    htmlFor="session-duration"
                    className="flex items-center gap-2"
                  >
                    <ClockIcon className="size-4 text-muted-foreground" />
                    {t("duration")}
                  </Label>
                  <Badge variant="secondary" className="font-mono tabular-nums">
                    {t("durationValue", { count: durationMinutes })}
                  </Badge>
                </div>
                <Slider
                  id="session-duration"
                  aria-label={t("duration")}
                  value={[durationMinutes]}
                  min={MIN_SESSION_DURATION_MINUTES}
                  max={MAX_SESSION_DURATION_MINUTES}
                  step={1}
                  onValueChange={(value) =>
                    setDurationMinutes(
                      value[0] ?? DEFAULT_SESSION_DURATION_MINUTES
                    )
                  }
                  disabled={loading}
                />
                <p className="text-xs leading-5 text-muted-foreground">
                  {t("durationDescription")}
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="source-language">{t("sourceLanguage")}</Label>
                <NativeSelect
                  id="source-language"
                  className="w-full"
                  value={sourceLanguage}
                  onChange={handleSourceLanguageChange}
                  disabled={loading}
                >
                  {languageOptions.map((lang) => (
                    <NativeSelectOption key={lang.code} value={lang.code}>
                      {lang.displayName} {lang.flag}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>

              <Label className="items-start gap-3 rounded-lg border bg-muted/30 p-3">
                <Checkbox
                  checked={enableTranscription}
                  onCheckedChange={(checked) =>
                    setEnableTranscription(checked === true)
                  }
                  disabled={loading}
                  className="mt-0.5"
                />
                <span className="grid gap-1">
                  <span>{t("enableTranscription")}</span>
                  <span className="text-xs font-normal leading-5 text-muted-foreground">
                    {t("enableTranscriptionDescription")}
                  </span>
                </span>
              </Label>

              <div className="grid gap-3 rounded-lg border bg-muted/30 p-3">
                <Label className="items-start gap-3">
                  <Checkbox
                    checked={restrictLanguages}
                    onCheckedChange={(checked) =>
                      setRestrictLanguages(checked === true)
                    }
                    disabled={loading}
                    className="mt-0.5"
                  />
                  <span className="grid gap-1">
                    <span>{t("restrictLanguages")}</span>
                    <span className="text-xs font-normal leading-5 text-muted-foreground">
                      {t("selectedCount", {
                        count: selectedTranslationLanguages.length,
                      })}
                    </span>
                  </span>
                </Label>

                {restrictLanguages && (
                  <div className="grid gap-3">
                    {selectedTranslationLanguages.length > 0 && (
                      <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-dashed bg-background p-2 pr-1 [scrollbar-gutter:stable]">
                        {selectedTranslationLanguages.map((code) => {
                          const lang = languageOptions.find(
                            (item) => item.code === code
                          );
                          if (!lang) return null;
                          return (
                            <Button
                              key={code}
                              type="button"
                              variant="secondary"
                              size="xs"
                              title={t("removeLanguage")}
                              onClick={() =>
                                setSelectedLanguages((prev) =>
                                  prev.filter((item) => item !== code)
                                )
                              }
                            >
                              <span>{lang.flag}</span>
                              <span>{lang.displayName}</span>
                              <XIcon className="size-3" />
                            </Button>
                          );
                        })}
                      </div>
                    )}

                    <div className="relative">
                      <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="search"
                        placeholder={t("searchLanguages")}
                        value={langSearch}
                        onChange={(e) => setLangSearch(e.target.value)}
                        disabled={loading}
                        className="pl-8"
                      />
                    </div>

                    <ScrollArea className="h-40 rounded-lg border bg-background">
                      <div className="grid gap-1 p-2">
                        {filteredLanguages.length === 0 ? (
                          <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                            {t("noLanguagesFound")}
                          </p>
                        ) : (
                          filteredLanguages.map((lang) => {
                            const isChecked = selectedLanguages.includes(
                              lang.code
                            );
                            return (
                              <Label
                                key={lang.code}
                                className="flex cursor-pointer items-center rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                              >
                                <Checkbox
                                  checked={isChecked}
                                  onCheckedChange={() => {
                                    setSelectedLanguages((prev) =>
                                      isChecked
                                        ? prev.filter(
                                            (code) => code !== lang.code
                                          )
                                        : [...prev, lang.code]
                                    );
                                  }}
                                  disabled={loading}
                                />
                                <span>
                                  {lang.flag} {lang.displayName}
                                </span>
                              </Label>
                            );
                          })
                        )}
                      </div>
                    </ScrollArea>

                    <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span>
                        {t("selectedCount", {
                          count: selectedTranslationLanguages.length,
                        })}
                      </span>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() =>
                            setSelectedLanguages(
                              translationLanguageOptions.map((lang) => lang.code)
                            )
                          }
                        >
                          {t("selectAll")}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => setSelectedLanguages([])}
                        >
                          {t("clear")}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button
                type="submit"
                disabled={loading}
                id="create-session-btn"
                className="w-full"
              >
                {loading ? (
                  <>
                    <Spinner />
                    {t("creating")}
                  </>
                ) : (
                  <>
                    <RadioTowerIcon />
                    {t("createSession")}
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* <div className="grid">
          <Separator />
          {[t("steps.speak"), t("steps.share"), t("steps.languages")].map(
            (text, index) => (
              <div key={text}>
                <div className="grid grid-cols-[2rem_1fr] gap-4 py-4">
                  <span className="font-mono text-xs text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {text}
                  </p>
                </div>
                <Separator />
              </div>
            )
          )}
        </div> */}

        <p className="text-center font-mono text-xl text-muted-foreground">
          <a
            target="_blank"
            href="https://bpr.cz/"
            rel="noopener noreferrer"
            className="whitespace-nowrap text-primary underline-offset-4 hover:underline"
          >
            Powered by BPR s.r.o
          </a>
        </p>
      </section>
    </main>
  );
}
