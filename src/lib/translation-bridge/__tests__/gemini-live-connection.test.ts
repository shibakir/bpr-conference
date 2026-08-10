import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import {
  GeminiLiveConnection,
  type GeminiLiveConnectionOptions,
} from "../gemini-live-connection";

class FakeWebSocket extends EventEmitter {
  readyState = WebSocket.CONNECTING;
  readonly sent: string[] = [];
  readonly close = vi.fn(() => {
    this.readyState = WebSocket.CLOSED;
    this.emit("close", 1000, Buffer.alloc(0));
  });

  send(payload: string): void {
    this.sent.push(payload);
  }

  open(): void {
    this.readyState = WebSocket.OPEN;
    this.emit("open");
  }

  receive(message: object): void {
    this.emit("message", Buffer.from(JSON.stringify(message)));
  }
}

function createConnection(
  sockets: FakeWebSocket[],
  options: Partial<GeminiLiveConnectionOptions> = {}
) {
  let nextSocket = 0;
  const onMessage = vi.fn();
  const connection = new GeminiLiveConnection({
    apiKey: "test-key",
    model: "gemini-test-model",
    targetLanguage: "cs",
    enableTranscription: true,
    enableInputDiagnostics: true,
    contextCompressionTriggerTokens: 25_000,
    contextCompressionTargetTokens: 8_000,
    shouldReconnect: () => true,
    onMessage,
    webSocketFactory: () =>
      sockets[nextSocket++] as unknown as WebSocket,
    ...options,
  });

  return { connection, onMessage };
}

describe("GeminiLiveConnection", () => {
  it("waits for setupComplete before allowing audio and sends the expected setup", async () => {
    const socket = new FakeWebSocket();
    const { connection } = createConnection([socket]);

    const connecting = connection.connect();
    socket.open();

    const setupPayload = JSON.parse(socket.sent[0]);
    expect(setupPayload.setup.model).toBe("models/gemini-test-model");
    expect(setupPayload.setup.outputAudioTranscription).toEqual({});
    expect(setupPayload.setup.inputAudioTranscription).toEqual({});
    expect(connection.sendAudio("AQI=", 16_000)).toBe(false);

    socket.receive({ setupComplete: {} });
    await connecting;

    expect(connection.isReady).toBe(true);
    expect(connection.sendAudio("AQI=", 16_000)).toBe(true);
    expect(JSON.parse(socket.sent[1])).toEqual({
      realtimeInput: {
        audio: {
          mimeType: "audio/pcm;rate=16000",
          data: "AQI=",
        },
      },
    });
  });

  it("resumes a session after GoAway and retires the old socket", async () => {
    const firstSocket = new FakeWebSocket();
    const secondSocket = new FakeWebSocket();
    const { connection } = createConnection([firstSocket, secondSocket]);

    const connecting = connection.connect();
    firstSocket.open();
    firstSocket.receive({ setupComplete: {} });
    await connecting;

    firstSocket.receive({
      sessionResumptionUpdate: { resumable: true, newHandle: "resume-1" },
    });
    firstSocket.receive({ goAway: { timeLeft: "10s" } });

    secondSocket.open();
    expect(JSON.parse(secondSocket.sent[0]).setup.sessionResumption).toEqual({
      handle: "resume-1",
    });
    secondSocket.receive({ setupComplete: {} });

    expect(connection.isReady).toBe(true);
    expect(firstSocket.close).toHaveBeenCalledOnce();
  });

  it("does not reconnect after an explicit stop", async () => {
    const socket = new FakeWebSocket();
    const { connection } = createConnection([socket]);

    const connecting = connection.connect();
    socket.open();
    socket.receive({ setupComplete: {} });
    await connecting;

    connection.stop();

    expect(socket.close).toHaveBeenCalledOnce();
    expect(connection.isReady).toBe(false);
  });
});
