"use client";

import { Volume2Icon } from "lucide-react";
import { useTranslations } from "next-intl";

import { CenteredPage } from "@/components/CenteredPage";
import SessionCountdown from "@/components/SessionCountdown";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function WatchStartGate({
    sessionId,
    expiresAt,
    onStart,
    onSessionExpired,
}: {
    sessionId: string;
    expiresAt: string | null;
    onStart: () => void;
    onSessionExpired: () => void;
}) {
    const t = useTranslations("Watch");

    return (
        <CenteredPage>
            <Card className="w-full max-w-xl shadow-md shadow-foreground/5">
                <CardHeader className="px-5 pt-5 sm:px-6">
                    <CardTitle className="flex items-center gap-2 text-left">
                        <Volume2Icon className="size-5 text-primary" />
                        {t("ready")}
                    </CardTitle>
                    <CardDescription>{t("readyCopy")}</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 px-5 pb-5 sm:px-6 sm:pb-6">
                    <SessionCountdown
                        expiresAt={expiresAt}
                        timeRemainingLabel={t("timeRemaining")}
                        endedLabel={t("sessionEnded")}
                        onExpire={onSessionExpired}
                    />
                    <Button onClick={onStart} className="w-full">
                        <Volume2Icon />
                        {t("startListening")}
                    </Button>
                    <p className="font-mono text-xs text-muted-foreground">
                        {t("session", { sessionId })}
                    </p>
                </CardContent>
            </Card>
        </CenteredPage>
    );
}
