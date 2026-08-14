"use client";

import {
    CaptionsIcon,
    Maximize2Icon,
    Minimize2Icon,
    PictureInPicture2Icon,
    Settings2Icon,
    XIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
    type CSSProperties,
    type ReactNode,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import { FieldLabel } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { clientLogger } from "@/lib/client-logger";

import {
    CAPTION_FONT_OPTIONS,
    type CaptionWindowSettings,
    getCaptionBackground,
    getCaptionFontCssValue,
    useCaptionWindowPreference,
} from "../hooks/useCaptionWindowPreference";
import type { TranscriptEntry } from "../types";
import { getTranscriptParagraphs } from "../utils";

type CaptionMode = "document-pip" | "video-pip" | "inline";

type DocumentPictureInPictureController = {
    window?: Window | null;
    requestWindow: (options?: {
        width?: number;
        height?: number;
        disallowReturnToOpener?: boolean;
        preferInitialWindowPlacement?: boolean;
    }) => Promise<Window>;
};

type WindowWithDocumentPictureInPicture = Window & {
    documentPictureInPicture?: DocumentPictureInPictureController;
};

type WebKitPictureInPictureVideoElement = HTMLVideoElement & {
    webkitPresentationMode?: "fullscreen" | "inline" | "picture-in-picture";
    webkitSetPresentationMode?: (mode: "inline" | "picture-in-picture") => void;
    webkitSupportsPresentationMode?: (mode: "picture-in-picture") => boolean;
};

export type FloatingCaptionPanel = {
    emptyMessage: string;
    language: string;
    title: string;
    transcripts: TranscriptEntry[];
};

type CaptionParagraph = {
    final: boolean;
    id: string;
    text: string;
};

type CaptionCanvasPanel = {
    emptyMessage: string;
    paragraphs: CaptionParagraph[];
    title: string;
};

type CaptionCanvasLine = {
    final: boolean;
    text: string;
};

type CaptionWindowSize = {
    height: number;
    width: number;
};

const DEFAULT_PIP_WINDOW_SIZE: CaptionWindowSize = {
    height: 360,
    width: 720,
};
const PIP_CANVAS_FRAME_RATE = 10;

function hexToRgba(hex: string, alpha: number): string {
    const normalized = /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#ffffff";
    const value = Number.parseInt(normalized.slice(1), 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getExpandedCaptionWindowSize(targetWindow: Window = window): CaptionWindowSize {
    return {
        height: Math.max(
            DEFAULT_PIP_WINDOW_SIZE.height,
            Math.floor(targetWindow.screen.availHeight || targetWindow.innerHeight),
        ),
        width: Math.max(
            DEFAULT_PIP_WINDOW_SIZE.width,
            Math.floor(targetWindow.screen.availWidth || targetWindow.innerWidth),
        ),
    };
}

function getCaptionWindowSize(expanded: boolean): CaptionWindowSize {
    if (!expanded || typeof window === "undefined") {
        return DEFAULT_PIP_WINDOW_SIZE;
    }

    return getExpandedCaptionWindowSize(window);
}

function wrapCanvasLine(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let currentLine = "";

    for (const word of words) {
        const nextLine = currentLine ? `${currentLine} ${word}` : word;
        if (ctx.measureText(nextLine).width <= maxWidth) {
            currentLine = nextLine;
            continue;
        }

        if (currentLine) {
            lines.push(currentLine);
            currentLine = "";
        }

        if (ctx.measureText(word).width <= maxWidth) {
            currentLine = word;
            continue;
        }

        let wordChunk = "";
        for (const char of word) {
            const nextChunk = `${wordChunk}${char}`;
            if (ctx.measureText(nextChunk).width <= maxWidth) {
                wordChunk = nextChunk;
                continue;
            }
            if (wordChunk) {
                lines.push(wordChunk);
            }
            wordChunk = char;
        }
        currentLine = wordChunk;
    }

    if (currentLine) {
        lines.push(currentLine);
    }

    return lines;
}

function getCanvasLines({
    ctx,
    emptyMessage,
    maxWidth,
    paragraphs,
}: {
    ctx: CanvasRenderingContext2D;
    emptyMessage: string;
    maxWidth: number;
    paragraphs: CaptionParagraph[];
}): CaptionCanvasLine[] {
    if (paragraphs.length === 0) {
        return wrapCanvasLine(ctx, emptyMessage, maxWidth).map((text) => ({
            final: false,
            text,
        }));
    }

    return paragraphs.flatMap((paragraph) =>
        wrapCanvasLine(ctx, paragraph.text, maxWidth).map((text) => ({
            final: paragraph.final,
            text,
        })),
    );
}

function drawCaptionsOnCanvas({
    canvas,
    emptyMessage,
    panels,
    settings,
    size,
}: {
    canvas: HTMLCanvasElement | null;
    emptyMessage: string;
    panels: CaptionCanvasPanel[];
    settings: CaptionWindowSettings;
    size: CaptionWindowSize;
}) {
    if (!canvas) return;

    if (canvas.width !== size.width) {
        canvas.width = size.width;
    }
    if (canvas.height !== size.height) {
        canvas.height = size.height;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, size.width, size.height);
    ctx.fillStyle = getCaptionBackground(settings);
    ctx.fillRect(0, 0, size.width, size.height);

    const visiblePanels =
        panels.length > 0
            ? panels
            : [
                  {
                      emptyMessage,
                      paragraphs: [],
                      title: "",
                  },
              ];
    const fontFamily = getCaptionFontCssValue(settings.fontFamily);
    const padding = Math.max(18, Math.round(settings.fontSize * 0.75));
    const gap = visiblePanels.length > 1 ? Math.max(12, Math.round(settings.fontSize * 0.45)) : 0;
    const availableHeight = Math.max(
        1,
        size.height - padding * 2 - gap * (visiblePanels.length - 1),
    );
    const panelHeight = availableHeight / visiblePanels.length;
    const titleFontSize = Math.max(11, Math.round(settings.fontSize * 0.42));
    const titleHeight = titleFontSize + 14;
    const lineHeightPx = settings.fontSize * settings.lineHeight;

    visiblePanels.forEach((panel, index) => {
        const panelY = padding + index * (panelHeight + gap);
        const panelX = padding;
        const panelWidth = size.width - padding * 2;
        const panelPadding = visiblePanels.length > 1 ? Math.max(10, Math.round(padding * 0.6)) : 0;
        const textX = panelX + panelPadding;
        const textWidth = panelWidth - panelPadding * 2;
        const textBottom = panelY + panelHeight - panelPadding;
        const textTop = panelY + (panel.title ? titleHeight : 0) + panelPadding;
        const textHeight = Math.max(lineHeightPx, textBottom - textTop);

        if (visiblePanels.length > 1) {
            ctx.save();
            ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
            ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
            ctx.lineWidth = 1;
            ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
            ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);
            ctx.restore();
        }

        if (panel.title) {
            ctx.save();
            ctx.fillStyle = hexToRgba(settings.textColor, 0.7);
            ctx.font = `700 ${titleFontSize}px ${fontFamily}`;
            ctx.textBaseline = "top";
            ctx.fillText(panel.title.toUpperCase(), textX, panelY + panelPadding);
            ctx.restore();
        }

        ctx.save();
        ctx.font = `650 ${settings.fontSize}px ${fontFamily}`;
        ctx.textBaseline = "top";
        ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
        ctx.shadowBlur = Math.max(4, Math.round(settings.fontSize / 4));

        const sourceLines = getCanvasLines({
            ctx,
            emptyMessage: panel.emptyMessage,
            maxWidth: textWidth,
            paragraphs: panel.paragraphs,
        });
        const maxVisibleLines = Math.max(
            1,
            Math.min(settings.maxLines, Math.floor(textHeight / lineHeightPx)),
        );
        const visibleLines = sourceLines.slice(-maxVisibleLines);
        const firstLineY = Math.max(textTop, textBottom - visibleLines.length * lineHeightPx);

        visibleLines.forEach((line, lineIndex) => {
            ctx.fillStyle = line.final ? settings.textColor : hexToRgba(settings.textColor, 0.68);
            ctx.fillText(line.text, textX, firstLineY + lineIndex * lineHeightPx);
        });

        ctx.restore();
    });
}

function requestCanvasFrame(stream: MediaStream | null) {
    const [track] = stream?.getVideoTracks() ?? [];
    if (!track) return;

    (track as MediaStreamTrack & { requestFrame?: () => void }).requestFrame?.();
}

async function requestVideoPictureInPicture(video: HTMLVideoElement): Promise<boolean> {
    if (typeof video.requestPictureInPicture === "function" && document.pictureInPictureEnabled) {
        await video.requestPictureInPicture();
        return true;
    }

    const webKitVideo = video as WebKitPictureInPictureVideoElement;
    if (
        webKitVideo.webkitSupportsPresentationMode?.("picture-in-picture") &&
        webKitVideo.webkitSetPresentationMode
    ) {
        webKitVideo.webkitSetPresentationMode("picture-in-picture");
        return true;
    }

    return false;
}

async function exitVideoPictureInPicture(video: HTMLVideoElement) {
    if (
        document.pictureInPictureElement === video &&
        typeof document.exitPictureInPicture === "function"
    ) {
        await document.exitPictureInPicture();
        return;
    }

    const webKitVideo = video as WebKitPictureInPictureVideoElement;
    if (
        webKitVideo.webkitPresentationMode === "picture-in-picture" &&
        webKitVideo.webkitSetPresentationMode
    ) {
        webKitVideo.webkitSetPresentationMode("inline");
    }
}

function prepareDocumentPipWindow(pipWindow: Window, title: string): HTMLElement {
    const pipDocument = pipWindow.document;
    const sourceStyles = document.querySelectorAll('link[rel="stylesheet"], style');

    pipDocument.title = title;
    pipDocument.head.innerHTML = "";
    sourceStyles.forEach((node) => {
        pipDocument.head.append(node.cloneNode(true));
    });
    pipDocument.body.innerHTML = "";
    pipDocument.documentElement.style.background = "transparent";
    pipDocument.body.style.margin = "0";
    pipDocument.body.style.overflow = "hidden";
    pipDocument.body.style.background = "transparent";

    const root = pipDocument.createElement("div");
    root.style.width = "100vw";
    root.style.height = "100vh";
    pipDocument.body.append(root);
    return root;
}

function CaptionPanelContent({
    maxHeight,
    panel,
    settings,
}: {
    maxHeight: string;
    panel: FloatingCaptionPanel;
    settings: CaptionWindowSettings;
}) {
    const textWrapRef = useRef<HTMLDivElement | null>(null);
    const paragraphs = useMemo(
        () => getTranscriptParagraphs(panel.transcripts, 1).slice(-settings.maxLines),
        [panel.transcripts, settings.maxLines],
    );

    useEffect(() => {
        const node = textWrapRef.current;
        if (!node) return;
        node.scrollTop = node.scrollHeight;
    }, [panel.emptyMessage, paragraphs, settings.fontSize, settings.lineHeight, settings.maxLines]);

    const panelStyle: CSSProperties = {
        background: "rgba(255, 255, 255, 0.08)",
        border: "1px solid rgba(255, 255, 255, 0.14)",
        borderRadius: 8,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        minWidth: 0,
        overflow: "hidden",
    };
    const panelHeaderStyle: CSSProperties = {
        alignItems: "center",
        color: hexToRgba(settings.textColor, 0.7),
        display: "flex",
        flex: "0 0 auto",
        fontSize: 11,
        fontWeight: 700,
        gap: 8,
        justifyContent: "space-between",
        letterSpacing: 0,
        padding: "8px 10px 0",
        textTransform: "uppercase",
    };
    const textWrapStyle: CSSProperties = {
        display: "block",
        maxHeight,
        overflowX: "hidden",
        overflowY: "hidden",
        padding: "10px 12px 12px",
        scrollBehavior: "auto",
        width: "100%",
    };
    const paragraphStyle: CSSProperties = {
        fontSize: settings.fontSize,
        fontWeight: 650,
        lineHeight: settings.lineHeight,
        margin: `0 0 ${Math.max(8, Math.round(settings.fontSize * 0.3))}px`,
        overflowWrap: "anywhere",
        textShadow: "0 2px 8px rgba(0, 0, 0, 0.45)",
    };
    const emptyStyle: CSSProperties = {
        ...paragraphStyle,
        color: hexToRgba(settings.textColor, 0.68),
        fontStyle: "italic",
    };

    return (
        <section style={panelStyle} aria-label={panel.title}>
            <div style={panelHeaderStyle}>
                <span>{panel.title}</span>
            </div>
            <div ref={textWrapRef} style={textWrapStyle}>
                {paragraphs.length === 0 ? (
                    <p style={emptyStyle}>{panel.emptyMessage}</p>
                ) : (
                    paragraphs.map((paragraph) => (
                        <p
                            key={paragraph.id}
                            style={{
                                ...paragraphStyle,
                                color: paragraph.final
                                    ? settings.textColor
                                    : hexToRgba(settings.textColor, 0.72),
                            }}
                        >
                            {paragraph.text}
                        </p>
                    ))
                )}
            </div>
        </section>
    );
}

function CaptionSurface({
    emptyMessage,
    expanded,
    fill,
    limits,
    modeLabel,
    onClose,
    onReset,
    onSettingsChange,
    onToggleExpanded,
    panels,
    settings,
    title,
}: {
    emptyMessage: string;
    expanded?: boolean;
    fill?: boolean;
    limits: ReturnType<typeof useCaptionWindowPreference>["limits"];
    modeLabel: string;
    onClose?: () => void;
    onReset: () => void;
    onSettingsChange: (patch: Partial<CaptionWindowSettings>) => void;
    onToggleExpanded?: () => void;
    panels: FloatingCaptionPanel[];
    settings: CaptionWindowSettings;
    title: string;
}) {
    const t = useTranslations("Watch");
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [popoverContainer, setPopoverContainer] = useState<HTMLElement | null>(null);
    const lineHeightPx = settings.fontSize * settings.lineHeight;
    const maxLinesHeight = settings.maxLines * lineHeightPx;
    const maxCaptionHeight = fill
        ? `min(${maxLinesHeight}px, calc(100vh - 72px))`
        : `min(${maxLinesHeight}px, calc(100vh - 104px))`;

    const surfaceStyle: CSSProperties = {
        width: fill ? "100vw" : "100%",
        height: fill ? "100vh" : "auto",
        maxHeight: fill ? "100vh" : "calc(100vh - 2rem)",
        background: getCaptionBackground(settings),
        color: settings.textColor,
        display: "flex",
        flexDirection: "column",
        fontFamily: getCaptionFontCssValue(settings.fontFamily),
        overflow: settingsOpen ? "visible" : "hidden",
        position: "relative",
        borderRadius: fill ? 0 : 8,
        border: fill ? "none" : "1px solid rgba(255, 255, 255, 0.18)",
        boxShadow: fill ? "none" : "0 20px 60px rgba(0, 0, 0, 0.35)",
    };
    const headerStyle: CSSProperties = {
        alignItems: "center",
        color: hexToRgba(settings.textColor, 0.72),
        display: "flex",
        flex: "0 0 auto",
        fontSize: 12,
        fontWeight: 700,
        gap: 8,
        justifyContent: "space-between",
        letterSpacing: 0,
        padding: "10px 14px 0",
        textTransform: "uppercase",
    };
    const bodyStyle: CSSProperties = {
        alignItems: "stretch",
        display: "flex",
        flex: "1 1 auto",
        flexDirection: "column",
        justifyContent: "flex-end",
        minHeight: 0,
        overflow: "hidden",
        padding: "14px 24px 24px",
    };
    const panelGridStyle: CSSProperties = {
        alignItems: "stretch",
        display: "grid",
        gap: 12,
        gridAutoRows: panels.length > 1 ? "minmax(0, 1fr)" : "auto",
        gridTemplateColumns: "1fr",
        height: panels.length > 1 ? maxCaptionHeight : "auto",
        maxHeight: maxCaptionHeight,
        minHeight: 0,
        overflow: "hidden",
        width: "100%",
    };
    const paragraphStyle: CSSProperties = {
        fontSize: settings.fontSize,
        fontWeight: 650,
        lineHeight: settings.lineHeight,
        margin: `0 0 ${Math.max(8, Math.round(settings.fontSize * 0.3))}px`,
        overflowWrap: "anywhere",
        textShadow: "0 2px 8px rgba(0, 0, 0, 0.45)",
    };
    const emptyStyle: CSSProperties = {
        ...paragraphStyle,
        color: hexToRgba(settings.textColor, 0.68),
        fontStyle: "italic",
    };
    const closeStyle: CSSProperties = {
        alignItems: "center",
        background: "rgba(255, 255, 255, 0.12)",
        border: "1px solid rgba(255, 255, 255, 0.22)",
        borderRadius: 6,
        color: settings.textColor,
        cursor: "pointer",
        display: "inline-flex",
        height: 24,
        justifyContent: "center",
        padding: 0,
        width: 24,
    };
    const actionGroupStyle: CSSProperties = {
        alignItems: "center",
        display: "flex",
        gap: 6,
    };
    const titleStyle: CSSProperties = {
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
    };
    const settingsPanel = (
        <CaptionSettingsPanel
            limits={limits}
            modeLabel={modeLabel}
            onClose={() => setSettingsOpen(false)}
            onReset={onReset}
            onSettingsChange={onSettingsChange}
            settings={settings}
        />
    );
    const setSurfaceNode = useCallback((node: HTMLDivElement | null) => {
        setPopoverContainer(node?.ownerDocument.body ?? null);
    }, []);

    return (
        <div ref={setSurfaceNode} style={surfaceStyle}>
            <div style={headerStyle}>
                <span style={titleStyle}>{title}</span>
                <span style={actionGroupStyle}>
                    {onToggleExpanded && (
                        <button
                            type="button"
                            onClick={onToggleExpanded}
                            aria-label={
                                expanded ? t("restoreCaptionWindow") : t("expandCaptionWindow")
                            }
                            title={expanded ? t("restoreCaptionWindow") : t("expandCaptionWindow")}
                            style={closeStyle}
                        >
                            {expanded ? <Minimize2Icon size={14} /> : <Maximize2Icon size={14} />}
                        </button>
                    )}
                    <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
                        <PopoverTrigger asChild>
                            <button
                                type="button"
                                aria-expanded={settingsOpen}
                                aria-label={t("captionSettings")}
                                title={t("captionSettings")}
                                style={closeStyle}
                            >
                                <Settings2Icon size={14} />
                            </button>
                        </PopoverTrigger>
                        <PopoverContent
                            align="end"
                            container={popoverContainer}
                            sideOffset={8}
                            className="max-h-[calc(100vh-4rem)] w-[min(88vw,22rem)] overflow-y-auto p-3"
                        >
                            {settingsPanel}
                        </PopoverContent>
                    </Popover>
                    {onClose && (
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label={title}
                            style={closeStyle}
                        >
                            <XIcon size={14} />
                        </button>
                    )}
                </span>
            </div>
            <div style={bodyStyle}>
                {panels.length === 0 ? (
                    <p style={emptyStyle}>{emptyMessage}</p>
                ) : (
                    <div style={panelGridStyle}>
                        {panels.map((panel) => (
                            <CaptionPanelContent
                                key={panel.language}
                                maxHeight={maxCaptionHeight}
                                panel={panel}
                                settings={settings}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function SettingRow({
    children,
    label,
    value,
}: {
    children: ReactNode;
    label: string;
    value: string;
}) {
    return (
        <div className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
                <FieldLabel className="text-sm text-muted-foreground">{label}</FieldLabel>
                <span className="font-mono text-sm text-muted-foreground">{value}</span>
            </div>
            {children}
        </div>
    );
}

export function FloatingTranscriptWindow({
    onOpenChange,
    panels,
}: {
    onOpenChange?: (open: boolean) => void;
    panels: FloatingCaptionPanel[];
}) {
    const t = useTranslations("Watch");
    const { limits, resetSettings, settings, updateSettings } = useCaptionWindowPreference();
    const [mode, setMode] = useState<CaptionMode | null>(null);
    const [documentPipRoot, setDocumentPipRoot] = useState<HTMLElement | null>(null);
    const [documentPipWindow, setDocumentPipWindow] = useState<Window | null>(null);
    const [captionWindowExpanded, setCaptionWindowExpanded] = useState(false);
    const [inlineFullscreen, setInlineFullscreen] = useState(false);
    const [videoSettingsOpen, setVideoSettingsOpen] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const inlineWindowRef = useRef<HTMLDivElement | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const documentPipWindowRef = useRef<Window | null>(null);

    const emptyMessage =
        panels.length === 0 ? t("selectLanguageForTranscription") : t("waitingForSpeech");
    const title = t("floatingCaptions");
    const captionWindowSize = useMemo(
        () => getCaptionWindowSize(captionWindowExpanded),
        [captionWindowExpanded],
    );
    const captionCanvasPanels = useMemo<CaptionCanvasPanel[]>(
        () =>
            panels.map((panel) => ({
                emptyMessage: panel.emptyMessage,
                paragraphs: getTranscriptParagraphs(panel.transcripts, 1).slice(-settings.maxLines),
                title: panel.title,
            })),
        [panels, settings.maxLines],
    );

    useEffect(() => {
        documentPipWindowRef.current = documentPipWindow;
    }, [documentPipWindow]);

    useEffect(() => {
        onOpenChange?.(mode !== null);
    }, [mode, onOpenChange]);

    useEffect(() => {
        const handleFullscreenChange = () => {
            setInlineFullscreen(document.fullscreenElement === inlineWindowRef.current);
        };

        document.addEventListener("fullscreenchange", handleFullscreenChange);
        return () => {
            document.removeEventListener("fullscreenchange", handleFullscreenChange);
        };
    }, []);

    const cleanupVideoStream = useCallback(() => {
        mediaStreamRef.current?.getTracks().forEach((track) => {
            track.stop();
        });
        mediaStreamRef.current = null;
        if (videoRef.current) {
            videoRef.current.pause();
            videoRef.current.srcObject = null;
        }
    }, []);

    const closeFloatingWindow = useCallback(async () => {
        const pipWindow = documentPipWindowRef.current;
        if (pipWindow && !pipWindow.closed) {
            pipWindow.close();
        }
        setDocumentPipWindow(null);
        setDocumentPipRoot(null);

        if (document.fullscreenElement === inlineWindowRef.current) {
            try {
                await document.exitFullscreen();
            } catch {
                // The browser may already have left fullscreen.
            }
        }

        const video = videoRef.current;
        if (video) {
            try {
                await exitVideoPictureInPicture(video);
            } catch {
                // The browser may already have closed the PiP window.
            }
        }

        cleanupVideoStream();
        setMode(null);
    }, [cleanupVideoStream]);

    const resizeDocumentPipWindow = useCallback((expanded: boolean) => {
        const pipWindow = documentPipWindowRef.current;
        if (!pipWindow || pipWindow.closed) return;

        const size = expanded ? getExpandedCaptionWindowSize(pipWindow) : DEFAULT_PIP_WINDOW_SIZE;

        try {
            pipWindow.resizeTo(size.width, size.height);
        } catch (error) {
            clientLogger.warn("[WatchCaptions] Document PiP resize failed:", error);
        }
    }, []);

    const openDocumentPip = useCallback(async () => {
        const docPip = (window as WindowWithDocumentPictureInPicture).documentPictureInPicture;
        if (!docPip?.requestWindow) return false;

        const pipWindow = await docPip.requestWindow({
            height: captionWindowSize.height,
            width: captionWindowSize.width,
            disallowReturnToOpener: false,
        });
        const root = prepareDocumentPipWindow(pipWindow, title);
        const handleClose = () => {
            setDocumentPipWindow(null);
            setDocumentPipRoot(null);
            setMode((current) => (current === "document-pip" ? null : current));
        };

        pipWindow.addEventListener("pagehide", handleClose, { once: true });
        setDocumentPipWindow(pipWindow);
        setDocumentPipRoot(root);
        setMode("document-pip");
        return true;
    }, [captionWindowSize.height, captionWindowSize.width, title]);

    const openVideoPip = useCallback(async () => {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (!canvas || !video || typeof canvas.captureStream !== "function") {
            return false;
        }

        drawCaptionsOnCanvas({
            canvas,
            emptyMessage,
            panels: captionCanvasPanels,
            settings,
            size: captionWindowSize,
        });

        cleanupVideoStream();
        const stream = canvas.captureStream(PIP_CANVAS_FRAME_RATE);
        mediaStreamRef.current = stream;
        requestCanvasFrame(stream);
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        video.height = captionWindowSize.height;
        video.width = captionWindowSize.width;

        await video.play();
        const opened = await requestVideoPictureInPicture(video);
        if (!opened) {
            cleanupVideoStream();
            return false;
        }

        setMode("video-pip");
        return true;
    }, [captionCanvasPanels, captionWindowSize, cleanupVideoStream, emptyMessage, settings]);

    const openFloatingWindow = useCallback(async () => {
        try {
            if (await openDocumentPip()) return;
        } catch (error) {
            clientLogger.warn("[WatchCaptions] Document PiP failed:", error);
        }

        try {
            if (await openVideoPip()) return;
        } catch (error) {
            clientLogger.warn("[WatchCaptions] Video PiP failed:", error);
            cleanupVideoStream();
        }

        setMode("inline");
    }, [cleanupVideoStream, openDocumentPip, openVideoPip]);

    const toggleFloatingWindow = useCallback(() => {
        if (mode) {
            void closeFloatingWindow();
            return;
        }
        void openFloatingWindow();
    }, [closeFloatingWindow, mode, openFloatingWindow]);

    const toggleExpandedCaptionWindow = useCallback(() => {
        if (mode === "inline") {
            if (document.fullscreenElement === inlineWindowRef.current) {
                void document.exitFullscreen().catch((error: unknown) => {
                    clientLogger.warn("[WatchCaptions] Inline fullscreen exit failed:", error);
                });
                return;
            }

            const inlineWindow = inlineWindowRef.current;
            if (!inlineWindow?.requestFullscreen) return;

            void inlineWindow.requestFullscreen().catch((error: unknown) => {
                clientLogger.warn("[WatchCaptions] Inline fullscreen failed:", error);
            });
            return;
        }

        const nextExpanded = !captionWindowExpanded;
        setCaptionWindowExpanded(nextExpanded);

        if (mode === "document-pip") {
            resizeDocumentPipWindow(nextExpanded);
        }
    }, [captionWindowExpanded, mode, resizeDocumentPipWindow]);

    useEffect(() => {
        if (mode !== "video-pip") return;

        drawCaptionsOnCanvas({
            canvas: canvasRef.current,
            emptyMessage,
            panels: captionCanvasPanels,
            settings,
            size: captionWindowSize,
        });
        if (videoRef.current) {
            videoRef.current.height = captionWindowSize.height;
            videoRef.current.width = captionWindowSize.width;
        }
        requestCanvasFrame(mediaStreamRef.current);
    }, [captionCanvasPanels, captionWindowSize, emptyMessage, mode, settings]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const handleLeave = () => {
            const webKitVideo = video as WebKitPictureInPictureVideoElement;
            if (
                document.pictureInPictureElement === video ||
                webKitVideo.webkitPresentationMode === "picture-in-picture"
            ) {
                return;
            }

            cleanupVideoStream();
            setMode((current) => (current === "video-pip" ? null : current));
        };

        video.addEventListener("leavepictureinpicture", handleLeave);
        video.addEventListener("webkitpresentationmodechanged", handleLeave);
        return () => {
            video.removeEventListener("leavepictureinpicture", handleLeave);
            video.removeEventListener("webkitpresentationmodechanged", handleLeave);
        };
    }, [cleanupVideoStream]);

    useEffect(() => {
        return () => {
            cleanupVideoStream();
            const pipWindow = documentPipWindowRef.current;
            if (pipWindow && !pipWindow.closed) {
                pipWindow.close();
            }
        };
    }, [cleanupVideoStream]);

    const modeLabel =
        mode === "document-pip" || mode === "video-pip"
            ? t("captionAlwaysOnTop")
            : mode === "inline"
              ? t("captionInPageFallback")
              : t("captionReady");

    return (
        <div className="relative flex items-center gap-1">
            <Button
                type="button"
                variant={mode ? "secondary" : "outline"}
                size="icon-xs"
                onClick={toggleFloatingWindow}
                title={mode ? t("closeFloatingCaptions") : t("openFloatingCaptions")}
                aria-label={mode ? t("closeFloatingCaptions") : t("openFloatingCaptions")}
            >
                {mode === "document-pip" || mode === "video-pip" ? (
                    <PictureInPicture2Icon className="size-3" />
                ) : (
                    <CaptionsIcon className="size-3" />
                )}
            </Button>

            {mode === "video-pip" && (
                <>
                    <Button
                        type="button"
                        variant={captionWindowExpanded ? "secondary" : "outline"}
                        size="icon-xs"
                        onClick={toggleExpandedCaptionWindow}
                        title={
                            captionWindowExpanded
                                ? t("restoreCaptionWindow")
                                : t("expandCaptionWindow")
                        }
                        aria-label={
                            captionWindowExpanded
                                ? t("restoreCaptionWindow")
                                : t("expandCaptionWindow")
                        }
                    >
                        {captionWindowExpanded ? (
                            <Minimize2Icon className="size-3" />
                        ) : (
                            <Maximize2Icon className="size-3" />
                        )}
                    </Button>
                    <Popover open={videoSettingsOpen} onOpenChange={setVideoSettingsOpen}>
                        <PopoverTrigger asChild>
                            <Button
                                type="button"
                                variant={videoSettingsOpen ? "secondary" : "outline"}
                                size="icon-xs"
                                title={t("captionSettings")}
                                aria-label={t("captionSettings")}
                            >
                                <Settings2Icon className="size-3" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent
                            align="end"
                            sideOffset={8}
                            className="max-h-[calc(100vh-4rem)] w-[min(88vw,22rem)] overflow-y-auto p-3"
                        >
                            <CaptionSettingsPanel
                                limits={limits}
                                modeLabel={modeLabel}
                                onClose={() => setVideoSettingsOpen(false)}
                                onReset={resetSettings}
                                onSettingsChange={updateSettings}
                                settings={settings}
                            />
                        </PopoverContent>
                    </Popover>
                </>
            )}

            {mode === "inline" && (
                <div
                    ref={inlineWindowRef}
                    className={
                        inlineFullscreen
                            ? "fixed inset-0 z-50 overflow-visible"
                            : "fixed right-4 bottom-4 left-4 z-50 overflow-visible"
                    }
                >
                    <CaptionSurface
                        emptyMessage={emptyMessage}
                        expanded={inlineFullscreen}
                        fill={inlineFullscreen}
                        limits={limits}
                        modeLabel={modeLabel}
                        onClose={() => void closeFloatingWindow()}
                        onReset={resetSettings}
                        onSettingsChange={updateSettings}
                        onToggleExpanded={toggleExpandedCaptionWindow}
                        panels={panels}
                        settings={settings}
                        title={title}
                    />
                </div>
            )}

            {mode === "document-pip" &&
                documentPipRoot &&
                createPortal(
                    <CaptionSurface
                        emptyMessage={emptyMessage}
                        expanded={captionWindowExpanded}
                        fill
                        limits={limits}
                        modeLabel={modeLabel}
                        onClose={() => void closeFloatingWindow()}
                        onReset={resetSettings}
                        onSettingsChange={updateSettings}
                        onToggleExpanded={toggleExpandedCaptionWindow}
                        panels={panels}
                        settings={settings}
                        title={title}
                    />,
                    documentPipRoot,
                )}
            <canvas
                ref={canvasRef}
                className="pointer-events-none fixed -z-10 size-px opacity-0"
                aria-hidden="true"
            />
            <video
                ref={videoRef}
                className="pointer-events-none fixed -z-10 size-px opacity-0"
                muted
                playsInline
                aria-hidden="true"
            />
        </div>
    );
}

function CaptionSettingsPanel({
    limits,
    modeLabel,
    onClose,
    onReset,
    onSettingsChange,
    settings,
}: {
    limits: ReturnType<typeof useCaptionWindowPreference>["limits"];
    modeLabel: string;
    onClose: () => void;
    onReset: () => void;
    onSettingsChange: (patch: Partial<CaptionWindowSettings>) => void;
    settings: CaptionWindowSettings;
}) {
    const t = useTranslations("Watch");
    const [openColorPicker, setOpenColorPicker] = useState<"background" | "text" | null>(null);

    return (
        <div className="grid gap-4">
            <div className="mb-3 flex items-center justify-between gap-3">
                <div className="grid gap-0.5">
                    <span className="text-base font-medium">{t("captionSettings")}</span>
                    <span className="text-sm text-muted-foreground">{modeLabel}</span>
                </div>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={onClose}
                    aria-label={t("closeCaptionSettings")}
                    title={t("closeCaptionSettings")}
                >
                    <XIcon className="size-3" />
                </Button>
            </div>

            <div className="grid gap-4">
                <ColorPicker
                    id="caption-background-color"
                    label={t("captionBackgroundColor")}
                    open={openColorPicker === "background"}
                    onOpenChange={(open) => setOpenColorPicker(open ? "background" : null)}
                    value={settings.backgroundColor}
                    onChange={(value) => onSettingsChange({ backgroundColor: value })}
                />

                <SettingRow label={t("captionOpacity")} value={`${settings.backgroundOpacity}%`}>
                    <Slider
                        min={limits.opacity.min}
                        max={limits.opacity.max}
                        step={1}
                        value={[settings.backgroundOpacity]}
                        onValueChange={([value]) =>
                            onSettingsChange({
                                backgroundOpacity: value ?? settings.backgroundOpacity,
                            })
                        }
                    />
                </SettingRow>

                <ColorPicker
                    id="caption-text-color"
                    label={t("captionTextColor")}
                    open={openColorPicker === "text"}
                    onOpenChange={(open) => setOpenColorPicker(open ? "text" : null)}
                    value={settings.textColor}
                    onChange={(value) => onSettingsChange({ textColor: value })}
                />

                <div className="grid gap-2">
                    <FieldLabel
                        htmlFor="caption-font-family"
                        className="text-sm text-muted-foreground"
                    >
                        {t("captionFontFamily")}
                    </FieldLabel>
                    <NativeSelect
                        id="caption-font-family"
                        value={settings.fontFamily}
                        onChange={(event) =>
                            onSettingsChange({
                                fontFamily: event.target
                                    .value as CaptionWindowSettings["fontFamily"],
                            })
                        }
                        className="w-full"
                        size="sm"
                    >
                        {CAPTION_FONT_OPTIONS.map((option) => (
                            <NativeSelectOption key={option.value} value={option.value}>
                                {option.label}
                            </NativeSelectOption>
                        ))}
                    </NativeSelect>
                </div>

                <SettingRow label={t("captionFontSize")} value={`${settings.fontSize}px`}>
                    <Slider
                        min={limits.fontSize.min}
                        max={limits.fontSize.max}
                        step={1}
                        value={[settings.fontSize]}
                        onValueChange={([value]) =>
                            onSettingsChange({ fontSize: value ?? settings.fontSize })
                        }
                    />
                </SettingRow>

                <SettingRow label={t("captionLineHeight")} value={settings.lineHeight.toFixed(2)}>
                    <Slider
                        min={limits.lineHeight.min}
                        max={limits.lineHeight.max}
                        step={0.05}
                        value={[settings.lineHeight]}
                        onValueChange={([value]) =>
                            onSettingsChange({ lineHeight: value ?? settings.lineHeight })
                        }
                    />
                </SettingRow>

                <SettingRow label={t("captionMaxLines")} value={String(settings.maxLines)}>
                    <Slider
                        min={limits.maxLines.min}
                        max={limits.maxLines.max}
                        step={1}
                        value={[settings.maxLines]}
                        onValueChange={([value]) =>
                            onSettingsChange({ maxLines: value ?? settings.maxLines })
                        }
                    />
                </SettingRow>

                <div className="flex items-center justify-between gap-2 border-t pt-3">
                    <Button type="button" variant="ghost" size="xs" onClick={onReset}>
                        {t("captionReset")}
                    </Button>
                    <span
                        className="size-6 rounded-md border"
                        style={{ background: getCaptionBackground(settings) }}
                        aria-hidden="true"
                    />
                </div>
            </div>
        </div>
    );
}
