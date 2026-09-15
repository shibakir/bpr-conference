"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
    AUDIO_TRANSMISSION_BITRATES,
    type AudioTransmissionBitrate,
    DEFAULT_AUDIO_TRANSMISSION_BITRATE,
} from "@/lib/audio-transmission-quality";

export function AudioTransmissionQuality({
    bitrate,
    locked,
    onChange,
}: {
    bitrate: AudioTransmissionBitrate | null;
    locked: boolean;
    onChange: (value: number) => void;
}) {
    const t = useTranslations("AudioTransmissionQuality");
    const id = useId();

    return (
        <div className="grid min-w-0 gap-2">
            <label htmlFor={id} className="text-sm font-medium">
                {t("title")}
            </label>
            <NativeSelect
                id={id}
                value={bitrate ?? DEFAULT_AUDIO_TRANSMISSION_BITRATE}
                disabled={bitrate === null || locked}
                onChange={(event) => onChange(Number(event.target.value))}
                aria-describedby={`${id}-help ${id}-availability`}
                className="w-full"
            >
                {AUDIO_TRANSMISSION_BITRATES.map((option) => (
                    <NativeSelectOption key={option} value={option}>
                        {t(`options.${option}`)}
                    </NativeSelectOption>
                ))}
            </NativeSelect>
            <p id={`${id}-help`} className="text-sm text-muted-foreground">
                {t("description")}
            </p>
            <p
                id={`${id}-availability`}
                className="text-sm text-muted-foreground"
                aria-live="polite"
            >
                {t(locked ? "locked" : "availability")}
            </p>
        </div>
    );
}
