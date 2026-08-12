"use client";

import { useRoomContext, useTracks } from "@livekit/components-react";
import { Track } from "livekit-client";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useMemo, useRef, useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useWakeLock } from "@/hooks/use-wake-lock";
import {
  getLanguageByCode,
  getLanguageDisplayName,
  SUPPORTED_LANGUAGES,
} from "@/lib/languages";

import { useFontSizePreference } from "../hooks/useFontSizePreference";
import { useOrganizerAudioPresence } from "../hooks/useOrganizerAudioPresence";
import { useParticipantLanguageAttribute } from "../hooks/useParticipantLanguageAttribute";
import { useSelectedAudioSubscription } from "../hooks/useSelectedAudioSubscription";
import { useSessionDetails } from "../hooks/useSessionDetails";
import {
  useTranscriptAutoScroll,
  useTranslatedTranscripts,
} from "../hooks/useTranslatedTranscripts";
import { useTranslationSubscriptions } from "../hooks/useTranslationSubscriptions";
import {
  type FloatingCaptionPanel,
  FloatingTranscriptWindow,
} from "./FloatingTranscriptWindow";
import LanguageSelector from "./LanguageSelector";
import { ListenerStatus } from "./ListenerStatus";
import { TranscriptPanel } from "./TranscriptPanel";

type CaptionLanguageOption = {
  code: string;
  flag: string;
  label: string;
};

