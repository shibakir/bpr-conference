"use client";

import { useRoomContext } from "@livekit/components-react";
import { MicIcon, RadioTowerIcon, ScreenShareIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import useSWRMutation from "swr/mutation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup, FieldSet, FieldTitle } from "@/components/ui/field";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { useRouter } from "@/i18n/navigation";
import { fetchValidatedJson } from "@/lib/api-client";
import { successResponseSchema } from "@/lib/api-schemas";
import { clientLogger } from "@/lib/client-logger";

import { useActiveTranslations } from "../hooks/useActiveTranslations";
import { useBroadcastAudioMixer } from "../hooks/useBroadcastAudioMixer";
import { useJoinUrl } from "../hooks/useJoinUrl";
import { useListenerCount } from "../hooks/useListenerCount";
import { ActiveTranslationsPanel } from "./ActiveTranslationsPanel";
import { AudioInputCard } from "./AudioInputCard";
import { BroadcastStatus } from "./BroadcastStatus";
import { EndBroadcastControl } from "./EndBroadcastControl";
import { SharePanel } from "./SharePanel";

function deleteSessionRequest(url: string) {
    return fetchValidatedJson(url, { method: "DELETE" }, successResponseSchema);
}

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
    const isWakeLockActive = useWakeLock();
    const join = useJoinUrl(sessionId);
    const { trigger: deleteSession } = useSWRMutation(
        `/api/sessions/${sessionId}`,
        deleteSessionRequest,
    );
    const audioMixer = useBroadcastAudioMixer({
        room,
        noTabAudioMessage: t("noTabAudio"),
        micAccessErrorMessage: (message) => t("micAccessError", { message }),
        tabAudioErrorMessage: (message) => t("tabAudioError", { message }),
    });

    const endBroadcast = async () => {
        onEndBroadcast();
        try {
            await deleteSession();
        } catch (err) {
            clientLogger.error("Failed to explicitly delete session on broadcast end:", err);
        }
        void room.disconnect();
        void router.push("/");
    };

    const handleEndBroadcast = () => {
        void endBroadcast();
    };

    return (
        <section className="grid w-full max-w-xl gap-6">
            <Card className="shadow-md shadow-foreground/5">
                <CardHeader className="px-5 pt-5 sm:px-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="grid min-w-0 gap-1">
                            <CardTitle className="flex items-center gap-2 text-left">
                                <RadioTowerIcon className="size-5 text-primary" />
                                {t("title")}
                            </CardTitle>
                            <CardDescription className="font-mono text-sm">
                                {t("session", { sessionId })}
                            </CardDescription>
                        </div>
                        <Badge variant="outline" className="gap-1">
                            {t("listenerCount", { count: listenerCount })}
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="px-5 pb-5 sm:px-6 sm:pb-6">
                    <FieldGroup className="gap-6">
                        <BroadcastStatus
                            expiresAt={expiresAt}
                            isAudioActive={audioMixer.isAudioActive}
                            isMicEnabled={audioMixer.isMicEnabled}
                            isTabAudioEnabled={audioMixer.isTabAudioEnabled}
                            isWakeLockActive={isWakeLockActive}
                            onSessionExpired={onSessionExpired}
                        />

                        <FieldSet className="gap-3 border-t border-border/35 pt-5">
                            <FieldTitle>{t("audioSources")}</FieldTitle>
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
                                    icon={
                                        <ScreenShareIcon className="size-4 text-muted-foreground" />
                                    }
                                    onToggle={audioMixer.toggleTabAudio}
                                    onVolumeChange={audioMixer.handleTabVolumeChange}
                                />
                            </div>
                        </FieldSet>

                        <FieldSet className="gap-3 border-t border-border/35 pt-5">
                            <SharePanel
                                isJoinUrlCopied={join.isCopied}
                                joinPath={join.joinPath}
                                joinUrl={join.joinUrl}
                                onCopyJoinUrl={join.copyJoinUrl}
                            />
                        </FieldSet>

                        <FieldSet className="gap-3 border-t border-border/35 pt-5">
                            <ActiveTranslationsPanel translations={translations} />
                        </FieldSet>

                        <FieldSet className="gap-3 border-t border-border/35 pt-5">
                            <EndBroadcastControl onEnd={handleEndBroadcast} />
                        </FieldSet>
                    </FieldGroup>
                </CardContent>
            </Card>
        </section>
    );
}
