"use client";

import { useLocale } from "next-intl";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { getPathname } from "@/i18n/navigation";
import { clientLogger } from "@/lib/client-logger";

import { copyTextToClipboard } from "../utils";

function subscribeToBrowserOrigin() {
    return () => {};
}

function getBrowserOrigin() {
    return window.location.origin;
}

function getServerOrigin() {
    return "";
}

export function useControlRecoveryUrl(sessionId: string, organizerKey: string) {
    const locale = useLocale();
    const [isCopied, setIsCopied] = useState(false);
    const copyResetTimeoutRef = useRef<number | null>(null);
    const origin = useSyncExternalStore(
        subscribeToBrowserOrigin,
        getBrowserOrigin,
        getServerOrigin,
    );

    const controlPath = getPathname({
        href: `/session/${sessionId}/broadcast`,
        locale,
    });
    const recoveryPath = `${controlPath}?organizerKey=${encodeURIComponent(organizerKey)}`;
    const recoveryUrl = origin ? `${origin}${recoveryPath}` : recoveryPath;

    useEffect(() => {
        return () => {
            if (copyResetTimeoutRef.current !== null) {
                window.clearTimeout(copyResetTimeoutRef.current);
            }
        };
    }, []);

    async function copyRecoveryUrl() {
        const urlToCopy = origin ? recoveryUrl : `${window.location.origin}${recoveryPath}`;

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
            clientLogger.error("Failed to copy control recovery link:", err);
        }
    }

    return {
        copyRecoveryUrl,
        isCopied,
        recoveryUrl,
    };
}
