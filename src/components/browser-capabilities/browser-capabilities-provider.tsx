"use client";

import { createContext, useContext, useSyncExternalStore } from "react";

export type BrowserName = "other" | "safari" | "unknown";

export type BrowserCapabilities = {
    browserName: BrowserName;
    canShareBrowserTabAudio: boolean;
    isSafariBrowser: boolean;
    tabAudioUnavailableReason: "safari" | null;
};

const DEFAULT_BROWSER_CAPABILITIES: BrowserCapabilities = {
    browserName: "unknown",
    canShareBrowserTabAudio: true,
    isSafariBrowser: false,
    tabAudioUnavailableReason: null,
};

const BrowserCapabilitiesContext = createContext<BrowserCapabilities | null>(null);

let cachedClientCapabilities: BrowserCapabilities | null = null;

function subscribeToBrowserCapabilities() {
    return () => {};
}

function isSafariUserAgent(userAgent: string, vendor: string) {
    return (
        vendor.includes("Apple") &&
        /Safari/i.test(userAgent) &&
        !/(Chrome|Chromium|CriOS|FxiOS|Edg|EdgiOS|OPR|OPiOS|Android)/i.test(userAgent)
    );
}

export function detectBrowserCapabilities(): BrowserCapabilities {
    if (typeof navigator === "undefined") {
        return DEFAULT_BROWSER_CAPABILITIES;
    }

    const isSafariBrowser = isSafariUserAgent(navigator.userAgent, navigator.vendor);

    if (isSafariBrowser) {
        return {
            browserName: "safari",
            canShareBrowserTabAudio: false,
            isSafariBrowser: true,
            tabAudioUnavailableReason: "safari",
        };
    }

    return {
        browserName: "other",
        canShareBrowserTabAudio: true,
        isSafariBrowser: false,
        tabAudioUnavailableReason: null,
    };
}

function getClientBrowserCapabilitiesSnapshot() {
    cachedClientCapabilities ??= detectBrowserCapabilities();
    return cachedClientCapabilities;
}

function getServerBrowserCapabilitiesSnapshot() {
    return DEFAULT_BROWSER_CAPABILITIES;
}

export function BrowserCapabilitiesProvider({ children }: { children: React.ReactNode }) {
    const capabilities = useSyncExternalStore(
        subscribeToBrowserCapabilities,
        getClientBrowserCapabilitiesSnapshot,
        getServerBrowserCapabilitiesSnapshot,
    );

    return (
        <BrowserCapabilitiesContext.Provider value={capabilities}>
            {children}
        </BrowserCapabilitiesContext.Provider>
    );
}

export function useBrowserCapabilities() {
    const context = useContext(BrowserCapabilitiesContext);

    if (!context) {
        throw new Error("useBrowserCapabilities must be used within BrowserCapabilitiesProvider");
    }

    return context;
}
