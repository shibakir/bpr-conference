"use client";

import { LockKeyholeIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import SessionCountdown from "@/components/SessionCountdown";
import { Badge } from "@/components/ui/badge";

export function ListenerStatus({
    audioMuted,
    currentLanguage,
    expiresAt,
    isConnected,
    isReceivingAudio,
    isWakeLockActive,
    onSessionExpired,
}: {
    audioMuted: boolean;
    currentLanguage: string;
    expiresAt: string | null;
    isConnected: boolean;
    isReceivingAudio: boolean;
    isWakeLockActive: boolean;
    onSessionExpired: () => void;
}) {
    const t = useTranslations("Watch");

    return (
        <section className="rounded-lg bg-muted/20 p-3">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
                <div className={`waveform ${isReceivingAudio ? "active" : "idle"}`}>
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="waveform-bar" />
                    ))}
                </div>

                {isConnected ? (
                    <Badge variant="outline" className="gap-1 border-success/30 text-success">
                        <span className="size-1.5 rounded-full bg-current animate-pulse" />
                        {audioMuted
                            ? t("audioMuted")
                            : currentLanguage === "original"
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

                <SessionCountdown
                    expiresAt={expiresAt}
                    timeRemainingLabel={t("timeRemaining")}
                    endedLabel={t("sessionEnded")}
                    onExpire={onSessionExpired}
                />
            </div>
        </section>
    );
}
