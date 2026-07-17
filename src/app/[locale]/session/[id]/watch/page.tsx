"use client";

import {
  CSSProperties,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useRoomContext,
  useTracks,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Track, RoomEvent, type RemoteParticipant } from "livekit-client";
import { useTranslations } from "next-intl";
import {
  AlertTriangleIcon,
  LockKeyholeIcon,
  MinusIcon,
  PlusIcon,
  RefreshCwIcon,
  Volume2Icon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import LanguageSelector from "./components/LanguageSelector";

interface TranscriptEntry {
  id: string;
  text: string;
  language: string;
  final: boolean;
  timestamp: number;
}

type NavigatorWithWakeLock = Navigator & {
  wakeLock: {
    request: (type: "screen") => Promise<WakeLockSentinel>;
  };
};

function splitIntoParagraphs(text: string, sentencesPerParagraph = 2): string[] {
  const sentenceRegex = /[^.!?]+[.!?]+(?:\s+|$)/g;
  const matches = text.match(sentenceRegex);

  if (!matches) {
    return [text];
  }

  const paragraphs: string[] = [];
  for (let i = 0; i < matches.length; i += sentencesPerParagraph) {
    const chunk = matches.slice(i, i + sentencesPerParagraph).join("").trim();
    if (chunk) {
      paragraphs.push(chunk);
    }
  }

  const matchedTextLength = matches.join("").length;
  if (matchedTextLength < text.length) {
    const remaining = text.slice(matchedTextLength).trim();
    if (remaining) {
      if (paragraphs.length > 0) {
        paragraphs[paragraphs.length - 1] += " " + remaining;
      } else {
        paragraphs.push(remaining);
      }
    }
  }

  return paragraphs;
}

function AttendeeView({ sessionId }: { sessionId: string }) {
  const t = useTranslations("Watch");
  const room = useRoomContext();
  const [currentLanguage, setCurrentLanguage] = useState("original");
  const [translatorIdentity, setTranslatorIdentity] = useState<string | null>(
    null
  );
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const currentLanguageRef = useRef(currentLanguage);
  const audioTracks = useTracks([Track.Source.Microphone]);
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
      translatorIdentity &&
      trackRef.participant.identity === translatorIdentity &&
      pub.isSubscribed &&
      !pub.isMuted
    );
  });

  const [allowedLanguages, setAllowedLanguages] = useState<
    string[] | undefined
  >(undefined);

  useEffect(() => {
    async function fetchSessionDetails() {
      try {
        const res = await fetch(`/api/sessions/${sessionId}`);
        if (res.ok) {
          const data = await res.json();
          setAllowedLanguages(data.allowedLanguages);
        }
      } catch (err) {
        console.error("Failed to fetch session details:", err);
      }
    }
    fetchSessionDetails();
  }, [sessionId]);

  const [fontSize, setFontSize] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("watch_font_size");
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 12 && parsed <= 28) {
          return parsed;
        }
      }
    }
    return 16;
  });

  useEffect(() => {
    localStorage.setItem("watch_font_size", fontSize.toString());
  }, [fontSize]);

  const increaseFontSize = () => {
    setFontSize((prev) => Math.min(prev + 2, 28));
  };

  const decreaseFontSize = () => {
    setFontSize((prev) => Math.max(prev - 2, 12));
  };

  const [isWakeLockActive, setIsWakeLockActive] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("wakeLock" in navigator)) {
      return;
    }

    let wakeLock: WakeLockSentinel | null = null;

    async function requestWakeLock() {
      try {
        wakeLock = await (navigator as NavigatorWithWakeLock).wakeLock.request(
          "screen"
        );
        setIsWakeLockActive(true);

        wakeLock.addEventListener("release", () => {
          setIsWakeLockActive(false);
        });
      } catch (err) {
        console.error("Failed to acquire Screen Wake Lock:", err);
      }
    }

    requestWakeLock();

    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible" && !wakeLock) {
        await requestWakeLock();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (wakeLock) {
        wakeLock.release().catch((err: unknown) => {
          console.error("Failed to release Screen Wake Lock:", err);
        });
      }
    };
  }, []);

  useEffect(() => {
    if (!room) return;

    const handleData = (
      payload: Uint8Array,
      participant: unknown,
      kind: unknown,
      topic: string | undefined
    ) => {
      void participant;
      void kind;
      if (topic !== "transcription") return;

      try {
        const data = JSON.parse(new TextDecoder().decode(payload));
        if (data.type !== "transcription") return;
        if (data.language !== currentLanguageRef.current) return;

        setTranscripts((prev) => {
          const existing = prev.findIndex((entry) => entry.id === data.segmentId);
          const entry: TranscriptEntry = {
            id: data.segmentId,
            text: data.text,
            language: data.language,
            final: data.final,
            timestamp: data.timestamp,
          };

          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = {
              ...updated[existing],
              text: updated[existing].text + data.text,
              final: data.final,
            };
            return updated;
          }

          const next = [...prev, entry];
          return next.slice(-50);
        });
      } catch {
        // Ignore non-transcription data messages.
      }
    };

    room.on(RoomEvent.DataReceived, handleData);
    return () => {
      room.off(RoomEvent.DataReceived, handleData);
    };
  }, [room]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts]);

  useEffect(() => {
    if (!room) return;

    const updateSubscriptions = () => {
      for (const [, participant] of room.remoteParticipants) {
        const isOrganizer = participant.identity.startsWith("organizer-");
        const isSelectedTranslator =
          translatorIdentity && participant.identity === translatorIdentity;

        for (const [, pub] of participant.trackPublications) {
          if (pub.kind === Track.Kind.Audio) {
            if (currentLanguage === "original") {
              pub.setSubscribed(isOrganizer);
            } else {
              pub.setSubscribed(!!isSelectedTranslator);
            }
          }
        }
      }
    };

    updateSubscriptions();

    const handleUpdate = () => updateSubscriptions();
    room.on(RoomEvent.Connected, handleUpdate);
    room.on(RoomEvent.TrackPublished, handleUpdate);
    room.on(RoomEvent.TrackUnpublished, handleUpdate);

    const handleParticipantConnected = (participant: RemoteParticipant) => {
      const isOrganizer = participant.identity.startsWith("organizer-");
      const isSelectedTranslator =
        translatorIdentity && participant.identity === translatorIdentity;
      if (isOrganizer || isSelectedTranslator) {
        updateSubscriptions();
      }
    };

    room.on(RoomEvent.ParticipantConnected, handleParticipantConnected);

    return () => {
      room.off(RoomEvent.Connected, handleUpdate);
      room.off(RoomEvent.TrackPublished, handleUpdate);
      room.off(RoomEvent.TrackUnpublished, handleUpdate);
      room.off(RoomEvent.ParticipantConnected, handleParticipantConnected);
    };
  }, [room, currentLanguage, translatorIdentity]);

  useEffect(() => {
    if (!room) return;

    const setLanguageAttr = () => {
      if (room.localParticipant) {
        room.localParticipant
          .setAttributes({ language: currentLanguage })
          .catch((err) =>
            console.error("Failed to set participant attributes:", err)
          );
      }
    };

    setLanguageAttr();

    room.on(RoomEvent.Connected, setLanguageAttr);
    return () => {
      room.off(RoomEvent.Connected, setLanguageAttr);
    };
  }, [room, currentLanguage]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (currentLanguageRef.current && currentLanguageRef.current !== "original") {
        const body = JSON.stringify({
          sessionId,
          targetLanguage: currentLanguageRef.current,
        });
        navigator.sendBeacon(
          "/api/translate/unsubscribe",
          new Blob([body], { type: "application/json" })
        );
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      handleBeforeUnload();
    };
  }, [sessionId]);

  const handleLanguageChange = useCallback(
    (langCode: string, newTranslatorIdentity: string | null) => {
      const prev = currentLanguageRef.current;
      if (prev && prev !== "original" && prev !== langCode) {
        fetch("/api/translate/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, targetLanguage: prev }),
        }).catch(() => {});
      }

      setCurrentLanguage(langCode);
      currentLanguageRef.current = langCode;
      setTranslatorIdentity(newTranslatorIdentity);
      setTranscripts([]);
    },
    [sessionId]
  );

  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!room) return;

    const checkConnected = () => {
      const hasOrganizer = Array.from(room.remoteParticipants.values()).some(
        (participant) => {
          if (!participant.identity.startsWith("organizer-")) return false;
          return Array.from(participant.trackPublications.values()).some(
            (pub) => pub.kind === Track.Kind.Audio && !pub.isMuted
          );
        }
      );
      setIsConnected(hasOrganizer);
    };

    checkConnected();

    room.on(RoomEvent.Connected, checkConnected);
    room.on(RoomEvent.SignalConnected, checkConnected);
    room.on(RoomEvent.ParticipantConnected, checkConnected);
    room.on(RoomEvent.ParticipantDisconnected, checkConnected);
    room.on(RoomEvent.TrackPublished, checkConnected);
    room.on(RoomEvent.TrackUnpublished, checkConnected);
    room.on(RoomEvent.TrackSubscribed, checkConnected);
    room.on(RoomEvent.TrackUnsubscribed, checkConnected);
    room.on(RoomEvent.TrackMuted, checkConnected);
    room.on(RoomEvent.TrackUnmuted, checkConnected);

    const interval = setInterval(checkConnected, 1000);

    return () => {
      room.off(RoomEvent.Connected, checkConnected);
      room.off(RoomEvent.SignalConnected, checkConnected);
      room.off(RoomEvent.ParticipantConnected, checkConnected);
      room.off(RoomEvent.ParticipantDisconnected, checkConnected);
      room.off(RoomEvent.TrackPublished, checkConnected);
      room.off(RoomEvent.TrackUnpublished, checkConnected);
      room.off(RoomEvent.TrackSubscribed, checkConnected);
      room.off(RoomEvent.TrackUnsubscribed, checkConnected);
      room.off(RoomEvent.TrackMuted, checkConnected);
      room.off(RoomEvent.TrackUnmuted, checkConnected);
      clearInterval(interval);
    };
  }, [room]);

  const transcriptStyle = {
    "--transcript-font-size": `${fontSize}px`,
  } as CSSProperties;

  return (
    <div className="w-full max-w-xl space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
          {t("title")}
        </h1>
        <p className="font-mono text-xs text-muted-foreground">{sessionId}</p>
      </header>

      <section className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <div className={`waveform ${isReceivingAudio ? "active" : "idle"}`}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="waveform-bar" />
            ))}
          </div>

          {isConnected ? (
            <Badge variant="outline" className="gap-1 border-success/30 text-success">
              <span className="size-1.5 rounded-full bg-current animate-pulse" />
              {currentLanguage === "original"
                ? t("original")
                : currentLanguage.toUpperCase()}
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 border-warning/30 text-warning">
              <span className="size-1.5 rounded-full bg-current animate-pulse" />
              {t("waitingForBroadcast")}
            </Badge>
          )}

          {isWakeLockActive && (
            <Badge variant="secondary" className="gap-1">
              <LockKeyholeIcon className="size-3" />
              {t("screenAwake")}
            </Badge>
          )}
        </div>
      </section>

      <Separator />

      <section className="py-1">
        <LanguageSelector
          sessionId={sessionId}
          currentLanguage={currentLanguage}
          onLanguageChange={handleLanguageChange}
          disabled={!isConnected}
          allowedLanguages={allowedLanguages}
        />
      </section>

      <Separator />

      <section className="space-y-4" style={transcriptStyle}>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("transcription")}
          </span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={decreaseFontSize}
              disabled={fontSize <= 12}
              title={t("decreaseFontSize")}
              aria-label={t("decreaseFontSize")}
            >
              <MinusIcon className="size-3" />
              A
            </Button>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={increaseFontSize}
              disabled={fontSize >= 28}
              title={t("increaseFontSize")}
              aria-label={t("increaseFontSize")}
            >
              <PlusIcon className="size-3" />
              A
            </Button>
          </div>
        </div>

        <ScrollArea className="h-80 rounded-lg border bg-card">
          <div className="p-4">
            {transcripts.length === 0 ? (
              <p className="text-sm italic text-muted-foreground">
                {currentLanguage === "original"
                  ? t("selectLanguageForTranscription")
                  : t("waitingForSpeech")}
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                {transcripts.map((entry, i) => {
                  const paragraphs = splitIntoParagraphs(entry.text, 2);
                  return (
                    <div
                      key={`${entry.id}-${i}`}
                      className="flex flex-col gap-2"
                    >
                      {paragraphs.map((para, paraIdx) => (
                        <p
                          key={paraIdx}
                          className={cn(
                            "font-sans text-[length:var(--transcript-font-size)] leading-7 transition-colors",
                            entry.final
                              ? "text-foreground"
                              : "text-muted-foreground"
                          )}
                        >
                          {para}
                        </p>
                      ))}
                    </div>
                  );
                })}
                <div ref={transcriptEndRef} />
              </div>
            )}
          </div>
        </ScrollArea>
      </section>

      <Separator />

      <p className="text-sm leading-6 text-muted-foreground">
        {t.rich("generatedBy", {
          link: (chunks) => (
            <a
              href="https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-live-3-5-translate/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 hover:text-foreground"
            >
              {chunks}
            </a>
          ),
        })}
      </p>
    </div>
  );
}

