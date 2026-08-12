"use client";

import { useTranslations } from "next-intl";
import { type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

export function AudioInputCard({
    title,
    enabled,
    volume,
    actionLabel,
    stopLabel,
    icon,
    onToggle,
    onVolumeChange,
}: {
    title: string;
    enabled: boolean;
    volume: number;
    actionLabel: string;
    stopLabel: string;
    icon: ReactNode;
    onToggle: () => void;
    onVolumeChange: (value: number) => void;
}) {
    const t = useTranslations("Broadcast");

    return (
        <div className="grid gap-3 rounded-lg bg-muted/35 p-3">
            <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        {icon}
                    </span>
                    <span className="truncate">{title}</span>
                </div>
                <Button
                    type="button"
                    variant={enabled ? "destructive" : "default"}
                    size="sm"
                    onClick={onToggle}
                >
                    {enabled ? stopLabel : actionLabel}
                </Button>
            </div>
            {enabled && (
                <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_3rem] items-center gap-3">
                    <span className="font-mono text-xs text-muted-foreground">{t("volume")}</span>
                    <Slider
                        value={[volume]}
                        min={0}
                        max={100}
                        step={1}
                        onValueChange={(value) => onVolumeChange(value[0] ?? 0)}
                    />
                    <span className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                        {volume}%
                    </span>
                </div>
            )}
        </div>
    );
}
