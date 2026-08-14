"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useId } from "react";

import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Slider } from "@/components/ui/slider";

type AudioInputDeviceOption = {
    label: string;
    value: string;
};

const MAX_VOLUME_PERCENT = 200;

export function AudioInputCard({
    title,
    enabled,
    volume,
    actionLabel,
    deviceSelectLabel,
    deviceSelectOptions,
    deviceSelectValue,
    stopLabel,
    icon,
    onDeviceSelectChange,
    onToggle,
    onVolumeChange,
}: {
    title: string;
    enabled: boolean;
    volume: number;
    actionLabel: string;
    deviceSelectLabel?: string;
    deviceSelectOptions?: AudioInputDeviceOption[];
    deviceSelectValue?: string;
    stopLabel: string;
    icon: ReactNode;
    onDeviceSelectChange?: (value: string) => void | Promise<void>;
    onToggle: () => void;
    onVolumeChange: (value: number) => void;
}) {
    const t = useTranslations("Broadcast");
    const deviceSelectId = useId();
    const deviceSelect =
        deviceSelectLabel !== undefined &&
        deviceSelectOptions !== undefined &&
        deviceSelectValue !== undefined ? (
            <div className="grid min-w-0 gap-1.5">
                <label
                    htmlFor={deviceSelectId}
                    className="text-sm font-medium text-muted-foreground"
                >
                    {deviceSelectLabel}
                </label>
                <NativeSelect
                    id={deviceSelectId}
                    value={deviceSelectValue}
                    onChange={(event) => {
                        void onDeviceSelectChange?.(event.target.value);
                    }}
                    className="w-full"
                    size="sm"
                >
                    {deviceSelectOptions.map((device) => (
                        <NativeSelectOption key={device.value} value={device.value}>
                            {device.label}
                        </NativeSelectOption>
                    ))}
                </NativeSelect>
            </div>
        ) : null;

    return (
        <div className="grid min-w-0 gap-3 rounded-lg bg-muted/35 p-3">
            <div className="flex min-w-0 flex-col items-stretch gap-3 min-[400px]:flex-row min-[400px]:items-center min-[400px]:justify-between">
                <div className="flex min-w-0 items-center gap-2 text-base font-medium">
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
                    className="w-full min-[400px]:w-auto"
                >
                    {enabled ? stopLabel : actionLabel}
                </Button>
            </div>
            {deviceSelect}
            {enabled && (
                <div className="grid min-w-0 gap-2">
                    <div className="flex min-w-0 items-center justify-between gap-3">
                        <span className="min-w-0 truncate font-mono text-sm text-muted-foreground">
                            {t("volume")}
                        </span>
                        <span className="shrink-0 text-right font-mono text-sm tabular-nums text-muted-foreground">
                            {volume}%
                        </span>
                    </div>
                    <Slider
                        value={[volume]}
                        min={0}
                        max={MAX_VOLUME_PERCENT}
                        step={1}
                        aria-label={t("volume")}
                        onValueChange={(value) => onVolumeChange(value[0] ?? 0)}
                        className="min-w-0 px-1.5 py-2"
                    />
                </div>
            )}
        </div>
    );
}
