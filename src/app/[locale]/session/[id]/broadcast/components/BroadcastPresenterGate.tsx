"use client";

import { HeadphonesIcon, HomeIcon, RadioTowerIcon, RotateCcwIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { CenteredPage } from "@/components/CenteredPage";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

export function BroadcastPresenterGate({
    canTakeOver,
    onGoHome,
    onOpenListenerPage,
    onTakeOver,
    state,
    verifying,
}: {
    canTakeOver: boolean;
    onGoHome: () => void;
    onOpenListenerPage: () => void;
    onTakeOver: () => void;
    state: "missing_key" | "active_elsewhere";
    verifying: boolean;
}) {
    const t = useTranslations("Broadcast");
    const isActiveElsewhere = state === "active_elsewhere";

    return (
        <CenteredPage>
            <Card className="w-full max-w-xl shadow-md shadow-foreground/5">
                <CardHeader className="px-5 pt-5 sm:px-6">
                    <CardTitle className="flex items-center gap-2 text-left">
                        <RadioTowerIcon className="size-5 text-primary" />
                        {isActiveElsewhere
                            ? t("controlsActiveTitle")
                            : t("organizerAccessRequiredTitle")}
                    </CardTitle>
                    <CardDescription>
                        {isActiveElsewhere
                            ? t("controlsActiveDescription")
                            : t("organizerAccessRequiredDescription")}
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 px-5 pb-5 sm:px-6 sm:pb-6">
                    {isActiveElsewhere && canTakeOver && (
                        <Button onClick={onTakeOver} disabled={verifying} className="w-full">
                            {verifying ? <Spinner /> : <RotateCcwIcon />}
                            {verifying ? t("takingOver") : t("takeOverControls")}
                        </Button>
                    )}
                    <Button variant="outline" onClick={onOpenListenerPage} className="w-full">
                        <HeadphonesIcon />
                        {t("openListenerPage")}
                    </Button>
                    <Button variant="ghost" onClick={onGoHome} className="w-full">
                        <HomeIcon />
                        {t("goHome")}
                    </Button>
                </CardContent>
            </Card>
        </CenteredPage>
    );
}
