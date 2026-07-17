"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ClockIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatRemainingSessionTime } from "@/lib/session-duration";
import { cn } from "@/lib/utils";

interface SessionCountdownProps {
  expiresAt?: string | null;
  timeRemainingLabel: string;
  endedLabel: string;
  className?: string;
  onExpire?: () => void;
}

export default function SessionCountdown({
  expiresAt,
  timeRemainingLabel,
  endedLabel,
  className,
  onExpire,
}: SessionCountdownProps) {
  const expiresAtMs = useMemo(
    () => (expiresAt ? Date.parse(expiresAt) : Number.NaN),
    [expiresAt]
  );
  const [now, setNow] = useState(() => Date.now());
  const expireNotifiedRef = useRef(false);

  useEffect(() => {
    expireNotifiedRef.current = false;
  }, [expiresAtMs]);

  useEffect(() => {
    if (!Number.isFinite(expiresAtMs)) return;

    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [expiresAtMs]);

  const hasValidExpiry = Number.isFinite(expiresAtMs);
  const remainingMs = hasValidExpiry ? Math.max(0, expiresAtMs - now) : 0;
  const hasEnded = hasValidExpiry && remainingMs <= 0;

  useEffect(() => {
    if (!hasEnded || expireNotifiedRef.current) return;

    expireNotifiedRef.current = true;
    onExpire?.();
  }, [hasEnded, onExpire]);

  if (!hasValidExpiry) return null;

  return (
    <Badge
      variant={hasEnded ? "destructive" : "outline"}
      className={cn("gap-1 tabular-nums", className)}
    >
      <ClockIcon className="size-3" />
      <span className="font-sans">
        {hasEnded ? endedLabel : timeRemainingLabel}
      </span>
      {!hasEnded && (
        <span className="font-mono">
          {formatRemainingSessionTime(remainingMs)}
        </span>
      )}
    </Badge>
  );
}
