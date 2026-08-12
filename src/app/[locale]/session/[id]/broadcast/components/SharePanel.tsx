"use client";

import {
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  QrCodeIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import SessionQRCode from "@/components/SessionQRCode";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function SharePanel({
  isJoinUrlCopied,
  joinPath,
  joinUrl,
  onCopyJoinUrl,
}: {
  isJoinUrlCopied: boolean;
  joinPath: string;
  joinUrl: string;
  onCopyJoinUrl: () => void;
}) {
  const t = useTranslations("Broadcast");

  return (
    <section className="flex flex-col items-center gap-4 text-center">
      <Badge variant="outline" className="gap-1">
        <QrCodeIcon className="size-3" />
        {t("shareWithAttendees")}
      </Badge>
      <SessionQRCode url={joinUrl || joinPath} size={140} />
      <div className="grid w-full max-w-sm gap-2 sm:grid-cols-2">
        <Button type="button" variant="outline" onClick={onCopyJoinUrl}>
          {isJoinUrlCopied ? (
            <CheckIcon className="text-success" />
          ) : (
            <CopyIcon />
          )}
          {isJoinUrlCopied ? t("linkCopied") : t("copyLink")}
        </Button>
        <Button asChild variant="outline">
          <a href={joinUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLinkIcon />
            {t("openInNewTab")}
          </a>
        </Button>
      </div>
    </section>
  );
}
