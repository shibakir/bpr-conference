"use client";

import { use, useState } from "react";
import { LiveKitRoom, RoomAudioRenderer } from "@livekit/components-react";
import "@livekit/components-styles";
import { useWatchToken } from "./hooks/useWatchToken";
import { AttendeeView } from "./components/AttendeeView";
import { WatchErrorState } from "./components/WatchErrorState";
import { WatchLoadingState } from "./components/WatchLoadingState";
import { WatchStartGate } from "./components/WatchStartGate";

export default function WatchPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { id: sessionId } = use(params);
  const [started, setStarted] = useState(false);
  const { error, expiresAt, livekitUrl, markExpired, token } =
    useWatchToken(sessionId);

  if (error) {
    return <WatchErrorState error={error} />;
  }

  if (!token || !livekitUrl) {
    return <WatchLoadingState />;
  }

  if (!started) {
    return (
      <WatchStartGate
        sessionId={sessionId}
        expiresAt={expiresAt}
        onStart={() => setStarted(true)}
        onSessionExpired={markExpired}
      />
    );
  }

  return (
    <main className="min-h-svh px-4 py-10 sm:px-6">
      <LiveKitRoom
        video={false}
        audio={false}
        token={token}
        serverUrl={livekitUrl}
        connectOptions={{ autoSubscribe: false }}
        options={{ disconnectOnPageLeave: false }}
        className="flex w-full flex-col items-center"
      >
        <RoomAudioRenderer />
        <AttendeeView
          sessionId={sessionId}
          expiresAt={expiresAt}
          onSessionExpired={markExpired}
        />
      </LiveKitRoom>
    </main>
  );
}
