"use client";

import { CheckIcon, CopyIcon, KeyRoundIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ControlRecoveryPanel({
    isCopied,
    recoveryUrl,
    onCopyRecoveryUrl,
}: {
    isCopied: boolean;
    recoveryUrl: string;
    onCopyRecoveryUrl: () => void;
}) {
    const t = useTranslations("Broadcast");

    return (
        <section className="grid gap-3">
            <Badge variant="outline" className="gap-1 border-transparent bg-muted/45">
                <KeyRoundIcon className="size-3" />
                {t("controlRecovery")}
            </Badge>
            <div className="grid gap-3 rounded-lg bg-muted/20 p-4">
                <p className="text-sm leading-6 text-muted-foreground">
                    {t("controlRecoveryDescription")}
                </p>
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <Input
                        value={recoveryUrl}
                        readOnly
                        aria-label={t("controlRecoveryLinkLabel")}
                        className="font-mono text-xs"
                        onFocus={(event) => event.currentTarget.select()}
                    />
                    <Button type="button" variant="outline" onClick={onCopyRecoveryUrl}>
                        {isCopied ? <CheckIcon className="text-success" /> : <CopyIcon />}
                        {isCopied ? t("linkCopied") : t("copyLink")}
                    </Button>
                </div>
            </div>
        </section>
    );
}
