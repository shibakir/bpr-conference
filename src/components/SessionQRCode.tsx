"use client";

import { QRCodeSVG } from "qrcode.react";

interface SessionQRCodeProps {
  url: string;
  size?: number;
}

export default function SessionQRCode({ url, size = 160 }: SessionQRCodeProps) {
  return (
    <div className="inline-flex rounded-lg border bg-white p-3 shadow-xs">
      <QRCodeSVG
        value={url}
        size={size}
        level="M"
        bgColor="#ffffff"
        fgColor="#1A1917"
      />
    </div>
  );
}
