"use client";

import { useTranslations } from "next-intl";
import { type MutableRefObject, useEffect, useRef } from "react";

const MAX_DEVICE_PIXEL_RATIO = 2;
const TARGET_FRAME_INTERVAL_MS = 1000 / 30;
const SIGNAL_PRESENT_PEAK_THRESHOLD = 0.025;
const SIGNAL_STATUS_RELEASE_DELAY_MS = 1500;
const LEVEL_VISUAL_GAIN = 4;
const PEAK_VISUAL_GAIN = 1.25;

function getClampedLevel(value: number, gain: number) {
    return Math.min(1, Math.max(0, value * gain));
}

function syncCanvasSize(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
    const canvasWidth = Math.round(width * pixelRatio);
    const canvasHeight = Math.round(height * pixelRatio);

    if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
    }

    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    return { height, width };
}

function drawFlatLine(
    canvas: HTMLCanvasElement,
    context: CanvasRenderingContext2D,
    strokeColor: string,
) {
    const { height, width } = syncCanvasSize(canvas, context);
    const centerY = height / 2;

    context.clearRect(0, 0, width, height);
    context.beginPath();
    context.moveTo(0, centerY);
    context.lineTo(width, centerY);
    context.lineCap = "round";
    context.lineWidth = 2;
    context.strokeStyle = strokeColor;
    context.stroke();
}

function drawWaveform(
    canvas: HTMLCanvasElement,
    context: CanvasRenderingContext2D,
    timeDomainData: Uint8Array,
    strokeColor: string,
) {
    const { height, width } = syncCanvasSize(canvas, context);
    const centerY = height / 2;
    const amplitude = height * 0.42;
    const sampleCount = timeDomainData.length;
    const sliceWidth = sampleCount > 1 ? width / (sampleCount - 1) : width;

    context.clearRect(0, 0, width, height);
    context.beginPath();

    for (let index = 0; index < sampleCount; index += 1) {
        const sample = ((timeDomainData[index] ?? 128) - 128) / 128;
        const x = index * sliceWidth;
        const y = centerY + sample * amplitude;

        if (index === 0) {
            context.moveTo(x, y);
        } else {
            context.lineTo(x, y);
        }
    }

    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 2;
    context.strokeStyle = strokeColor;
    context.stroke();
}

function getSignalLevels(timeDomainData: Uint8Array) {
    let peak = 0;
    let sumSquares = 0;

    for (const value of timeDomainData) {
        const sample = (value - 128) / 128;
        const absoluteSample = Math.abs(sample);
        peak = Math.max(peak, absoluteSample);
        sumSquares += sample * sample;
    }

    const rms = timeDomainData.length > 0 ? Math.sqrt(sumSquares / timeDomainData.length) : 0;

    return { peak, rms };
}