export function AttendeeView({
  sessionId,
  expiresAt,
  onSessionExpired,
}: {
  sessionId: string;
  expiresAt: string | null;
  onSessionExpired: () => void;
}) {
  const t = useTranslations("Watch");
  const languageT = useTranslations("LanguageSelector");
  const locale = useLocale();
  const room = useRoomContext();
  const [currentLanguage, setCurrentLanguage] = useState("original");
  const [audioMuted, setAudioMuted] = useState(false);
  const [selectedCaptionLanguages, setSelectedCaptionLanguages] = useState<
    string[]
  >([]);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const audioTracks = useTracks([Track.Source.Microphone]);
  const isWakeLockActive = useWakeLock();
  const isConnected = useOrganizerAudioPresence(room);
  const sessionDetails = useSessionDetails(sessionId);
  const fontSizePreference = useFontSizePreference();
  const translationOutputsEnabled =
    sessionDetails.enableAudioTranslation || sessionDetails.enableTranscription;
  const availableTranslationLanguages = useMemo<CaptionLanguageOption[]>(() => {
    if (!sessionDetails.loaded) return [];

    const baseTranslationLanguages = sessionDetails.allowedLanguages
      ? SUPPORTED_LANGUAGES.filter((lang) =>
          sessionDetails.allowedLanguages?.includes(lang.code)
        )
      : SUPPORTED_LANGUAGES;

    return baseTranslationLanguages
      .filter(
        (lang) =>
          sessionDetails.inputLanguageMode !== "single" ||
          lang.code !== sessionDetails.sourceLanguage
      )
      .map((lang) => ({
        code: lang.code,
        flag: lang.flag,
        label: getLanguageDisplayName(lang, locale),
      }))
      .sort((a, b) =>
        a.label.localeCompare(b.label, locale, { sensitivity: "base" })
      );
  }, [
    locale,
    sessionDetails.allowedLanguages,
    sessionDetails.inputLanguageMode,
    sessionDetails.loaded,
    sessionDetails.sourceLanguage,
  ]);
  const availableCaptionLanguages = useMemo(
    () =>
      sessionDetails.enableTranscription ? availableTranslationLanguages : [],
    [availableTranslationLanguages, sessionDetails.enableTranscription]
  );
  const availableTranslationLanguageCodes = useMemo(
    () => availableTranslationLanguages.map((language) => language.code),
    [availableTranslationLanguages]
  );
  const availableCaptionLanguageCodes = useMemo(
    () => availableCaptionLanguages.map((language) => language.code),
    [availableCaptionLanguages]
  );
  const visibleSelectedCaptionLanguages = useMemo(
    () =>
      availableCaptionLanguageCodes.filter((language) =>
        selectedCaptionLanguages.includes(language)
      ),
    [availableCaptionLanguageCodes, selectedCaptionLanguages]
  );
  const audioTranslationRequested =
    !audioMuted &&
    currentLanguage !== "original" &&
    sessionDetails.enableAudioTranslation &&
    availableTranslationLanguageCodes.includes(currentLanguage);

  const desiredTranslationLanguages = useMemo(() => {
    const desiredLanguages = new Set<string>();
    if (audioTranslationRequested) {
      desiredLanguages.add(currentLanguage);
    }
    if (sessionDetails.enableTranscription) {
      for (const language of visibleSelectedCaptionLanguages) {
        desiredLanguages.add(language);
      }
    }

    const orderedLanguages = availableTranslationLanguageCodes.filter(
      (language) => desiredLanguages.has(language)
    );
    if (
      audioTranslationRequested &&
      !orderedLanguages.includes(currentLanguage)
    ) {
      orderedLanguages.unshift(currentLanguage);
    }
    return orderedLanguages;
  }, [
    audioTranslationRequested,
    availableTranslationLanguageCodes,
    currentLanguage,
    sessionDetails.enableTranscription,
    visibleSelectedCaptionLanguages,
  ]);
  const { subscriptions } = useTranslationSubscriptions({
    enabled: translationOutputsEnabled && sessionDetails.loaded,
    languages: desiredTranslationLanguages,
    sessionId,
  });
  const desiredTranslationLanguageSet = useMemo(
    () => new Set(desiredTranslationLanguages),
    [desiredTranslationLanguages]
  );
  const { transcriptsByLanguage } = useTranslatedTranscripts({
    room,
    enabled: sessionDetails.enableTranscription,
    languages: desiredTranslationLanguages,
  });
  const translatorIdentity = audioTranslationRequested
    ? (subscriptions[currentLanguage]?.translatorIdentity ?? null)
    : null;
  const currentTranslationState = audioTranslationRequested
    ? subscriptions[currentLanguage]
    : undefined;
  const currentTranslationLoading =
    audioTranslationRequested &&
    currentTranslationState === undefined &&
    sessionDetails.loaded;
  const primaryTranscriptLanguage =
    visibleSelectedCaptionLanguages[0] ??
    (audioTranslationRequested ? currentLanguage : "original");
  const transcripts =
    primaryTranscriptLanguage !== "original"
      ? (transcriptsByLanguage[primaryTranscriptLanguage] ?? [])
      : [];
  const captionLanguageLabels = useMemo(() => {
    return new Map(
      availableCaptionLanguages.map((language) => [
        language.code,
        `${language.flag} ${language.label}`,
      ])
    );
  }, [availableCaptionLanguages]);
  const captionPanels = useMemo<FloatingCaptionPanel[]>(
    () =>
      visibleSelectedCaptionLanguages.map((language) => {
        const subscription = subscriptions[language];
        const loading =
          desiredTranslationLanguageSet.has(language) &&
          subscription === undefined &&
          translationOutputsEnabled &&
          sessionDetails.loaded;
        const fallbackLanguage = getLanguageByCode(language);
        return {
          emptyMessage:
            subscription?.error ??
            (loading
              ? languageT("startingTranslation")
              : t("waitingForSpeech")),
          language,
          title:
            captionLanguageLabels.get(language) ??
            (fallbackLanguage
              ? `${fallbackLanguage.flag} ${getLanguageDisplayName(
                  fallbackLanguage,
                  locale
                )}`
              : language.toUpperCase()),
          transcripts: transcriptsByLanguage[language] ?? [],
        };
      }),
    [
      captionLanguageLabels,
      desiredTranslationLanguageSet,
      languageT,
      locale,
      sessionDetails.loaded,
      subscriptions,
      t,
      transcriptsByLanguage,
      translationOutputsEnabled,
      visibleSelectedCaptionLanguages,
    ]
  );

  useTranscriptAutoScroll(transcripts, transcriptEndRef);
  useSelectedAudioSubscription({
    enableTranslatedAudio: sessionDetails.enableAudioTranslation,
    room,
    currentLanguage,
    audioMuted,
    translatorIdentity,
  });
  useParticipantLanguageAttribute({
    captionLanguages: visibleSelectedCaptionLanguages,
    room,
    currentLanguage: audioMuted ? "original" : currentLanguage,
  });

  const isReceivingAudio =
    !audioMuted &&
    audioTracks.some((trackRef) => {
      const pub = trackRef.publication;
      if (currentLanguage === "original") {
        return (
          trackRef.participant.identity.startsWith("organizer-") &&
          pub.isSubscribed &&
          !pub.isMuted
        );
      }

      return (
        sessionDetails.enableAudioTranslation &&
        translatorIdentity &&
        trackRef.participant.identity === translatorIdentity &&
        pub.isSubscribed &&
        !pub.isMuted
      );
    });

  const handleLanguageChange = useCallback((langCode: string) => {
    setCurrentLanguage(langCode);
  }, []);

  const handleCaptionLanguageToggle = useCallback(
    (language: string, enabled: boolean) => {
      setSelectedCaptionLanguages((prev) => {
        const next = new Set(prev);
        if (enabled) {
          next.add(language);
        } else {
          next.delete(language);
        }

        return availableCaptionLanguageCodes.filter((code) => next.has(code));
      });
    },
    [availableCaptionLanguageCodes]
  );

  return (
    <div className="w-full max-w-xl space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
          {t("title")}
        </h1>
        <p className="font-mono text-xs text-muted-foreground">{sessionId}</p>
      </header>

      <ListenerStatus
        audioMuted={audioMuted}
        currentLanguage={currentLanguage}
        expiresAt={expiresAt}
        isConnected={isConnected}
        isReceivingAudio={!!isReceivingAudio}
        isWakeLockActive={isWakeLockActive}
        onSessionExpired={onSessionExpired}
      />

      <Separator />

      <section className="space-y-4 py-1">
        <LanguageSelector
          audioMuted={audioMuted}
          currentLanguage={currentLanguage}
          onLanguageChange={handleLanguageChange}
          onAudioMutedChange={setAudioMuted}
          disabled={!isConnected || !sessionDetails.loaded}
          inputLanguageMode={sessionDetails.inputLanguageMode}
          translationError={currentTranslationState?.error ?? null}
          translationLoading={currentTranslationLoading}
          translationsEnabled={sessionDetails.enableAudioTranslation}
          {...(sessionDetails.allowedLanguages
            ? { allowedLanguages: sessionDetails.allowedLanguages }
            : {})}
          {...(sessionDetails.sourceLanguage
            ? { sourceLanguage: sessionDetails.sourceLanguage }
            : {})}
        />
        {sessionDetails.enableTranscription && (
          <SubtitleLanguageSelector
            disabled={!sessionDetails.loaded}
            languages={availableCaptionLanguages}
            onLanguageToggle={handleCaptionLanguageToggle}
            selectedLanguages={visibleSelectedCaptionLanguages}
          />
        )}
      </section>

      {sessionDetails.enableTranscription && (
        <>
          <Separator />

          <TranscriptPanel
            canDecreaseFontSize={fontSizePreference.canDecreaseFontSize}
            canIncreaseFontSize={fontSizePreference.canIncreaseFontSize}
            currentLanguage={primaryTranscriptLanguage}
            floatingWindowControl={
              <FloatingTranscriptWindow panels={captionPanels} />
            }
            fontSize={fontSizePreference.fontSize}
            onDecreaseFontSize={fontSizePreference.decreaseFontSize}
            onIncreaseFontSize={fontSizePreference.increaseFontSize}
            transcriptEndRef={transcriptEndRef}
            transcripts={transcripts}
          />
        </>
      )}
    </div>
  );
}

