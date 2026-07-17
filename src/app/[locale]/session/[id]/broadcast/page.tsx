"use client";

import {
  FormEvent,
  ReactNode,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { LiveKitRoom, useRoomContext } from "@livekit/components-react";
import "@livekit/components-styles";
import { Track, RoomEvent, type LocalTrackPublication } from "livekit-client";
import { useLocale, useTranslations } from "next-intl";
import {
  AlertTriangleIcon,
  HomeIcon,
  LockKeyholeIcon,
  LogInIcon,
  MicIcon,
  PowerIcon,
  QrCodeIcon,
  ScreenShareIcon,
  UsersIcon,
} from "lucide-react";
import SessionCountdown from "@/components/SessionCountdown";
import SessionQRCode from "@/components/SessionQRCode";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { getPathname, useRouter } from "@/i18n/navigation";
import {
  API_ERROR_CODES,
  getApiErrorCode,
  type ApiErrorCode,
} from "@/lib/api-errors";
import { getLanguageByCode, getLanguageDisplayName } from "@/lib/languages";
import { cn } from "@/lib/utils";

interface TranslationInfo {
  language: string;
  translatorIdentity: string;
  status: string;
  subscriberCount: number;
}

function subscribeToOrigin() {
  return () => {};
}

function getClientOrigin() {
  return window.location.origin;
}

function getServerOrigin() {
  return "";
}

type NavigatorWithWakeLock = Navigator & {
  wakeLock: {
    request: (type: "screen") => Promise<WakeLockSentinel>;
  };
};

type FetchTokenResult =
  | { ok: true }
  | { ok: false; reason: "password" | "error" };

type WindowWithWebkitAudioContext = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

function AudioInputCard({
  title,
  enabled,
  volume,
  actionLabel,
  stopLabel,
  icon,
  onToggle,
  onVolumeChange,
}: {
  title: string;
  enabled: boolean;
  volume: number;
  actionLabel: string;
  stopLabel: string;
  icon: ReactNode;
  onToggle: () => void;
  onVolumeChange: (value: number) => void;
}) {
  const t = useTranslations("Broadcast");

  return (
    <Card size="sm">
      <CardHeader className="items-center">
        <CardTitle className="flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
        <CardAction>
          <Button
            type="button"
            variant={enabled ? "destructive" : "default"}
            size="sm"
            onClick={onToggle}
          >
            {enabled ? stopLabel : actionLabel}
          </Button>
        </CardAction>
      </CardHeader>
      {enabled && (
        <CardContent>
          <div className="grid grid-cols-[2.5rem_1fr_3rem] items-center gap-3">
            <span className="font-mono text-xs text-muted-foreground">
              {t("volume")}
            </span>
            <Slider
              value={[volume]}
              min={0}
              max={100}
              step={1}
              onValueChange={(value) => onVolumeChange(value[0] ?? 0)}
            />
            <span className="text-right font-mono text-xs tabular-nums text-muted-foreground">
              {volume}%
            </span>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function BroadcastControls({
  sessionId,
  expiresAt,
  onEndBroadcast,
  onSessionExpired,
}: {
  sessionId: string;
  expiresAt: string | null;
  onEndBroadcast: () => void;
  onSessionExpired: () => void;
}) {
  const t = useTranslations("Broadcast");
  const locale = useLocale();
  const router = useRouter();
  const room = useRoomContext();
  const [translations, setTranslations] = useState<TranslationInfo[]>([]);
  const [listenerCount, setListenerCount] = useState(0);
  const origin = useSyncExternalStore(
    subscribeToOrigin,
    getClientOrigin,
    getServerOrigin
  );

  useEffect(() => {
    if (!room) return;

    const updateCount = () => {
      const count = Array.from(room.remoteParticipants.values()).filter(
        (participant) => !participant.identity.startsWith("translator-")
      ).length;
      setListenerCount(count);
    };

    updateCount();

    room.on(RoomEvent.ParticipantConnected, updateCount);
    room.on(RoomEvent.ParticipantDisconnected, updateCount);
    return () => {
      room.off(RoomEvent.ParticipantConnected, updateCount);
      room.off(RoomEvent.ParticipantDisconnected, updateCount);
    };
  }, [room]);

  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const [isTabAudioEnabled, setIsTabAudioEnabled] = useState(false);
  const [micVolume, setMicVolume] = useState(100);
  const [tabVolume, setTabVolume] = useState(100);
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

  const audioContextRef = useRef<AudioContext | null>(null);
  const destinationNodeRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micGainNodeRef = useRef<GainNode | null>(null);
  const tabStreamRef = useRef<MediaStream | null>(null);
  const tabSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const tabGainNodeRef = useRef<GainNode | null>(null);
  const publishedTrackPubRef = useRef<LocalTrackPublication | null>(null);

  const joinPath = getPathname({
    href: `/session/${sessionId}/watch`,
    locale,
  });

  const joinUrl = origin ? `${origin}${joinPath}` : joinPath;

  const fetchTranslations = useCallback(async () => {
    try {
      const res = await fetch(`/api/translate/status?sessionId=${sessionId}`);
      const data = await res.json();
      setTranslations(data.translations || []);
    } catch (err) {
      console.error("Failed to fetch translations:", err);
    }
  }, [sessionId]);

  useEffect(() => {
    const initialFetch = window.setTimeout(fetchTranslations, 0);
    const interval = setInterval(fetchTranslations, 3000);
    return () => {
      clearTimeout(initialFetch);
      clearInterval(interval);
    };
  }, [fetchTranslations]);

  useEffect(() => {
    if (!room || !room.localParticipant) return;

    let active = true;
    let localPub: LocalTrackPublication | null = null;

    async function initAudio() {
      try {
        const AudioContextClass =
          window.AudioContext ||
          (window as WindowWithWebkitAudioContext).webkitAudioContext;

        if (!AudioContextClass) {
          throw new Error("Web Audio API is not supported in this browser.");
        }

        const ctx = new AudioContextClass();
        audioContextRef.current = ctx;

        const dest = ctx.createMediaStreamDestination();
        destinationNodeRef.current = dest;

        const mixedTrack = dest.stream.getAudioTracks()[0];

        if (active && room.localParticipant) {
          const pub = await room.localParticipant.publishTrack(mixedTrack, {
            name: "broadcast-audio",
            source: Track.Source.Microphone,
          });
          publishedTrackPubRef.current = pub;
          localPub = pub;
          await pub.mute();
          console.log(
            "Published and initially muted mixed audio track:",
            pub.trackSid
          );
        }
      } catch (err) {
        console.error("Failed to initialize client audio mixer:", err);
      }
    }

    initAudio();

    return () => {
      active = false;
      if (localPub?.track && room.localParticipant) {
        room.localParticipant.unpublishTrack(localPub.track).catch((err) => {
          console.error("Failed to unpublish mixed track:", err);
        });
      }

      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((track) => track.stop());
        micStreamRef.current = null;
      }
      if (micSourceNodeRef.current) {
        micSourceNodeRef.current.disconnect();
        micSourceNodeRef.current = null;
      }
      if (micGainNodeRef.current) {
        micGainNodeRef.current.disconnect();
        micGainNodeRef.current = null;
      }
      if (tabStreamRef.current) {
        tabStreamRef.current.getTracks().forEach((track) => track.stop());
        tabStreamRef.current = null;
      }
      if (tabSourceNodeRef.current) {
        tabSourceNodeRef.current.disconnect();
        tabSourceNodeRef.current = null;
      }
      if (tabGainNodeRef.current) {
        tabGainNodeRef.current.disconnect();
        tabGainNodeRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      destinationNodeRef.current = null;
      publishedTrackPubRef.current = null;
    };
  }, [room, room?.localParticipant]);

  useEffect(() => {
    const pub = publishedTrackPubRef.current;
    if (!pub) return;

    const hasActiveInput = isMicEnabled || isTabAudioEnabled;
    if (hasActiveInput) {
      pub
        .unmute()
        .then(() =>
          console.log("[BroadcastControls] Unmuted broadcast-audio track")
        )
        .catch((err: unknown) => console.error("Failed to unmute track:", err));
    } else {
      pub
        .mute()
        .then(() =>
          console.log("[BroadcastControls] Muted broadcast-audio track")
        )
        .catch((err: unknown) => console.error("Failed to mute track:", err));
    }
  }, [isMicEnabled, isTabAudioEnabled]);

  const toggleMicrophone = async () => {
    const ctx = audioContextRef.current;
    const dest = destinationNodeRef.current;
    if (!ctx || !dest) return;

    if (isMicEnabled) {
      if (micSourceNodeRef.current) {
        micSourceNodeRef.current.disconnect();
        micSourceNodeRef.current = null;
      }
      if (micGainNodeRef.current) {
        micGainNodeRef.current.disconnect();
        micGainNodeRef.current = null;
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((track) => track.stop());
        micStreamRef.current = null;
      }
      setIsMicEnabled(false);
    } else {
      try {
        await ctx.resume();
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        micStreamRef.current = stream;

        const source = ctx.createMediaStreamSource(stream);
        micSourceNodeRef.current = source;

        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(micVolume / 100, ctx.currentTime);
        micGainNodeRef.current = gainNode;

        source.connect(gainNode);
        gainNode.connect(dest);

        setIsMicEnabled(true);
      } catch (err) {
        console.error("Failed to access microphone:", err);
        alert(t("micAccessError", { message: (err as Error).message }));
      }
    }
  };

  const toggleTabAudio = async () => {
    const ctx = audioContextRef.current;
    const dest = destinationNodeRef.current;
    if (!ctx || !dest) return;

    if (isTabAudioEnabled) {
      if (tabSourceNodeRef.current) {
        tabSourceNodeRef.current.disconnect();
        tabSourceNodeRef.current = null;
      }
      if (tabGainNodeRef.current) {
        tabGainNodeRef.current.disconnect();
        tabGainNodeRef.current = null;
      }
      if (tabStreamRef.current) {
        tabStreamRef.current.getTracks().forEach((track) => track.stop());
        tabStreamRef.current = null;
      }
      setIsTabAudioEnabled(false);
    } else {
      try {
        await ctx.resume();
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { displaySurface: "browser" },
          audio: true,
        });

        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
          stream.getTracks().forEach((track) => track.stop());
          alert(t("noTabAudio"));
          return;
        }

        tabStreamRef.current = stream;

        const source = ctx.createMediaStreamSource(stream);
        tabSourceNodeRef.current = source;

        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(tabVolume / 100, ctx.currentTime);
        tabGainNodeRef.current = gainNode;

        source.connect(gainNode);
        gainNode.connect(dest);

        setIsTabAudioEnabled(true);

        const handleTrackEnded = () => {
          if (tabSourceNodeRef.current) {
            tabSourceNodeRef.current.disconnect();
            tabSourceNodeRef.current = null;
          }
          if (tabGainNodeRef.current) {
            tabGainNodeRef.current.disconnect();
            tabGainNodeRef.current = null;
          }
          stream.getTracks().forEach((track) => track.stop());
          tabStreamRef.current = null;
          setIsTabAudioEnabled(false);
        };

        audioTracks[0].onended = handleTrackEnded;
        const videoTracks = stream.getVideoTracks();
        if (videoTracks.length > 0) {
          videoTracks[0].onended = handleTrackEnded;
        }
      } catch (err) {
        console.error("Failed to capture tab audio:", err);
        if ((err as Error).name !== "NotAllowedError") {
          alert(t("tabAudioError", { message: (err as Error).message }));
        }
      }
    }
  };

  const handleMicVolumeChange = (vol: number) => {
    setMicVolume(vol);
    if (micGainNodeRef.current && audioContextRef.current) {
      micGainNodeRef.current.gain.setValueAtTime(
        vol / 100,
        audioContextRef.current.currentTime
      );
    }
  };

  const handleTabVolumeChange = (vol: number) => {
    setTabVolume(vol);
    if (tabGainNodeRef.current && audioContextRef.current) {
      tabGainNodeRef.current.gain.setValueAtTime(
        vol / 100,
        audioContextRef.current.currentTime
      );
    }
  };

  const endBroadcast = async () => {
    onEndBroadcast();
    try {
      await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
    } catch (err) {
      console.error("Failed to explicitly delete session on broadcast end:", err);
    }
    room.disconnect();
    router.push("/");
  };

  const isAudioActive = isMicEnabled || isTabAudioEnabled;
  let statusText = t("muted");
  if (isMicEnabled && isTabAudioEnabled) {
    statusText = t("liveMicTab");
  } else if (isMicEnabled) {
    statusText = t("liveMic");
  } else if (isTabAudioEnabled) {
    statusText = t("liveTab");
  }

  return (
    <div className="w-full max-w-xl space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
          {t("title")} {sessionId}
        </h1>
      </header>

      <section className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className={`waveform ${isAudioActive ? "active" : "idle"}`}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="waveform-bar" />
            ))}
          </div>
          <Badge
            variant="outline"
            className={cn(
              "gap-1",
              isAudioActive
                ? "border-success/30 text-success"
                : "text-muted-foreground"
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full bg-current",
                isAudioActive && "animate-pulse"
              )}
            />
            {statusText}
          </Badge>

          {isWakeLockActive && (
            <Badge variant="secondary" className="gap-1">
              <LockKeyholeIcon className="size-3" />
              {t("screenAwake")}
            </Badge>
          )}

          <SessionCountdown
            expiresAt={expiresAt}
            timeRemainingLabel={t("timeRemaining")}
            endedLabel={t("sessionEnded")}
            onExpire={onSessionExpired}
          />
        </div>

        <Badge variant="outline" className="gap-1">
          <UsersIcon className="size-3" />
          {t("listenerCount", { count: listenerCount })}
        </Badge>
      </section>

      <div className="grid gap-3">
        <AudioInputCard
          title={t("microphone")}
          enabled={isMicEnabled}
          volume={micVolume}
          actionLabel={t("enable")}
          stopLabel={t("disable")}
          icon={<MicIcon className="size-4 text-muted-foreground" />}
          onToggle={toggleMicrophone}
          onVolumeChange={handleMicVolumeChange}
        />
        <AudioInputCard
          title={t("browserTabAudio")}
          enabled={isTabAudioEnabled}
          volume={tabVolume}
          actionLabel={t("shareTab")}
          stopLabel={t("stopSharing")}
          icon={<ScreenShareIcon className="size-4 text-muted-foreground" />}
          onToggle={toggleTabAudio}
          onVolumeChange={handleTabVolumeChange}
        />
      </div>

      <Separator />

      <section className="flex flex-col items-center gap-4 text-center">
        <Badge variant="outline" className="gap-1">
          <QrCodeIcon className="size-3" />
          {t("shareWithAttendees")}
        </Badge>
        <SessionQRCode url={joinUrl || joinPath} size={140} />
        <p className="break-all font-mono text-xs leading-5 text-muted-foreground">
          {joinUrl}
        </p>
      </section>

      <Separator />

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("translationsCount", { count: translations.length })}
          </span>
        </div>

        {translations.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">
            {t("noTranslations")}
          </p>
        ) : (
          <div className="rounded-lg border bg-card">
            {translations.map((translation, index) => {
              const lang = getLanguageByCode(translation.language);
              const languageName = lang
                ? getLanguageDisplayName(lang, locale)
                : translation.language.toUpperCase();
              const active = translation.status === "active";

              return (
                <div
                  key={translation.language}
                  className={cn(
                    "flex items-center justify-between gap-3 p-3",
                    index !== translations.length - 1 && "border-b"
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {lang?.flag && <span className="text-base">{lang.flag}</span>}
                    <span className="truncate text-sm font-medium">
                      {languageName}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {t("listenerCount", {
                        count: translation.subscriberCount,
                      })}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "gap-1",
                        active
                          ? "border-success/30 text-success"
                          : "border-warning/30 text-warning"
                      )}
                    >
                      <span className="size-1.5 rounded-full bg-current animate-pulse" />
                      {translation.status}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <Separator />

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" className="w-full">
            <PowerIcon />
            {t("endBroadcast")}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <PowerIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>{t("confirmEndTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirmEndDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={endBroadcast}>
              {t("endBroadcast")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function BroadcastPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const t = useTranslations("Broadcast");
  const router = useRouter();
  const { id: sessionId } = use(params);
  const [token, setToken] = useState("");
  const [livekitUrl, setLivekitUrl] = useState("");
  const [sessionExpiresAt, setSessionExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [passwordPromptRequired, setPasswordPromptRequired] = useState(false);
  const [localPassword, setLocalPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const isEndingRef = useRef(false);

  const handleEndBroadcast = useCallback(() => {
    isEndingRef.current = true;
  }, []);

  const handleSessionExpired = useCallback(() => {
    isEndingRef.current = true;
    setError(t("sessionEnded"));
  }, [t]);

  const getTokenErrorMessage = useCallback(
    (code: ApiErrorCode | undefined) => {
      switch (code) {
        case API_ERROR_CODES.SESSION_INACTIVE:
          return t("sessionInactive");
        case API_ERROR_CODES.LIVEKIT_NOT_CONFIGURED:
          return t("livekitNotConfigured");
        case API_ERROR_CODES.INVALID_REQUEST:
          return t("invalidRequest");
        default:
          return t("fetchTokenError");
      }
    },
    [t]
  );

  const fetchToken = useCallback(
    async (pass: string): Promise<FetchTokenResult> => {
      try {
        const identity = "organizer-host";
        const passwordParam = pass
          ? `&password=${encodeURIComponent(pass)}`
          : "";
        const url = `/api/token?room=${sessionId}&identity=${identity}&role=organizer${passwordParam}`;
        const res = await fetch(url);
        const data = await res.json();

        if (res.status === 401) {
          setPasswordPromptRequired(true);
          setError(null);
          return { ok: false, reason: "password" };
        }

        if (!res.ok || data.error) {
          setError(getTokenErrorMessage(getApiErrorCode(data)));
          return { ok: false, reason: "error" };
        }

        if (pass) {
          sessionStorage.setItem("broadcast_password", pass);
        }
        setToken(data.token);
        setLivekitUrl(data.serverUrl);
        setSessionExpiresAt(
          typeof data.expiresAt === "string" ? data.expiresAt : null
        );
        setPasswordPromptRequired(false);
        return { ok: true };
      } catch (err) {
        console.error("Failed to fetch organizer token:", err);
        setError(t("fetchTokenError"));
        return { ok: false, reason: "error" };
      }
    },
    [getTokenErrorMessage, sessionId, t]
  );

  useEffect(() => {
    const cachedPass = sessionStorage.getItem("broadcast_password") || "";
    const initialFetch = window.setTimeout(() => {
      fetchToken(cachedPass);
    }, 0);
    return () => clearTimeout(initialFetch);
  }, [fetchToken]);

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setVerifying(true);
    setPasswordError(null);
    const result = await fetchToken(localPassword);
    setVerifying(false);
    if (!result.ok && result.reason === "password") {
      setPasswordError(t("incorrectPassword"));
    }
  };

  if (passwordPromptRequired) {
    return (
      <main className="flex min-h-svh items-center justify-center px-4 py-10">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2 text-3xl">
              <LockKeyholeIcon className="size-5" />
              {t("password")} {t("required")}
            </CardTitle>
            <CardDescription>{t("passwordProtected")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={handlePasswordSubmit}>
              <div className="grid gap-2">
                <Label htmlFor="broadcast-password">
                  {t("passwordPlaceholder")}
                </Label>
                <Input
                  id="broadcast-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder={t("passwordPlaceholder")}
                  value={localPassword}
                  onChange={(e) => setLocalPassword(e.target.value)}
                  disabled={verifying}
                  required
                />
              </div>

              {passwordError && (
                <Alert variant="destructive">
                  <AlertDescription>{passwordError}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" disabled={verifying} className="w-full">
                {verifying ? (
                  <>
                    <Spinner />
                    {t("verifying")}
                  </>
                ) : (
                  <>
                    <LogInIcon />
                    {t("submit")}
                  </>
                )}
              </Button>
            </form>
            <Button
              variant="ghost"
              onClick={() => router.push("/")}
              className="mt-2 w-full"
            >
              {t("cancel")}
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-svh items-center justify-center px-4 py-10">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle className="flex items-center justify-center gap-2">
              <AlertTriangleIcon className="size-4 text-destructive" />
              {t("somethingWentWrong")}
            </CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={() => router.push("/")}
              className="w-full"
            >
              <HomeIcon />
              {t("goHome")}
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (!token || !livekitUrl) {
    return (
      <main className="flex min-h-svh items-center justify-center px-4 py-10">
        <Spinner className="size-5 text-muted-foreground" />
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
        options={{ disconnectOnPageLeave: false }}
        className="flex w-full flex-col items-center"
        onDisconnected={() => {
          if (!isEndingRef.current) {
            setError(t("disconnectError"));
          }
        }}
      >
        <BroadcastControls
          sessionId={sessionId}
          expiresAt={sessionExpiresAt}
          onEndBroadcast={handleEndBroadcast}
          onSessionExpired={handleSessionExpired}
        />
      </LiveKitRoom>
    </main>
  );
}
