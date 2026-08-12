"use client";

import "@livekit/components-styles";

import { LiveKitRoom } from "@livekit/components-react";
import { useTranslations } from "next-intl";
import { use, useCallback, useRef } from "react";

import { CenteredLoadingState } from "@/components/CenteredPage";
import { useRouter } from "@/i18n/navigation";

import { BroadcastControls } from "./components/BroadcastControls";
import { BroadcastErrorState } from "./components/BroadcastErrorState";
import { BroadcastPasswordGate } from "./components/BroadcastPasswordGate";
import { useBroadcastToken } from "./hooks/useBroadcastToken";

export default function BroadcastPage({
    params,
}: {
    params: Promise<{ locale: string; id: string }>;
}) {
    const t = useTranslations("Broadcast");
    const router = useRouter();
    const { id: sessionId } = use(params);
    const isEndingRef = useRef(false);
    const broadcastToken = useBroadcastToken(sessionId);

    const handleEndBroadcast = useCallback(() => {
        isEndingRef.current = true;
    }, []);

    const handleSessionExpired = useCallback(() => {
        isEndingRef.current = true;
        broadcastToken.markExpired();
    }, [broadcastToken]);

    if (broadcastToken.passwordPromptRequired) {
        return (
            <BroadcastPasswordGate
                localPassword={broadcastToken.localPassword}
                passwordError={broadcastToken.passwordError}
                verifying={broadcastToken.verifying}
                onCancel={() => router.push("/")}
                onPasswordChange={broadcastToken.setLocalPassword}
                onSubmit={broadcastToken.handlePasswordSubmit}
            />
        );
    }

    if (broadcastToken.error) {
        return (
            <BroadcastErrorState error={broadcastToken.error} onGoHome={() => router.push("/")} />
        );
    }

    if (!broadcastToken.token || !broadcastToken.livekitUrl) {
        return <CenteredLoadingState />;
    }

    return (
        <main className="min-h-svh px-4 py-10 sm:px-6">
            <LiveKitRoom
                video={false}
                audio={false}
                token={broadcastToken.token}
                serverUrl={broadcastToken.livekitUrl}
                options={{ disconnectOnPageLeave: false }}
                className="flex w-full flex-col items-center"
                onDisconnected={() => {
                    if (!isEndingRef.current) {
                        broadcastToken.setError(t("disconnectError"));
                    }
                }}
            >
                <BroadcastControls
                    sessionId={sessionId}
                    expiresAt={broadcastToken.expiresAt}
                    onEndBroadcast={handleEndBroadcast}
                    onSessionExpired={handleSessionExpired}
                />
            </LiveKitRoom>
        </main>
    );
}
