"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CaptionsIcon, ClockIcon, RadioTowerIcon, Volume2Icon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import useSWR from "swr";

import { CenteredPage } from "@/components/CenteredPage";
import { PasswordInput } from "@/components/PasswordInput";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Field,
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
    FieldLegend,
    FieldSet,
} from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useRouter } from "@/i18n/navigation";
import { ApiRequestError, fetchValidatedJson } from "@/lib/api-client";
import { API_ERROR_CODES, type ApiErrorCode } from "@/lib/api-errors";
import {
    authStatusResponseSchema,
    createSessionFormSchema,
    type CreateSessionFormValues,
    createSessionResponseSchema,
} from "@/lib/api-schemas";
import { clientLogger } from "@/lib/client-logger";
import { getLanguageDisplayName, SUPPORTED_LANGUAGES } from "@/lib/languages";
import {
    DEFAULT_SESSION_DURATION_MINUTES,
    formatSessionDurationLabel,
    SESSION_DURATION_OPTIONS_MINUTES,
} from "@/lib/session-duration";
import { TRANSLATION_OUTPUT_MODES, type TranslationOutputMode } from "@/lib/session-types";
import { cn } from "@/lib/utils";

const DEFAULT_SELECTED_LANGUAGES: string[] = [];

const DEFAULT_TRANSLATION_OUTPUTS: TranslationOutputMode[] = ["audio"];

