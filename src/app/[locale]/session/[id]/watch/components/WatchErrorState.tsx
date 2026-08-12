"use client";

import { AlertTriangleIcon, RefreshCwIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { CenteredPage } from "@/components/CenteredPage";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import type { WatchError } from "../types";

export function WatchErrorState({ error }: { error: WatchError }) {
  const t = useTranslations("Watch");
  const isEndedSession = error.kind === "ended";
  const isInactiveSession = error.kind === "inactive";

  return (
    <CenteredPage>
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle className="flex items-center justify-center gap-2">
            <AlertTriangleIcon className="size-4 text-destructive" />
            {isEndedSession
              ? t("sessionEnded")
              : isInactiveSession
                ? t("broadcastNotStarted")
                : t("somethingWentWrong")}
          </CardTitle>
          <CardDescription>{error.message}</CardDescription>
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
    </CenteredPage>
  );
}