function SubtitleLanguageSelector({
  disabled,
  languages,
  onLanguageToggle,
  selectedLanguages,
}: {
  disabled: boolean;
  languages: CaptionLanguageOption[];
  onLanguageToggle: (language: string, enabled: boolean) => void;
  selectedLanguages: string[];
}) {
  const t = useTranslations("Watch");
  const selectedLanguageSet = useMemo(
    () => new Set(selectedLanguages),
    [selectedLanguages]
  );

  return (
    <div className="grid gap-2">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
        {t("subtitleLanguages")}
      </Label>
      <div className="grid gap-2 rounded-lg border bg-card/40 p-3">
        {languages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("noSubtitleLanguages")}
          </p>
        ) : (
          languages.map((language) => {
            const id = `subtitle-language-${language.code}`;
            return (
              <div
                key={language.code}
                className="flex min-h-9 items-center gap-3 rounded-md border bg-background/70 px-3 py-2"
              >
                <Checkbox
                  id={id}
                  checked={selectedLanguageSet.has(language.code)}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    onLanguageToggle(language.code, checked === true)
                  }
                />
                <Label
                  htmlFor={id}
                  className="min-w-0 flex-1 cursor-pointer text-sm font-normal"
                >
                  <span className="truncate">
                    {language.flag} {language.label}
                  </span>
                </Label>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