function getDefaultFormValues(): CreateSessionFormValues {
    return {
        durationMinutes: DEFAULT_SESSION_DURATION_MINUTES,
        langSearch: "",
        password: "",
        selectedLanguages: [...DEFAULT_SELECTED_LANGUAGES],
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
    const { data: authStatus, isLoading: isAuthStatusLoading } = useSWR(
        "/api/auth/status",
        fetchAuthStatus,
        {
            revalidateOnFocus: false,
            shouldRetryOnError: false,
        },
    );
    const passwordRequired = authStatus?.passwordRequired === true;
    const {
        control,
        formState: { errors, isSubmitting },
        handleSubmit,
        register,
        setValue,
    } = useForm<CreateSessionFormValues>({
        defaultValues: getDefaultFormValues(),
        resolver: zodResolver(createSessionFormSchema),
    });
    const durationMinutes =
        useWatch({ control, name: "durationMinutes" }) ?? DEFAULT_SESSION_DURATION_MINUTES;
    const durationLabel = formatSessionDurationLabel(durationMinutes, locale);
    const translationOutputs =
        useWatch({ control, name: "translationOutputs" }) ?? DEFAULT_TRANSLATION_OUTPUTS;
    const selectedLanguages =
        useWatch({ control, name: "selectedLanguages" }) ?? DEFAULT_SELECTED_LANGUAGES;
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
                }),
            ),
        [locale],
    );

    const filteredLanguages = languageOptions.filter((lang) => {
        const query = langSearch.trim().toLocaleLowerCase(locale);
        return (
            lang.displayName.toLocaleLowerCase(locale).includes(query) ||
            lang.name.toLowerCase().includes(query.toLowerCase()) ||
            lang.code.toLowerCase().includes(query.toLowerCase())
        );
    });

    function getCreateSessionErrorMessage(code: ApiErrorCode | undefined) {
        switch (code) {
            case API_ERROR_CODES.INCORRECT_PASSWORD:
                return t("incorrectPassword");
            case API_ERROR_CODES.INVALID_SESSION_DURATION:
                return t("invalidSessionDuration");
            case API_ERROR_CODES.INVALID_LOCALE:
            case API_ERROR_CODES.INVALID_REQUEST:
                return t("invalidSessionSettings");
            default:
                return t("createError");
        }
    }

    async function createSession(values: CreateSessionFormValues) {
        setError(null);
        const valuesEnableAudioTranslation = values.translationOutputs.includes("audio");
        const valuesEnableTranscription = values.translationOutputs.includes("text");

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
                        translationOutputs: values.translationOutputs,
                        enableAudioTranslation: valuesEnableAudioTranslation,
                        enableTranscription: valuesEnableTranscription,
                        durationMinutes: values.durationMinutes,
                        allowedLanguages: values.selectedLanguages,
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

            clientLogger.error("Failed to create session:", requestError);
            setError(t("createError"));
        }
    }

    return (
        <CenteredPage className="sm:px-6">
            <section className="grid w-full max-w-xl gap-6">
                <Card className="shadow-md shadow-foreground/5">
                    <CardHeader className="px-5 pt-5 sm:px-6">
                        <CardTitle className="text-left">{t("createSession")}</CardTitle>
                    </CardHeader>
                    <CardContent className="px-5 pb-5 sm:px-6 sm:pb-6">
                        <form className="grid gap-6" onSubmit={handleSubmit(createSession)}>
                            <FieldGroup className="gap-6">
                                {isAuthStatusLoading && !authStatus ? (
                                    <Field aria-hidden="true">
                                        <Skeleton className="h-4 w-48" />
                                        <Skeleton className="h-8 w-full rounded-lg" />
                                    </Field>
                                ) : passwordRequired ? (
                                    <Field data-invalid={!!errors.password}>
                                        <FieldLabel htmlFor="broadcast-password">
                                            {t("passwordPlaceholder")}
                                        </FieldLabel>
                                        <PasswordInput
                                            id="broadcast-password"
                                            autoComplete="new-password"
                                            placeholder={t("passwordPlaceholder")}
                                            disabled={isSubmitting}
                                            aria-invalid={!!errors.password}
                                            {...register("password")}
                                        />
                                        <FieldError errors={[errors.password]} />
                                    </Field>
                                ) : null}

                                <FieldSet className="gap-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <FieldLabel
                                            htmlFor="session-duration"
                                            className="flex items-center gap-2"
                                        >
                                            <ClockIcon className="size-4 text-muted-foreground" />
                                            {t("duration")}
                                        </FieldLabel>
                                        <Badge
                                            variant="secondary"
                                            className="font-mono tabular-nums"
                                        >
                                            {durationLabel}
                                        </Badge>
                                    </div>
                                    <NativeSelect
                                        id="session-duration"
                                        className="w-full"
                                        aria-label={t("duration")}
                                        aria-invalid={!!errors.durationMinutes}
                                        value={String(durationMinutes)}
                                        onChange={(event) =>
                                            setValue(
                                                "durationMinutes",
                                                Number(event.target.value),
                                                FORM_UPDATE_OPTIONS,
                                            )
                                        }
                                        disabled={isSubmitting}
                                    >
                                        {SESSION_DURATION_OPTIONS_MINUTES.map((duration) => (
                                            <NativeSelectOption
                                                key={duration}
                                                value={String(duration)}
                                            >
                                                {formatSessionDurationLabel(duration, locale)}
                                            </NativeSelectOption>
                                        ))}
                                    </NativeSelect>
                                    <FieldDescription>{t("durationDescription")}</FieldDescription>
                                    <FieldError errors={[errors.durationMinutes]} />
                                </FieldSet>

                                <FieldSet className="gap-3 border-t border-border/35 pt-5">
                                    <div className="grid gap-1">
                                        <FieldLegend variant="label">
                                            {t("translationOutputs")}
                                        </FieldLegend>
                                        <FieldDescription>
                                            {t("translationOutputsDescription")}
                                        </FieldDescription>
                                    </div>
                                    <ToggleGroup
                                        type="multiple"
                                        value={translationOutputs}
                                        disabled={isSubmitting}
                                        aria-label={t("translationOutputs")}
                                        className="grid w-full gap-2 sm:grid-cols-2"
                                        onValueChange={(value) =>
                                            setTranslationOutputsValue(
                                                TRANSLATION_OUTPUT_MODES.filter((mode) =>
                                                    value.includes(mode),
                                                ),
                                            )
                                        }
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
                                            const selected = translationOutputs.includes(
                                                option.value,
                                            );

                                            return (
                                                <ToggleGroupItem
                                                    key={option.value}
                                                    value={option.value}
                                                    aria-label={option.label}
                                                    className="h-auto min-h-24 w-full items-center justify-start gap-3 whitespace-normal border-transparent bg-muted/35 p-3 text-left shadow-none data-[state=on]:border-primary/70 data-[state=on]:bg-primary/12"
                                                >
                                                    <span
                                                        className={cn(
                                                            "flex size-8 shrink-0 items-center justify-center rounded-md",
                                                            selected
                                                                ? "bg-primary text-primary-foreground"
                                                                : "bg-muted text-muted-foreground",
                                                        )}
                                                    >
                                                        <Icon className="size-4" />
                                                    </span>
                                                    <span className="grid gap-1">
                                                        <span className="font-medium">
                                                            {option.label}
                                                        </span>
                                                        <span className="text-sm leading-5 text-muted-foreground">
                                                            {option.description}
                                                        </span>
                                                    </span>
                                                </ToggleGroupItem>
                                            );
                                        })}
                                    </ToggleGroup>
                                    <FieldError>
                                        {errors.translationOutputs
                                            ? t("selectAtLeastOneTranslationOutput")
                                            : null}
                                    </FieldError>
                                </FieldSet>

                                <div className="border-t border-border/35 pt-5">
                                    <FieldSet className="gap-3">
                                        <FieldLegend variant="label">
                                            {t("restrictLanguages")}
                                        </FieldLegend>

                                        <Command
                                            shouldFilter={false}
                                            className="rounded-lg bg-muted/20"
                                        >
                                            <CommandInput
                                                placeholder={t("searchLanguages")}
                                                className="text-lg sm:text-base"
                                                value={langSearch}
                                                disabled={isSubmitting}
                                                onValueChange={(value) =>
                                                    setValue(
                                                        "langSearch",
                                                        value,
                                                        FORM_UPDATE_OPTIONS,
                                                    )
                                                }
                                            />
                                            <CommandList className="h-40 max-h-40">
                                                {filteredLanguages.length === 0 ? (
                                                    <CommandEmpty>
                                                        {t("noLanguagesFound")}
                                                    </CommandEmpty>
                                                ) : (
                                                    <CommandGroup>
                                                        {filteredLanguages.map((lang) => {
                                                            const isChecked =
                                                                selectedLanguages.includes(
                                                                    lang.code,
                                                                );
                                                            return (
                                                                <CommandItem
                                                                    key={lang.code}
                                                                    value={lang.code}
                                                                    data-checked={isChecked}
                                                                    disabled={isSubmitting}
                                                                    onSelect={() => {
                                                                        setSelectedLanguagesValue(
                                                                            isChecked
                                                                                ? selectedLanguages.filter(
                                                                                      (code) =>
                                                                                          code !==
                                                                                          lang.code,
                                                                                  )
                                                                                : [
                                                                                      ...selectedLanguages,
                                                                                      lang.code,
                                                                                  ],
                                                                        );
                                                                    }}
                                                                >
                                                                    <span>
                                                                        {lang.flag}{" "}
                                                                        {lang.displayName}
                                                                    </span>
                                                                </CommandItem>
                                                            );
                                                        })}
                                                    </CommandGroup>
                                                )}
                                            </CommandList>
                                        </Command>

                                        <div className="flex justify-end gap-1">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="xs"
                                                onClick={() =>
                                                    setSelectedLanguagesValue(
                                                        languageOptions.map((lang) => lang.code),
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
                                        <FieldError>
                                            {errors.selectedLanguages
                                                ? t("selectAtLeastOneLanguage")
                                                : null}
                                        </FieldError>
                                    </FieldSet>
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
                            </FieldGroup>
                        </form>
                    </CardContent>
                </Card>

                {/* <div className="grid">
          <Separator />
          {[t("steps.speak"), t("steps.share"), t("steps.languages")].map(
            (text, index) => (
              <div key={text}>
                <div className="grid grid-cols-[2rem_1fr] gap-4 py-4">
                  <span className="font-mono text-sm text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <p className="text-base leading-6 text-muted-foreground">
                    {text}
                  </p>
                </div>
                <Separator />
              </div>
            )
          )}
        </div> */}

                <p className="text-center text-base text-muted-foreground">
                    <a
                        target="_blank"
                        href="https://bpr.cz/"
                        rel="noopener noreferrer"
                        className="underline-offset-4 hover:text-foreground hover:underline"
                    >
                        Powered by <span className="font-medium text-foreground">BPR s.r.o</span>
                    </a>
                </p>
            </section>
        </CenteredPage>
    );
}
