"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRoomContext, useTracks } from "@livekit/components-react";
import { Track } from "livekit-client";
import { useTranslations } from "next-intl";
import { Separator } from "@/components/ui/separator";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { useFontSizePreference } from "../hooks/useFontSizePreference";
import { useOrganizerAudioPresence } from "../hooks/useOrganizerAudioPresence";
import {
  useParticipantLanguageAttribute,
  useTranslationUnsubscribeOnLeave,
} from "../hooks/useParticipantLanguageAttribute";
import { useSelectedAudioSubscription } from "../hooks/useSelectedAudioSubscription";
import { useSessionDetails } from "../hooks/useSessionDetails";
import {
  useTranslatedTranscripts,
  useTranscriptAutoScroll,
} from "../hooks/useTranslatedTranscripts";
import LanguageSelector from "./LanguageSelector";
import { FloatingTranscriptWindow } from "./FloatingTranscriptWindow";
import { ListenerStatus } from "./ListenerStatus";
import { TranscriptPanel } from "./TranscriptPanel";

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
  const room = useRoomContext();
  const [currentLanguage, setCurrentLanguage] = useState("original");
  const [translatorIdentity, setTranslatorIdentity] = useState<string | null>(
    null
  );
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const currentLanguageRef = useRef(currentLanguage);
  const audioTracks = useTracks([Track.Source.Microphone]);
  const isWakeLockActive = useWakeLock();
  const isConnected = useOrganizerAudioPresence(room);
  const sessionDetails = useSessionDetails(sessionId);
  const fontSizePreference = useFontSizePreference();
  const { transcripts, clearTranscripts } = useTranslatedTranscripts({
    room,
    enabled: sessionDetails.enableTranscription,
    currentLanguageRef,
  });
  const translationsEnabled =
    sessionDetails.enableAudioTranslation || sessionDetails.enableTranscription;

  useTranscriptAutoScroll(transcripts, transcriptEndRef);
  useSelectedAudioSubscription({
    enableTranslatedAudio: sessionDetails.enableAudioTranslation,
    room,
    currentLanguage,
    translatorIdentity,
  });
  useParticipantLanguageAttribute({ room, currentLanguage });
  useTranslationUnsubscribeOnLeave({ sessionId, currentLanguageRef });

  useEffect(() => {
    currentLanguageRef.current = currentLanguage;
  }, [currentLanguage]);

  const isReceivingAudio = audioTracks.some((trackRef) => {
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

  const handleLanguageChange = useCallback(
    (langCode: string, newTranslatorIdentity: string | null) => {
      setCurrentLanguage(langCode);
      currentLanguageRef.current = langCode;
      setTranslatorIdentity(newTranslatorIdentity);
      clearTranscripts();
    },
    [clearTranscripts]
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
        currentLanguage={currentLanguage}
        expiresAt={expiresAt}
        isConnected={isConnected}
        isReceivingAudio={!!isReceivingAudio}
        isWakeLockActive={isWakeLockActive}
        onSessionExpired={onSessionExpired}
      />

      <Separator />

      <section className="py-1">
        <LanguageSelector
          sessionId={sessionId}
          currentLanguage={currentLanguage}
          onLanguageChange={handleLanguageChange}
          disabled={!isConnected || !sessionDetails.loaded}
          allowedLanguages={sessionDetails.allowedLanguages}
          inputLanguageMode={sessionDetails.inputLanguageMode}
          sourceLanguage={sessionDetails.sourceLanguage}
          translationsEnabled={translationsEnabled}
        />
      </section>

      {sessionDetails.enableTranscription && (
        <>
          <Separator />

          <TranscriptPanel
            canDecreaseFontSize={fontSizePreference.canDecreaseFontSize}
            canIncreaseFontSize={fontSizePreference.canIncreaseFontSize}
            currentLanguage={currentLanguage}
            floatingWindowControl={
              <FloatingTranscriptWindow
                currentLanguage={currentLanguage}
                transcripts={transcripts}
              />
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
