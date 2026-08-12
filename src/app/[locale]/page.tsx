"use client";

import {
  CaptionsIcon,
  ClockIcon,
  LanguagesIcon,
  RadioTowerIcon,
  SearchIcon,
  Volume2Icon,
  XIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type ChangeEvent, type FormEvent, useEffect, useMemo, useState } from "react";

import { CenteredPage } from "@/components/CenteredPage";
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
  type ApiErrorCode,
  getApiErrorCode,
} from "@/lib/api-errors";
import { readJsonResponse } from "@/lib/api-request";
import { getLanguageDisplayName,SUPPORTED_LANGUAGES } from "@/lib/languages";
import {
  DEFAULT_SESSION_DURATION_MINUTES,
  MAX_SESSION_DURATION_MINUTES,
  MIN_SESSION_DURATION_MINUTES,
} from "@/lib/session-duration";
import {
  type InputLanguageMode,
  TRANSLATION_OUTPUT_MODES,
  type TranslationOutputMode,
} from "@/lib/session-types";
import { cn } from "@/lib/utils";

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
const DEFAULT_TRANSLATION_OUTPUTS: TranslationOutputMode[] = ["audio"];

type AuthStatusResponse = {
  passwordRequired?: unknown;
};

type CreateSessionResponse = {
  sessionId?: unknown;
};