export default function WatchPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const t = useTranslations("Watch");
  const { id: sessionId } = use(params);
  const [token, setToken] = useState("");
  const [livekitUrl, setLivekitUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    async function fetchToken() {
      try {
        const identity = `attendee-${Math.random().toString(36).slice(2, 8)}`;
        const res = await fetch(
          `/api/token?room=${sessionId}&identity=${identity}&role=attendee`
        );
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setToken(data.token);
        setLivekitUrl(data.serverUrl);
      } catch (err) {
        setError((err as Error).message);
      }
    }
    fetchToken();
  }, [sessionId]);

  if (error) {
    const isInactiveSession =
      error.includes("not started yet") || error.includes("not found");
    return (
      <main className="flex min-h-svh items-center justify-center px-4 py-10">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle className="flex items-center justify-center gap-2">
              <AlertTriangleIcon className="size-4 text-destructive" />
              {isInactiveSession
                ? t("broadcastNotStarted")
                : t("somethingWentWrong")}
            </CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={() => window.location.reload()}
              className="w-full"
            >
              <RefreshCwIcon />
              {isInactiveSession ? t("checkAgain") : t("retry")}
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (!token || !livekitUrl) {
    return (
      <main className="flex min-h-svh items-center justify-center px-4 py-10">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Spinner className="size-5" />
          <p className="font-mono text-xs">{t("joining")}</p>
        </div>
      </main>
    );
  }

  if (!started) {
    return (
      <main className="flex min-h-svh items-center justify-center px-4 py-10">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle className="text-3xl">{t("ready")}</CardTitle>
            <CardDescription>{t("readyCopy")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Button onClick={() => setStarted(true)} className="w-full">
              <Volume2Icon />
              {t("startListening")}
            </Button>
            <p className="font-mono text-xs text-muted-foreground">
              {t("session", { sessionId })}
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-svh px-4 py-10 sm:px-6">
      <LiveKitRoom
        video={false}
        audio={false}
        token={token}
        serverUrl={livekitUrl}
        connectOptions={{ autoSubscribe: false }}
        options={{ disconnectOnPageLeave: false }}
        className="flex w-full flex-col items-center"
      >
        <RoomAudioRenderer />
        <AttendeeView sessionId={sessionId} />
      </LiveKitRoom>
    </main>
  );
}
