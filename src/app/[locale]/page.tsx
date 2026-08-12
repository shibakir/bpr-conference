"use client";

import { zodResolver } from "@hookform/resolvers/zod";
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
import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import useSWR from "swr";

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
import { ApiRequestError, fetchValidatedJson } from "@/lib/api-client";
import { API_ERROR_CODES, type ApiErrorCode } from "@/lib/api-errors";
import {
  authStatusResponseSchema,
  createSessionFormSchema,
  type CreateSessionFormValues,
  createSessionResponseSchema,
} from "@/lib/api-schemas";
import { getLanguageDisplayName, SUPPORTED_LANGUAGES } from "@/lib/languages";
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

function getDefaultFormValues(): CreateSessionFormValues {
  return {
    durationMinutes: DEFAULT_SESSION_DURATION_MINUTES,
    inputLanguageMode: "multi",
    langSearch: "",
    password: "",
    restrictLanguages: true,
    selectedLanguages: [...DEFAULT_LANGUAGES],
    sourceLanguage: DEFAULT_SOURCE_LANGUAGE,
    translationOutputs: [...DEFAULT_TRANSLATION_OUTPUTS],
  };
}

async function fetchAuthStatus(url: string) {
  return fetchValidatedJson(url, undefined, authStatusResponseSchema);
}

const FORM_UPDATE_OPTIONS = {
  shouldDirty: true,
  shouldValidate: true,
} as const;

export default function Home() {
  const t = useTranslations("Home");
  const locale = useLocale();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { data: authStatus } = useSWR("/api/auth/status", fetchAuthStatus, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  const passwordRequired = authStatus?.passwordRequired === true;
  const {
    control,
    formState: { isSubmitting },
    handleSubmit,
    register,
    setValue,
  } = useForm<CreateSessionFormValues>({
    defaultValues: getDefaultFormValues(),
    resolver: zodResolver(createSessionFormSchema),
  });
  const durationMinutes =
    useWatch({ control, name: "durationMinutes" }) ??
    DEFAULT_SESSION_DURATION_MINUTES;
  const inputLanguageMode =
    useWatch({ control, name: "inputLanguageMode" }) ?? "multi";
  const sourceLanguage =
    useWatch({ control, name: "sourceLanguage" }) ?? DEFAULT_SOURCE_LANGUAGE;
  const translationOutputs =
    useWatch({ control, name: "translationOutputs" }) ??
    DEFAULT_TRANSLATION_OUTPUTS;
  const restrictLanguages =
    useWatch({ control, name: "restrictLanguages" }) ?? true;
  const selectedLanguages =
    useWatch({ control, name: "selectedLanguages" }) ?? DEFAULT_LANGUAGES;
  const langSearch = useWatch({ control, name: "langSearch" }) ?? "";

  function setSelectedLanguagesValue(next: string[]) {
    setValue("selectedLanguages", next, FORM_UPDATE_OPTIONS);
  }

  function setTranslationOutputsValue(next: TranslationOutputMode[]) {
    setValue("translationOutputs", next, FORM_UPDATE_OPTIONS);
  }

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
  function handleSourceLanguageChange(nextSourceLanguage: string) {
    setValue("sourceLanguage", nextSourceLanguage, FORM_UPDATE_OPTIONS);
    if (inputLanguageMode === "single") {
      setSelectedLanguagesValue(
        selectedLanguages.filter((code) => code !== nextSourceLanguage)
      );
    }
  }

  function handleInputLanguageModeChange(nextMode: InputLanguageMode) {
    setValue("inputLanguageMode", nextMode, FORM_UPDATE_OPTIONS);
    if (nextMode === "single") {
      setSelectedLanguagesValue(
        selectedLanguages.filter((code) => code !== sourceLanguage)
      );
    }
  }

  function toggleTranslationOutput(output: TranslationOutputMode) {
    const next = new Set(translationOutputs);
    if (next.has(output)) {
      next.delete(output);
    } else {
      next.add(output);
    }

    setTranslationOutputsValue(
      TRANSLATION_OUTPUT_MODES.filter((mode) => next.has(mode))
    );
  }

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

  async function createSession(values: CreateSessionFormValues) {
    setError(null);
    const valuesEnableAudioTranslation =
      values.translationOutputs.includes("audio");
    const valuesEnableTranscription =
      values.translationOutputs.includes("text");
    const selectedLanguagesForSubmit = values.selectedLanguages.filter(
      (code) =>
        values.inputLanguageMode !== "single" ||
        code !== values.sourceLanguage
    );

    try {
      const data = await fetchValidatedJson(
        "/api/sessions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizerName: "host",
            password: values.password,
            locale,
            inputLanguageMode: values.inputLanguageMode,
            sourceLanguage:
              values.inputLanguageMode === "single"
                ? values.sourceLanguage
                : undefined,
            translationOutputs: values.translationOutputs,
            enableAudioTranslation: valuesEnableAudioTranslation,
            enableTranscription: valuesEnableTranscription,
            enableInputDiagnostics: true,
            durationMinutes: values.durationMinutes,
            allowedLanguages: values.restrictLanguages
              ? selectedLanguagesForSubmit
              : undefined,
          }),
        },
        createSessionResponseSchema,
      );

      if (passwordRequired) {
        sessionStorage.setItem("broadcast_password", values.password);
      }
      router.push(`/session/${data.sessionId}/broadcast`);
    } catch (requestError) {
      if (requestError instanceof ApiRequestError) {
        setError(getCreateSessionErrorMessage(requestError.code));
        return;
      }

      console.error("Failed to create session:", requestError);
      setError(t("createError"));
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
            <form className="grid gap-4" onSubmit={handleSubmit(createSession)}>
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
                    disabled={isSubmitting}
                    {...register("password")}
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
                    setValue(
                      "durationMinutes",
                      value[0] ?? DEFAULT_SESSION_DURATION_MINUTES,
                      FORM_UPDATE_OPTIONS,
                    )
                  }
                  disabled={isSubmitting}
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
                  onChange={(event) =>
                    handleInputLanguageModeChange(
                      event.target.value === "single" ? "single" : "multi",
                    )
                  }
                  disabled={isSubmitting}
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
                  onChange={(event) =>
                    handleSourceLanguageChange(event.target.value)
                  }
                  disabled={isSubmitting}
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
                        disabled={isSubmitting}
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
                      setValue(
                        "restrictLanguages",
                        checked === true,
                        FORM_UPDATE_OPTIONS,
                      )
                    }
                    disabled={isSubmitting}
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
                                setSelectedLanguagesValue(
                                  selectedLanguages.filter(
                                    (item) => item !== code,
                                  )
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
                        onChange={(event) =>
                          setValue(
                            "langSearch",
                            event.target.value,
                            FORM_UPDATE_OPTIONS,
                          )
                        }
                        disabled={isSubmitting}
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
                                    setSelectedLanguagesValue(
                                      isChecked
                                        ? selectedLanguages.filter(
                                            (code) => code !== lang.code
                                          )
                                        : [...selectedLanguages, lang.code]
                                    );
                                  }}
                                  disabled={isSubmitting}
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
                            setSelectedLanguagesValue(
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
                          onClick={() => setSelectedLanguagesValue([])}
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
                disabled={isSubmitting}
                id="create-session-btn"
                className="w-full"
              >
                {isSubmitting ? (
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
