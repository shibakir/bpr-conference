"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CaptionsIcon, RadioTowerIcon, Volume2Icon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import useSWR from "swr";

import { CenteredPage } from "@/components/CenteredPage";
import { PasswordInput } from "@/components/PasswordInput";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Field,
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
    FieldLegend,
    FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
    const [langSearch, setLangSearch] = useState("");
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
    const translationOutputs =
        useWatch({ control, name: "translationOutputs" }) ?? DEFAULT_TRANSLATION_OUTPUTS;
    const selectedLanguages =
        useWatch({ control, name: "selectedLanguages" }) ?? DEFAULT_SELECTED_LANGUAGES;

    function setSelectedLanguagesValue(next: string[]) {
        setValue("selectedLanguages", next, FORM_UPDATE_OPTIONS);
    }

    function setTranslationOutputsValue(next: TranslationOutputMode[]) {
        setValue("translationOutputs", next, FORM_UPDATE_OPTIONS);
    }

    function setLanguageSelected(languageCode: string, selected: boolean) {
        setSelectedLanguagesValue(
            selected
                ? Array.from(new Set([...selectedLanguages, languageCode]))
                : selectedLanguages.filter((code) => code !== languageCode),
        );
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

    const filteredLanguages = useMemo(() => {
        const query = langSearch.trim();

        if (!query) {
            return languageOptions;
        }

        const localeQuery = query.toLocaleLowerCase(locale);
        const normalizedQuery = query.toLowerCase();

        return languageOptions.filter(
            (lang) =>
                lang.displayName.toLocaleLowerCase(locale).includes(localeQuery) ||
                lang.name.toLowerCase().includes(normalizedQuery) ||
                lang.code.toLowerCase().includes(normalizedQuery),
        );
    }, [languageOptions, langSearch, locale]);

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
                                            {t("passwordLabel")}
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
                                    <FieldLabel htmlFor="session-duration">
                                        {t("duration")}
                                    </FieldLabel>
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

                                        <div className="rounded-lg bg-muted/20 p-1">
                                            <div className="p-1 pb-0">
                                                <Input
                                                    type="search"
                                                    placeholder={t("searchLanguages")}
                                                    value={langSearch}
                                                    disabled={isSubmitting}
                                                    onChange={(event) =>
                                                        setLangSearch(event.target.value)
                                                    }
                                                />
                                            </div>
                                            <div
                                                className="h-40 overflow-y-auto px-1 py-1"
                                                role="group"
                                                aria-label={t("restrictLanguages")}
                                            >
                                                {filteredLanguages.length === 0 ? (
                                                    <p className="py-6 text-center text-base text-muted-foreground">
                                                        {t("noLanguagesFound")}
                                                    </p>
                                                ) : (
                                                    <div className="grid gap-1">
                                                        {filteredLanguages.map((lang) => {
                                                            const isChecked =
                                                                selectedLanguages.includes(
                                                                    lang.code,
                                                                );
                                                            const id = `allowed-language-${lang.code}`;

                                                            return (
                                                                <div
                                                                    key={lang.code}
                                                                    className="flex min-h-9 items-center gap-2 rounded-sm px-2 py-1.5 text-base transition-colors hover:bg-muted"
                                                                >
                                                                    <Checkbox
                                                                        id={id}
                                                                        checked={isChecked}
                                                                        disabled={isSubmitting}
                                                                        onCheckedChange={(
                                                                            checked,
                                                                        ) =>
                                                                            setLanguageSelected(
                                                                                lang.code,
                                                                                checked === true,
                                                                            )
                                                                        }
                                                                    />
                                                                    <label
                                                                        htmlFor={id}
                                                                        className={cn(
                                                                            "min-w-0 flex-1 cursor-pointer select-none",
                                                                            isSubmitting &&
                                                                                "cursor-not-allowed opacity-50",
                                                                        )}
                                                                    >
                                                                        <span className="block truncate">
                                                                            {lang.flag}{" "}
                                                                            {lang.displayName}
                                                                        </span>
                                                                    </label>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

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
