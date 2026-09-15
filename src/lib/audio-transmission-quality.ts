export const AUDIO_TRANSMISSION_BITRATES = [32_000, 48_000, 96_000] as const;
export type AudioTransmissionBitrate = (typeof AUDIO_TRANSMISSION_BITRATES)[number];

export const DEFAULT_AUDIO_TRANSMISSION_BITRATE: AudioTransmissionBitrate = 48_000;
export const AUDIO_TRANSMISSION_STORAGE_KEY = "bpr.audio-transmission-bitrate.v1";

export function isAudioTransmissionBitrate(value: number): value is AudioTransmissionBitrate {
    return AUDIO_TRANSMISSION_BITRATES.some((bitrate) => bitrate === value);
}
