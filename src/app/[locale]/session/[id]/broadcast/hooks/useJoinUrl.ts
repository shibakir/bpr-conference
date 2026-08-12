"use client";

import { useLocale } from "next-intl";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { getPathname } from "@/i18n/navigation";

import { copyTextToClipboard, getClientOrigin, getServerOrigin, subscribeToOrigin } from "../utils";

export function useJoinUrl(sessionId: string) {
    const locale = useLocale();
    const [isCopied, setIsCopied] = useState(false);
    const copyResetTimeoutRef = useRef<number | null>(null);
    const origin = useSyncExternalStore(subscribeToOrigin, getClientOrigin, getServerOrigin);

    const joinPath = getPathname({
        href: `/session/${sessionId}/watch`,
        locale,
    });
    const joinUrl = origin ? `${origin}${joinPath}` : joinPath;

    useEffect(() => {
        return () => {
            if (copyResetTimeoutRef.current !== null) {
                window.clearTimeout(copyResetTimeoutRef.current);
            }
        };
    }, []);

    async function copyJoinUrl() {
        const urlToCopy = origin ? joinUrl : `${window.location.origin}${joinPath}`;

        try {
            await copyTextToClipboard(urlToCopy);
            setIsCopied(true);

            if (copyResetTimeoutRef.current !== null) {
                window.clearTimeout(copyResetTimeoutRef.current);
            }

            copyResetTimeoutRef.current = window.setTimeout(() => {
                setIsCopied(false);
                copyResetTimeoutRef.current = null;
            }, 2000);
        } catch (err) {
            console.error("Failed to copy attendee link:", err);
        }
    }

    return {
        isCopied,
        joinPath,
        joinUrl,
        copyJoinUrl,
    };
}