export default function Home() {
  const t = useTranslations("Home");
  const locale = useLocale();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [inputLanguageMode, setInputLanguageMode] =
    useState<InputLanguageMode>("multi");
  const [sourceLanguage, setSourceLanguage] = useState(DEFAULT_SOURCE_LANGUAGE);
  const [durationMinutes, setDurationMinutes] = useState(
    DEFAULT_SESSION_DURATION_MINUTES
  );
  const [translationOutputs, setTranslationOutputs] =
    useState<TranslationOutputMode[]>(DEFAULT_TRANSLATION_OUTPUTS);
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
    () =>
      languageOptions.filter(
        (lang) =>
          inputLanguageMode !== "single" || lang.code !== sourceLanguage
      ),
    [inputLanguageMode, languageOptions, sourceLanguage]
  );

  const selectedTranslationLanguages = useMemo(
    () =>
      selectedLanguages.filter(
        (code) =>
          inputLanguageMode !== "single" || code !== sourceLanguage
      ),
    [inputLanguageMode, selectedLanguages, sourceLanguage]
  );

  const filteredLanguages = translationLanguageOptions.filter((lang) => {
    const query = langSearch.trim().toLocaleLowerCase(locale);
    return (
      lang.displayName.toLocaleLowerCase(locale).includes(query) ||
      lang.name.toLowerCase().includes(query.toLowerCase()) ||
      lang.code.toLowerCase().includes(query.toLowerCase())
    );
  });
  const enableAudioTranslation = translationOutputs.includes("audio");
  const enableTranscription = translationOutputs.includes("text");

  function handleSourceLanguageChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextSourceLanguage = event.target.value;
    setSourceLanguage(nextSourceLanguage);
    if (inputLanguageMode === "single") {
      setSelectedLanguages((prev) =>
        prev.filter((code) => code !== nextSourceLanguage)
      );
    }
  }

  function handleInputLanguageModeChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextMode = event.target.value === "single" ? "single" : "multi";
    setInputLanguageMode(nextMode);
    if (nextMode === "single") {
      setSelectedLanguages((prev) =>
        prev.filter((code) => code !== sourceLanguage)
      );
    }
  }

  function toggleTranslationOutput(output: TranslationOutputMode) {
    setTranslationOutputs((prev) => {
      const next = new Set(prev);
      if (next.has(output)) {
        next.delete(output);
      } else {
        next.add(output);
      }

      return TRANSLATION_OUTPUT_MODES.filter((mode) => next.has(mode));
    });
  }

  useEffect(() => {
    async function checkAuthStatus() {
      try {
        const res = await fetch("/api/auth/status");
        const data = await readJsonResponse<AuthStatusResponse>(res);
        setPasswordRequired(data.passwordRequired === true);
      } catch (err) {
        console.error("Failed to check auth status:", err);
      }
    }
    void checkAuthStatus();
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
          inputLanguageMode,
          sourceLanguage:
            inputLanguageMode === "single" ? sourceLanguage : undefined,
          translationOutputs,
          enableAudioTranslation,
          enableTranscription,
          enableInputDiagnostics: true,
          durationMinutes,
          allowedLanguages: restrictLanguages
            ? selectedTranslationLanguages
            : undefined,
        }),
      });
      const data = await readJsonResponse<CreateSessionResponse>(res);
      if (!res.ok) {
        setError(getCreateSessionErrorMessage(getApiErrorCode(data)));
        setLoading(false);
        return;
      }
      if (typeof data.sessionId !== "string") {
        setError(t("createError"));
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
      void createSession();
    }
  }

  const title = t("title");
  const titleHighlight = "BPR";
  const titleHighlightIndex = title.indexOf(titleHighlight);

  return (
    <CenteredPage className="sm:px-6">
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
                <Label htmlFor="input-language-mode">
                  {t("inputLanguageMode")}
                </Label>
                <NativeSelect
                  id="input-language-mode"
                  className="w-full"
                  value={inputLanguageMode}
                  onChange={handleInputLanguageModeChange}
                  disabled={loading}
                >
                  <NativeSelectOption value="multi">
                    {t("inputLanguageModeMulti")}
                  </NativeSelectOption>
                  <NativeSelectOption value="single">
                    {t("inputLanguageModeSingle")}
                  </NativeSelectOption>
                </NativeSelect>
                <p className="text-xs leading-5 text-muted-foreground">
                  {inputLanguageMode === "multi"
                    ? t("inputLanguageModeMultiDescription")
                    : t("inputLanguageModeSingleDescription")}
                </p>
              </div>

              {inputLanguageMode === "single" && (
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
              )}

              <div className="grid gap-3 rounded-lg border bg-muted/30 p-3">
                <div className="grid gap-1">
                  <Label>{t("translationOutputs")}</Label>
                  <p className="text-xs leading-5 text-muted-foreground">
                    {t("translationOutputsDescription")}
                  </p>
                </div>

                <div
                  role="group"
                  aria-label={t("translationOutputs")}
                  className="grid gap-2 sm:grid-cols-2"
                >
                  {[
                    {
                      description: t("enableVoiceTranslationDescription"),
                      icon: Volume2Icon,
                      label: t("enableVoiceTranslation"),
                      value: "audio" as const,
                    },
                    {
                      description: t("enableTextTranslationDescription"),
                      icon: CaptionsIcon,
                      label: t("enableTextTranslation"),
                      value: "text" as const,
                    },
                  ].map((option) => {
                    const Icon = option.icon;
                    const selected = translationOutputs.includes(option.value);

                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={selected}
                        disabled={loading}
                        onClick={() => toggleTranslationOutput(option.value)}
                        className={cn(
                          "flex min-h-24 items-start gap-3 rounded-lg border p-3 text-left transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-60",
                          selected
                            ? "border-primary bg-primary/10"
                            : "border-border bg-background hover:bg-muted"
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-8 shrink-0 items-center justify-center rounded-md",
                            selected
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          <Icon className="size-4" />
                        </span>
                        <span className="grid gap-1">
                          <span className="font-medium">{option.label}</span>
                          <span className="text-xs leading-5 text-muted-foreground">
                            {option.description}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {t("translationOutputsSelectedCount", {
                      count: translationOutputs.length,
                    })}
                  </span>
                  {translationOutputs.length === 0 && (
                    <span>{t("translationOutputsNone")}</span>
                  )}
                </div>
              </div>

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
    </CenteredPage>
  );
}
