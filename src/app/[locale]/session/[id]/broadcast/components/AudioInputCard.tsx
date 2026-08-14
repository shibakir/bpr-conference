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
            <div className="grid gap-1.5">
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
        <div className="grid gap-3 rounded-lg bg-muted/35 p-3">
            <div className="flex items-center justify-between gap-3">
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
                >
                    {enabled ? stopLabel : actionLabel}
                </Button>
            </div>
            {deviceSelect}
            {enabled && (
                <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_3rem] items-center gap-3">
                    <span className="font-mono text-sm text-muted-foreground">{t("volume")}</span>
                    <Slider
                        value={[volume]}
                        min={0}
                        max={100}
                        step={1}
                        onValueChange={(value) => onVolumeChange(value[0] ?? 0)}
                    />
                    <span className="text-right font-mono text-sm tabular-nums text-muted-foreground">
                        {volume}%
                    </span>
                </div>
            )}
        </div>
    );
}
