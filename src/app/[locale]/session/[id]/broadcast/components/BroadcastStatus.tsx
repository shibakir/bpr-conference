"use client";

import { LockKeyholeIcon, UsersIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import SessionCountdown from "@/components/SessionCountdown";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function BroadcastStatus({
    expiresAt,
    isAudioActive,
    isMicEnabled,
    isTabAudioEnabled,
    isWakeLockActive,
    listenerCount,
    onSessionExpired,
}: {
    expiresAt: string | null;
    isAudioActive: boolean;
    isMicEnabled: boolean;
    isTabAudioEnabled: boolean;
    isWakeLockActive: boolean;
    listenerCount: number;
    onSessionExpired: () => void;
}) {
    const t = useTranslations("Broadcast");
    let statusText = t("muted");
    if (isMicEnabled && isTabAudioEnabled) {
        statusText = t("liveMicTab");
    } else if (isMicEnabled) {
        statusText = t("liveMic");
    } else if (isTabAudioEnabled) {
        statusText = t("liveTab");
    }

    return (
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
                        isAudioActive ? "border-success/30 text-success" : "text-muted-foreground",
                    )}
                >
                    <span
                        className={cn(
                            "size-1.5 rounded-full bg-current",
                            isAudioActive && "animate-pulse",
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
    );
}
