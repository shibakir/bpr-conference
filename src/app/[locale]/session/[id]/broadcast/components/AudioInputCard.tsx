"use client";

import { useTranslations } from "next-intl";
import { type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
    <Card size="sm">
      <CardHeader className="items-center">
        <CardTitle className="flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
        <CardAction>
          <Button
            type="button"
            variant={enabled ? "destructive" : "default"}
            size="sm"
            onClick={onToggle}
          >
            {enabled ? stopLabel : actionLabel}
          </Button>
        </CardAction>
      </CardHeader>
      {enabled && (
        <CardContent>
          <div className="grid grid-cols-[2.5rem_1fr_3rem] items-center gap-3">
            <span className="font-mono text-xs text-muted-foreground">
              {t("volume")}
            </span>
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
        </CardContent>
      )}
    </Card>
  );
}
