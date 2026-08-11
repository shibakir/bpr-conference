"use client";

import {
  CSSProperties,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  CaptionsIcon,
  PictureInPicture2Icon,
  Settings2Icon,
  XIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  getCaptionBackground,
  useCaptionWindowPreference,
  type CaptionWindowSettings,
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

type CaptionParagraph = {
  id: string;
  text: string;
  final: boolean;
};

const CAPTION_FONT_FAMILY =
  '"Geist", "Geist Fallback", ui-sans-serif, system-ui, sans-serif';

function hexToRgba(hex: string, alpha: number): string {
  const normalized = /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#ffffff";
  const value = Number.parseInt(normalized.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function wrapCanvasLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
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
      if (wordChunk) lines.push(wordChunk);
      wordChunk = char;
    }
    currentLine = wordChunk;
  }

  if (currentLine) lines.push(currentLine);
  return lines;
}

function drawCaptionsOnCanvas({
  canvas,
  emptyMessage,
  paragraphs,
  settings,
}: {
  canvas: HTMLCanvasElement | null;
  emptyMessage: string;
  paragraphs: CaptionParagraph[];
  settings: CaptionWindowSettings;
}) {
  if (!canvas) return;

  if (canvas.width !== settings.width) {
    canvas.width = settings.width;
  }
  if (canvas.height !== settings.height) {
    canvas.height = settings.height;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const padding = Math.max(18, Math.round(settings.fontSize * 0.75));
  const lineHeightPx = settings.fontSize * settings.lineHeight;
  const maxTextWidth = Math.max(1, settings.width - padding * 2);
  const maxTextHeight = Math.max(lineHeightPx, settings.height - padding * 2);
  const maxVisibleLines = Math.max(
    1,
    Math.min(settings.maxLines, Math.floor(maxTextHeight / lineHeightPx))
  );

  ctx.clearRect(0, 0, settings.width, settings.height);
  ctx.fillStyle = getCaptionBackground(settings);
  ctx.fillRect(0, 0, settings.width, settings.height);
  ctx.font = `600 ${settings.fontSize}px ${CAPTION_FONT_FAMILY}`;
  ctx.textBaseline = "top";

  const sourceLines =
    paragraphs.length > 0
      ? paragraphs.flatMap((paragraph) =>
          wrapCanvasLine(ctx, paragraph.text, maxTextWidth)
        )
      : wrapCanvasLine(ctx, emptyMessage, maxTextWidth);
  const visibleLines = sourceLines.slice(-maxVisibleLines);

  ctx.fillStyle =
    paragraphs.length > 0 ? settings.textColor : hexToRgba(settings.textColor, 0.65);
  ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
  ctx.shadowBlur = Math.max(4, Math.round(settings.fontSize / 4));

  const firstLineY = Math.max(
    padding,
    settings.height - padding - visibleLines.length * lineHeightPx
  );

  visibleLines.forEach((line, index) => {
    ctx.fillText(line, padding, firstLineY + index * lineHeightPx);
  });
}

function requestCanvasFrame(stream: MediaStream | null) {
  const [track] = stream?.getVideoTracks() ?? [];
  if (!track) return;

  (track as CanvasCaptureMediaStreamTrack).requestFrame?.();
}

function prepareDocumentPipWindow(
  pipWindow: Window,
  title: string
): HTMLElement {
  const pipDocument = pipWindow.document;
  pipDocument.title = title;
  pipDocument.head.innerHTML = "";
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

function CaptionSurface({
  emptyMessage,
  fill,
  onClose,
  paragraphs,
  settings,
  title,
}: {
  emptyMessage: string;
  fill?: boolean;
  onClose?: () => void;
  paragraphs: CaptionParagraph[];
  settings: CaptionWindowSettings;
  title: string;
}) {
  const lineHeightPx = settings.fontSize * settings.lineHeight;
  const textWrapRef = useRef<HTMLDivElement | null>(null);
  const maxCaptionHeight = Math.max(
    lineHeightPx,
    Math.min(settings.maxLines * lineHeightPx, settings.height - 72)
  );

  useEffect(() => {
    const node = textWrapRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [
    emptyMessage,
    paragraphs,
    settings.fontSize,
    settings.height,
    settings.lineHeight,
    settings.maxLines,
  ]);

  const surfaceStyle: CSSProperties = {
    width: fill ? "100vw" : settings.width,
    height: fill ? "100vh" : settings.height,
    background: getCaptionBackground(settings),
    color: settings.textColor,
    display: "flex",
    flexDirection: "column",
    fontFamily: CAPTION_FONT_FAMILY,
    overflow: "hidden",
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
  const textWrapStyle: CSSProperties = {
    display: "block",
    maxHeight: maxCaptionHeight,
    overflowX: "hidden",
    overflowY: "hidden",
    scrollBehavior: "auto",
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

  return (
    <div style={surfaceStyle}>
      <div style={headerStyle}>
        <span>{title}</span>
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
      </div>
      <div style={bodyStyle}>
        <div ref={textWrapRef} style={textWrapStyle}>
          {paragraphs.length === 0 ? (
            <p style={emptyStyle}>{emptyMessage}</p>
          ) : (
            paragraphs.slice(-settings.maxLines).map((paragraph) => (
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
  currentLanguage,
  transcripts,
}: {
  currentLanguage: string;
  transcripts: TranscriptEntry[];
}) {
  const t = useTranslations("Watch");
  const {
    limits,
    resetSettings,
    settings,
    updateBackground,
    updateSettings,
  } = useCaptionWindowPreference();
  const [mode, setMode] = useState<CaptionMode | null>(null);
  const [documentPipRoot, setDocumentPipRoot] = useState<HTMLElement | null>(
    null
  );
  const [documentPipWindow, setDocumentPipWindow] = useState<Window | null>(
    null
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const documentPipWindowRef = useRef<Window | null>(null);

  const emptyMessage =
    currentLanguage === "original"
      ? t("selectLanguageForTranscription")
      : t("waitingForSpeech");
  const title = t("floatingCaptions");
  const paragraphs = useMemo(
    () => getTranscriptParagraphs(transcripts, 1).slice(-settings.maxLines),
    [settings.maxLines, transcripts]
  );

  useEffect(() => {
    documentPipWindowRef.current = documentPipWindow;
  }, [documentPipWindow]);

  const cleanupVideoStream = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
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

    const video = videoRef.current;
    if (
      video &&
      document.pictureInPictureElement === video &&
      typeof document.exitPictureInPicture === "function"
    ) {
      try {
        await document.exitPictureInPicture();
      } catch {
        // The browser may already have closed the PiP window.
      }
    }

    cleanupVideoStream();
    setMode(null);
  }, [cleanupVideoStream]);

  const openDocumentPip = useCallback(async () => {
    const docPip = (window as WindowWithDocumentPictureInPicture)
      .documentPictureInPicture;
    if (!docPip?.requestWindow) return false;

    const pipWindow = await docPip.requestWindow({
      width: settings.width,
      height: settings.height,
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
  }, [settings.height, settings.width, title]);

  const openVideoPip = useCallback(async () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (
      !canvas ||
      !video ||
      typeof canvas.captureStream !== "function" ||
      typeof video.requestPictureInPicture !== "function" ||
      !document.pictureInPictureEnabled
    ) {
      return false;
    }

    drawCaptionsOnCanvas({
      canvas,
      emptyMessage,
      paragraphs,
      settings,
    });

    cleanupVideoStream();
    const stream = canvas.captureStream(10);
    mediaStreamRef.current = stream;
    requestCanvasFrame(stream);
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;

    await video.play();
    await video.requestPictureInPicture();
    setMode("video-pip");
    return true;
  }, [cleanupVideoStream, emptyMessage, paragraphs, settings]);

  const openFloatingWindow = useCallback(async () => {
    try {
      if (await openDocumentPip()) return;
    } catch (error) {
      console.warn("[WatchCaptions] Document PiP failed:", error);
    }

    try {
      if (await openVideoPip()) return;
    } catch (error) {
      console.warn("[WatchCaptions] Video PiP failed:", error);
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

  useEffect(() => {
    if (mode !== "video-pip") return;
    drawCaptionsOnCanvas({
      canvas: canvasRef.current,
      emptyMessage,
      paragraphs,
      settings,
    });
    requestCanvasFrame(mediaStreamRef.current);
  }, [emptyMessage, mode, paragraphs, settings]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLeave = () => {
      cleanupVideoStream();
      setMode((current) => (current === "video-pip" ? null : current));
    };

    video.addEventListener("leavepictureinpicture", handleLeave);
    return () => {
      video.removeEventListener("leavepictureinpicture", handleLeave);
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
        size="xs"
        onClick={toggleFloatingWindow}
        title={mode ? t("closeFloatingCaptions") : t("openFloatingCaptions")}
        aria-label={
          mode ? t("closeFloatingCaptions") : t("openFloatingCaptions")
        }
      >
        {mode === "document-pip" || mode === "video-pip" ? (
          <PictureInPicture2Icon className="size-3" />
        ) : (
          <CaptionsIcon className="size-3" />
        )}
        <span className="hidden sm:inline">
          {mode ? t("closeFloatingCaptions") : t("openFloatingCaptions")}
        </span>
      </Button>

      <Button
        type="button"
        variant={settingsOpen ? "secondary" : "outline"}
        size="icon-xs"
        onClick={() => setSettingsOpen((open) => !open)}
        title={t("captionSettings")}
        aria-label={t("captionSettings")}
      >
        <Settings2Icon className="size-3" />
      </Button>

      {settingsOpen && (
        <CaptionSettingsPanel
          limits={limits}
          modeLabel={modeLabel}
          onBackgroundChange={updateBackground}
          onClose={() => setSettingsOpen(false)}
          onReset={resetSettings}
          onSettingsChange={updateSettings}
          settings={settings}
        />
      )}

      {mode === "inline" && (
        <div className="fixed right-4 bottom-4 z-50 max-w-[calc(100vw-2rem)] overflow-hidden">
          <CaptionSurface
            emptyMessage={emptyMessage}
            onClose={() => void closeFloatingWindow()}
            paragraphs={paragraphs}
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
            onClose={() => void closeFloatingWindow()}
            paragraphs={paragraphs}
            settings={settings}
            title={title}
          />,
          documentPipRoot
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
  onBackgroundChange,
  onClose,
  onReset,
  onSettingsChange,
  settings,
}: {
  limits: ReturnType<typeof useCaptionWindowPreference>["limits"];
  modeLabel: string;
  onBackgroundChange: (
    channel: keyof CaptionWindowSettings["background"],
    value: number
  ) => void;
  onClose: () => void;
  onReset: () => void;
  onSettingsChange: (patch: Partial<CaptionWindowSettings>) => void;
  settings: CaptionWindowSettings;
}) {
  const t = useTranslations("Watch");

  return (
    <div className="absolute top-8 right-0 z-50 w-[min(88vw,22rem)] rounded-lg border bg-popover p-3 text-popover-foreground shadow-xl">
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
        <div className="grid gap-2">
          <Label className="text-xs text-muted-foreground">
            {t("captionBackgroundRgb")}
          </Label>
          <div className="grid grid-cols-3 gap-2">
            {(["r", "g", "b"] as const).map((channel) => (
              <Input
                key={channel}
                type="number"
                min={limits.color.min}
                max={limits.color.max}
                value={settings.background[channel]}
                onChange={(event) =>
                  onBackgroundChange(channel, Number(event.target.value))
                }
                aria-label={`${t("captionBackgroundRgb")} ${channel.toUpperCase()}`}
                className="h-7"
              />
            ))}
          </div>
        </div>

        <SettingRow
          label={t("captionOpacity")}
          value={`${settings.backgroundOpacity}%`}
        >
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

        <div className="grid gap-2">
          <Label htmlFor="caption-text-color" className="text-xs text-muted-foreground">
            {t("captionTextColor")}
          </Label>
          <Input
            id="caption-text-color"
            type="color"
            value={settings.textColor}
            onChange={(event) =>
              onSettingsChange({ textColor: event.target.value })
            }
            className="h-8 p-1"
          />
        </div>

        <SettingRow
          label={t("captionFontSize")}
          value={`${settings.fontSize}px`}
        >
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

        <SettingRow
          label={t("captionLineHeight")}
          value={settings.lineHeight.toFixed(2)}
        >
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

        <SettingRow
          label={t("captionMaxLines")}
          value={String(settings.maxLines)}
        >
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

        <SettingRow label={t("captionWidth")} value={`${settings.width}px`}>
          <Slider
            min={limits.width.min}
            max={limits.width.max}
            step={20}
            value={[settings.width]}
            onValueChange={([value]) =>
              onSettingsChange({ width: value ?? settings.width })
            }
          />
        </SettingRow>

        <SettingRow label={t("captionHeight")} value={`${settings.height}px`}>
          <Slider
            min={limits.height.min}
            max={limits.height.max}
            step={20}
            value={[settings.height]}
            onValueChange={([value]) =>
              onSettingsChange({ height: value ?? settings.height })
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
