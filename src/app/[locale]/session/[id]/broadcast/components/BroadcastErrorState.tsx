"use client";

import { AlertTriangleIcon, HomeIcon } from "lucide-react";
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

export function BroadcastErrorState({
  error,
  onGoHome,
}: {
  error: string;
  onGoHome: () => void;
}) {
  const t = useTranslations("Broadcast");

  return (
    <CenteredPage>
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle className="flex items-center justify-center gap-2">
            <AlertTriangleIcon className="size-4 text-destructive" />
            {t("somethingWentWrong")}
          </CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={onGoHome} className="w-full">
            <HomeIcon />
            {t("goHome")}
          </Button>
        </CardContent>
      </Card>
    </CenteredPage>
  );
}
