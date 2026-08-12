"use client";

import { CaptionsIcon, PictureInPicture2Icon, Settings2Icon, XIcon } from "lucide-react";
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
import { Label } from "@/components/ui/label";
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

type CaptionMode = "document-pip" | "inline";

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

export type FloatingCaptionPanel = {
    emptyMessage: string;
    language: string;
    title: string;
    transcripts: TranscriptEntry[];
};

function hexToRgba(hex: string, alpha: number): string {
    const normalized = /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#ffffff";
    const value = Number.parseInt(normalized.slice(1), 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
    fill,
    limits,
    modeLabel,
    onClose,
    onReset,
    onSettingsChange,
    panels,
    settings,
    title,
}: {
    emptyMessage: string;
    fill?: boolean;
    limits: ReturnType<typeof useCaptionWindowPreference>["limits"];
    modeLabel: string;
    onClose?: () => void;
    onReset: () => void;
    onSettingsChange: (patch: Partial<CaptionWindowSettings>) => void;
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
                <span>{title}</span>
                <span style={actionGroupStyle}>
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
                <Label className="text-xs text-muted-foreground">{label}</Label>
                <span className="font-mono text-xs text-muted-foreground">{value}</span>
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
    const documentPipWindowRef = useRef<Window | null>(null);

    const emptyMessage =
        panels.length === 0 ? t("selectLanguageForTranscription") : t("waitingForSpeech");
    const title = t("floatingCaptions");

    useEffect(() => {
        documentPipWindowRef.current = documentPipWindow;
    }, [documentPipWindow]);

    useEffect(() => {
        onOpenChange?.(mode !== null);
    }, [mode, onOpenChange]);

    const closeFloatingWindow = useCallback(() => {
        const pipWindow = documentPipWindowRef.current;
        if (pipWindow && !pipWindow.closed) {
            pipWindow.close();
        }
        setDocumentPipWindow(null);
        setDocumentPipRoot(null);
        setMode(null);
    }, []);

    const openDocumentPip = useCallback(async () => {
        const docPip = (window as WindowWithDocumentPictureInPicture).documentPictureInPicture;
        if (!docPip?.requestWindow) return false;

        const pipWindow = await docPip.requestWindow({
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
    }, [title]);

    const openFloatingWindow = useCallback(async () => {
        try {
            if (await openDocumentPip()) return;
        } catch (error) {
            clientLogger.warn("[WatchCaptions] Document PiP failed:", error);
        }

        setMode("inline");
    }, [openDocumentPip]);

    const toggleFloatingWindow = useCallback(() => {
        if (mode) {
            void closeFloatingWindow();
            return;
        }
        void openFloatingWindow();
    }, [closeFloatingWindow, mode, openFloatingWindow]);

    useEffect(() => {
        return () => {
            const pipWindow = documentPipWindowRef.current;
            if (pipWindow && !pipWindow.closed) {
                pipWindow.close();
            }
        };
    }, []);

    const modeLabel =
        mode === "document-pip"
            ? t("captionAlwaysOnTop")
            : mode === "inline"
              ? t("captionInPageFallback")
              : t("captionReady");

    return (
        <div className="relative flex items-center gap-1">
            <Button
                type="button"
                variant={mode ? "secondary" : "outline"}
                size="xs"
                onClick={toggleFloatingWindow}
                title={mode ? t("closeFloatingCaptions") : t("openFloatingCaptions")}
                aria-label={mode ? t("closeFloatingCaptions") : t("openFloatingCaptions")}
            >
                {mode === "document-pip" ? (
                    <PictureInPicture2Icon className="size-3" />
                ) : (
                    <CaptionsIcon className="size-3" />
                )}
                <span className="hidden sm:inline">
                    {mode ? t("closeFloatingCaptions") : t("openFloatingCaptions")}
                </span>
            </Button>

            {mode === "inline" && (
                <div className="fixed right-4 bottom-4 left-4 z-50 overflow-visible">
                    <CaptionSurface
                        emptyMessage={emptyMessage}
                        limits={limits}
                        modeLabel={modeLabel}
                        onClose={() => void closeFloatingWindow()}
                        onReset={resetSettings}
                        onSettingsChange={updateSettings}
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
                        fill
                        limits={limits}
                        modeLabel={modeLabel}
                        onClose={() => void closeFloatingWindow()}
                        onReset={resetSettings}
                        onSettingsChange={updateSettings}
                        panels={panels}
                        settings={settings}
                        title={title}
                    />,
                    documentPipRoot,
                )}
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
                    <span className="text-sm font-medium">{t("captionSettings")}</span>
                    <span className="text-xs text-muted-foreground">{modeLabel}</span>
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
                    <Label htmlFor="caption-font-family" className="text-xs text-muted-foreground">
                        {t("captionFontFamily")}
                    </Label>
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
