"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { LanguagesIcon, RadioTowerIcon, SearchIcon, XIcon } from "lucide-react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Link, useRouter } from "@/i18n/navigation";
import { locales } from "@/i18n/routing";
import { SUPPORTED_LANGUAGES, getLanguageDisplayName } from "@/lib/languages";

const DEFAULT_LANGUAGES = [
  "en",
  "zh-Hans",
  "hi",
  "es",
  "fr",
  "ar",
  "bn",
  "pt-BR",
  "ru",
  "ur",
];

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
          locale,
          allowedLanguages: restrictLanguages ? selectedLanguages : undefined,
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
                    placeholder={t("passwordPlaceholder")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                  />
                </div>
              )}

              <div className="grid gap-2">
                <Label htmlFor="event-id">{t("eventPlaceholder")}</Label>
                <Input
                  id="event-id"
                  type="text"
                  placeholder={t("eventPlaceholder")}
                  value={eventId}
                  onChange={(e) => setEventId(e.target.value)}
                  disabled={loading}
                />
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
                      {t("selectedCount", { count: selectedLanguages.length })}
                    </span>
                  </span>
                </Label>

                {restrictLanguages && (
                  <div className="grid gap-3">
                    {selectedLanguages.length > 0 && (
                      <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-dashed bg-background p-2 pr-1 [scrollbar-gutter:stable]">
                        {selectedLanguages.map((code) => {
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
                        {t("selectedCount", { count: selectedLanguages.length })}
                      </span>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() =>
                            setSelectedLanguages(
                              SUPPORTED_LANGUAGES.map((lang) => lang.code)
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
                  <>j
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