export function AudioSignalMonitor({
    analyserNodeRef,
    isActive,
}: {
    analyserNodeRef: MutableRefObject<AnalyserNode | null>;
    isActive: boolean;
}) {
    const t = useTranslations("Broadcast");
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const levelBarRef = useRef<HTMLSpanElement | null>(null);
    const peakBarRef = useRef<HTMLSpanElement | null>(null);
    const statusTextRef = useRef<HTMLSpanElement | null>(null);
    const statusDotRef = useRef<HTMLSpanElement | null>(null);
    const lastStatusRef = useRef<string | null>(null);
    const signalIdle = t("signalIdle");
    const signalQuiet = t("signalQuiet");
    const signalPresent = t("signalPresent");

    useEffect(() => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) return;

        const computedStyle = getComputedStyle(canvas);
        const signalColor = computedStyle.color;
        const quietColor = computedStyle.borderTopColor;
        let animationFrameId = 0;
        let lastFrameAt = 0;
        let lastSignalDetectedAt = 0;
        let timeDomainData = new Uint8Array(0);

        const updateMeters = (level: number, peak: number) => {
            if (levelBarRef.current) {
                levelBarRef.current.style.transform = `scaleX(${level.toFixed(3)})`;
            }
            if (peakBarRef.current) {
                peakBarRef.current.style.transform = `scaleX(${peak.toFixed(3)})`;
            }
        };

        const updateStatus = (text: string, hasSignal: boolean) => {
            if (lastStatusRef.current === text) return;

            lastStatusRef.current = text;
            if (statusTextRef.current) {
                statusTextRef.current.textContent = text;
            }
            if (statusDotRef.current) {
                statusDotRef.current.style.backgroundColor = hasSignal ? signalColor : quietColor;
            }
        };

        const drawIdleState = () => {
            lastSignalDetectedAt = 0;
            drawFlatLine(canvas, context, quietColor);
            updateMeters(0, 0);
            updateStatus(isActive ? signalQuiet : signalIdle, false);
        };

        const drawFrame = (timestamp: number) => {
            animationFrameId = window.requestAnimationFrame(drawFrame);
            if (timestamp - lastFrameAt < TARGET_FRAME_INTERVAL_MS) {
                return;
            }
            lastFrameAt = timestamp;

            const analyser = analyserNodeRef.current;
            if (!isActive || !analyser) {
                drawIdleState();
                return;
            }

            if (timeDomainData.length !== analyser.fftSize) {
                timeDomainData = new Uint8Array(analyser.fftSize);
            }

            analyser.getByteTimeDomainData(timeDomainData);
            drawWaveform(canvas, context, timeDomainData, signalColor);

            const { peak, rms } = getSignalLevels(timeDomainData);
            const hasSignal = peak >= SIGNAL_PRESENT_PEAK_THRESHOLD;
            if (hasSignal) {
                lastSignalDetectedAt = timestamp;
            }
            const hasRecentSignal =
                lastSignalDetectedAt > 0 &&
                timestamp - lastSignalDetectedAt < SIGNAL_STATUS_RELEASE_DELAY_MS;

            updateMeters(
                getClampedLevel(rms, LEVEL_VISUAL_GAIN),
                getClampedLevel(peak, PEAK_VISUAL_GAIN),
            );
            updateStatus(hasRecentSignal ? signalPresent : signalQuiet, hasRecentSignal);
        };

        drawIdleState();

        if (isActive) {
            animationFrameId = window.requestAnimationFrame(drawFrame);
        }

        const handleResize = () => {
            if (!isActive) {
                drawIdleState();
            }
        };

        const resizeObserver = "ResizeObserver" in window ? new ResizeObserver(handleResize) : null;
        resizeObserver?.observe(canvas);
        window.addEventListener("resize", handleResize);

        return () => {
            window.cancelAnimationFrame(animationFrameId);
            resizeObserver?.disconnect();
            window.removeEventListener("resize", handleResize);
        };
    }, [analyserNodeRef, isActive, signalIdle, signalPresent, signalQuiet]);

    return (
        <div className="grid gap-3 rounded-lg bg-muted/35 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="grid min-w-0 gap-0.5">
                    <div className="text-base font-medium">{t("audioSignal")}</div>
                    <div className="text-sm text-muted-foreground">{t("mixedOutput")}</div>
                </div>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <span
                        ref={statusDotRef}
                        className="size-2 rounded-full bg-muted-foreground/50"
                        aria-hidden="true"
                    />
                    <span ref={statusTextRef}>{isActive ? signalQuiet : signalIdle}</span>
                </div>
            </div>

            <canvas
                ref={canvasRef}
                className="h-20 w-full rounded-md border border-border bg-background/45 text-primary"
                aria-label={t("audioSignal")}
            />

            <div className="grid gap-2">
                <div className="grid grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-3">
                    <span className="font-mono text-sm text-muted-foreground">
                        {t("signalLevel")}
                    </span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-background/70">
                        <span
                            ref={levelBarRef}
                            className="block h-full w-full origin-left rounded-full bg-primary transition-transform duration-75"
                            style={{ transform: "scaleX(0)" }}
                        />
                    </span>
                </div>
                <div className="grid grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-3">
                    <span className="font-mono text-sm text-muted-foreground">
                        {t("signalPeak")}
                    </span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-background/70">
                        <span
                            ref={peakBarRef}
                            className="block h-full w-full origin-left rounded-full bg-primary/75 transition-transform duration-75"
                            style={{ transform: "scaleX(0)" }}
                        />
                    </span>
                </div>
            </div>
        </div>
    );
}
