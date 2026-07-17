"use client";

import { QRCodeSVG } from "qrcode.react";

interface SessionQRCodeProps {
  url: string;
  size?: number;
}

export default function SessionQRCode({ url, size = 160 }: SessionQRCodeProps) {
  return (
    <div className="inline-flex rounded-lg border bg-[#F2F0EF] p-3 shadow-xs">
      <QRCodeSVG
        value={url}
        size={size}
        level="M"
        bgColor="#F2F0EF"
        fgColor="#0C0C0C"
      />
    </div>
  );
}
