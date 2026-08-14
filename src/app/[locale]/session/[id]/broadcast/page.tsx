"use client";

import "@livekit/components-styles";

import { LiveKitRoom } from "@livekit/components-react";
import { DisconnectReason } from "livekit-client";
import { useTranslations } from "next-intl";
import { use, useCallback, useRef } from "react";

import { CenteredLoadingState, CenteredPage } from "@/components/CenteredPage";
import { useRouter } from "@/i18n/navigation";

import { BroadcastControls } from "./components/BroadcastControls";
import { BroadcastErrorState } from "./components/BroadcastErrorState";
import { BroadcastPresenterGate } from "./components/BroadcastPresenterGate";
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

    if (
        broadcastToken.accessState === "active_elsewhere" ||
        broadcastToken.accessState === "missing_key"
    ) {
        return (
            <BroadcastPresenterGate
                canTakeOver={broadcastToken.canTakeOver}
                state={broadcastToken.accessState}
                verifying={broadcastToken.verifying}
                onGoHome={() => router.push("/")}
                onOpenListenerPage={() => router.push(`/session/${sessionId}/watch`)}
                onTakeOver={broadcastToken.takeOver}
            />
        );
    }

    if (broadcastToken.error) {
        return (
            <BroadcastErrorState error={broadcastToken.error} onGoHome={() => router.push("/")} />
        );
    }

    if (
        broadcastToken.accessState !== "ready" ||
        !broadcastToken.token ||
        !broadcastToken.livekitUrl
    ) {
        return <CenteredLoadingState />;
    }

    return (
        <CenteredPage className="sm:px-6">
            <LiveKitRoom
                video={false}
                audio={false}
                token={broadcastToken.token}
                serverUrl={broadcastToken.livekitUrl}
                options={{ disconnectOnPageLeave: false }}
                className="flex w-full flex-col items-center"
                onDisconnected={(reason) => {
                    if (!isEndingRef.current) {
                        broadcastToken.setError(
                            reason === DisconnectReason.DUPLICATE_IDENTITY
                                ? t("duplicatePresenterDisconnected")
                                : t("disconnectError"),
                        );
                    }
                }}
            >
                <BroadcastControls
                    organizerKey={broadcastToken.organizerKey}
                    sessionId={sessionId}
                    expiresAt={broadcastToken.expiresAt}
                    onEndBroadcast={handleEndBroadcast}
                    onSessionExpired={handleSessionExpired}
                />
            </LiveKitRoom>
        </CenteredPage>
    );
}
