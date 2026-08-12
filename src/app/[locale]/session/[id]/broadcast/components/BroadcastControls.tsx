"use client";

import { useRoomContext } from "@livekit/components-react";
import { MicIcon, ScreenShareIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Separator } from "@/components/ui/separator";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { useRouter } from "@/i18n/navigation";

import { useActiveTranslations } from "../hooks/useActiveTranslations";
import { useBroadcastAudioMixer } from "../hooks/useBroadcastAudioMixer";
import { useJoinUrl } from "../hooks/useJoinUrl";
import { useListenerCount } from "../hooks/useListenerCount";
import { useTranslationDiagnostics } from "../hooks/useTranslationDiagnostics";
import { ActiveTranslationsPanel } from "./ActiveTranslationsPanel";
import { AudioInputCard } from "./AudioInputCard";
import { BroadcastStatus } from "./BroadcastStatus";
import { EndBroadcastControl } from "./EndBroadcastControl";
import { InputDiagnosticsPanel } from "./InputDiagnosticsPanel";
import { SharePanel } from "./SharePanel";

export function BroadcastControls({
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
  const router = useRouter();
  const room = useRoomContext();
  const listenerCount = useListenerCount(room);
  const translations = useActiveTranslations(sessionId);
  const diagnostics = useTranslationDiagnostics(room);
  const isWakeLockActive = useWakeLock();
  const join = useJoinUrl(sessionId);
  const audioMixer = useBroadcastAudioMixer({
    room,
    noTabAudioMessage: t("noTabAudio"),
    micAccessErrorMessage: (message) => t("micAccessError", { message }),
    tabAudioErrorMessage: (message) => t("tabAudioError", { message }),
  });

  const endBroadcast = async () => {
    onEndBroadcast();
    try {
      await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
    } catch (err) {
      console.error("Failed to explicitly delete session on broadcast end:", err);
    }
    void room.disconnect();
    void router.push("/");
  };

  const handleEndBroadcast = () => {
    void endBroadcast();
  };

  return (
    <div className="w-full max-w-xl space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
          {t("title")} {sessionId}
        </h1>
      </header>

      <BroadcastStatus
        expiresAt={expiresAt}
        isAudioActive={audioMixer.isAudioActive}
        isMicEnabled={audioMixer.isMicEnabled}
        isTabAudioEnabled={audioMixer.isTabAudioEnabled}
        isWakeLockActive={isWakeLockActive}
        listenerCount={listenerCount}
        onSessionExpired={onSessionExpired}
      />

      <div className="grid gap-3">
        <AudioInputCard
          title={t("microphone")}
          enabled={audioMixer.isMicEnabled}
          volume={audioMixer.micVolume}
          actionLabel={t("enable")}
          stopLabel={t("disable")}
          icon={<MicIcon className="size-4 text-muted-foreground" />}
          onToggle={audioMixer.toggleMicrophone}
          onVolumeChange={audioMixer.handleMicVolumeChange}
        />
        <AudioInputCard
          title={t("browserTabAudio")}
          enabled={audioMixer.isTabAudioEnabled}
          volume={audioMixer.tabVolume}
          actionLabel={t("shareTab")}
          stopLabel={t("stopSharing")}
          icon={<ScreenShareIcon className="size-4 text-muted-foreground" />}
          onToggle={audioMixer.toggleTabAudio}
          onVolumeChange={audioMixer.handleTabVolumeChange}
        />
      </div>

      <Separator />

      <SharePanel
        isJoinUrlCopied={join.isCopied}
        joinPath={join.joinPath}
        joinUrl={join.joinUrl}
        onCopyJoinUrl={join.copyJoinUrl}
      />

      <Separator />

      <InputDiagnosticsPanel diagnostics={diagnostics} />

      <Separator />

      <ActiveTranslationsPanel translations={translations} />

      <Separator />

      <EndBroadcastControl onEnd={handleEndBroadcast} />
    </div>
  );
}
