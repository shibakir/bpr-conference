"use client";

import { Volume2Icon } from "lucide-react";
import { useTranslations } from "next-intl";

import { CenteredPage } from "@/components/CenteredPage";
import SessionCountdown from "@/components/SessionCountdown";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle className="text-3xl">{t("ready")}</CardTitle>
          <CardDescription>{t("readyCopy")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <SessionCountdown
            expiresAt={expiresAt}
            timeRemainingLabel={t("timeRemaining")}
            endedLabel={t("sessionEnded")}
            className="mx-auto"
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
