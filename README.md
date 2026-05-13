# Live Translate

Real-time broadcast translation powered by the Gemini Live API and LiveKit.

An organizer speaks into their mic — attendees pick a language and hear a live AI translation. Each language spins up exactly one Gemini Live API session, shared across all listeners requesting that language.

## How it works

```
Organizer → publishes audio → LiveKit room
                                  ↓
              TranslationBridge (per language)
              joins room as bot, subscribes to organizer audio
                                  ↓
              Gemini Live API (streamingTranslationConfig)
              directionalTranslation → targetLanguageCode
                                  ↓
              Translated audio published back to LiveKit
                                  ↓
Attendee → subscribes to translator-{lang} audio track
```

## Prerequisites

- Node.js 18+
- A [Gemini API key](https://aistudio.google.com/apikey)
- A running LiveKit server (local or cloud)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Start a local LiveKit server

The easiest way is with Docker:

```bash
docker run -d \
  --name livekit \
  -p 7880:7880 \
  -p 7881:7881 \
  -p 7882:7882/udp \
  -e LIVEKIT_KEYS="devkey: secret" \
  livekit/livekit-server \
  --dev
```

Or install the LiveKit CLI and run locally:

```bash
# Install (macOS)
brew update && brew install livekit

# Run
livekit-server --dev --bind 0.0.0.0
```

The default dev keys are `devkey` / `secret`, matching `.env.local`.

### 3. Configure environment

Edit `.env.local`:

```env
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880
LIVEKIT_URL=ws://localhost:7880
GEMINI_API_KEY=your-gemini-api-key-here
```

### 4. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Usage

1. Click **Create session** — you'll be taken to the broadcast page
2. Allow microphone access and start speaking
3. Share the QR code (or URL) with attendees
4. Attendees open the link, pick a language from the dropdown
5. The server spins up a Gemini Live API translation bridge for that language
6. Subsequent attendees requesting the same language share the existing bridge

## Project structure

```
src/
├── app/
│   ├── api/
│   │   ├── sessions/          # Create/list/delete sessions
│   │   ├── token/             # LiveKit token generation
│   │   └── translate/         # Request translations, check status
│   ├── session/[id]/
│   │   ├── broadcast/         # Organizer view
│   │   └── watch/             # Attendee view + language selector
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx               # Landing page
├── components/
│   └── SessionQRCode.tsx
└── lib/
    ├── languages.ts                    # Supported languages
    ├── translation-bridge.ts           # LiveKit ↔ Gemini bridge
    └── translation-session-manager.ts  # Singleton: max 1 session/lang
```

## Key design decisions

- **Audio only** — no video, keeps things simple and bandwidth-light
- **`streamingTranslationConfig`** — uses Gemini's native directional translation, not prompt-based
- **`@livekit/rtc-node`** — server-side bot joins the room programmatically (not a browser)
- **Singleton per language** — `TranslationSessionManager` ensures at most one Gemini session per language per room
- **Attendee audio switching** — client uses `setSubscribed()` to subscribe only to the selected translator bot's audio track
- **Reliable transcription delivery** — transcriptions are sent via `publishData` (reliable data channel), not tied to audio track subscription state
- **Tab close cleanup** — `navigator.sendBeacon()` fires on `beforeunload` to decrement subscriber counts and tear down idle Gemini sessions
- **Serial audio frame queue** — `captureFrame` calls are chained via a promise chain to avoid frame pile-up in the AudioSource FFI layer

## Architecture & scaling

### Current design (demo)

All participants — organizer, translator bots, and attendees — share a **single LiveKit room**. Attendees use `setSubscribed()` to hear only their selected language.

```
                    ┌─────────────────────┐
                    │    LiveKit Room      │
                    │                     │
  Organizer ──────▶ │  translator-fr ─┐   │ ◀── Attendee (FR)
                    │  translator-de ─┤   │ ◀── Attendee (DE)
                    │  translator-zh ─┘   │ ◀── Attendee (ZH)
                    └─────────────────────┘
```

**This works well for:**
- Up to ~15-20 simultaneous languages
- Up to ~50 attendees on a dev server, or ~200-300 on LiveKit Cloud

**Limitations:**
- **Signaling fan-out is O(n)**: every participant join/leave notifies all others. With 1000 attendees, each join sends ~1000 signaling messages.
- **Track publication overhead**: each attendee receives metadata for all published tracks (even the ones they don't subscribe to).
- **Single Node.js process**: all Gemini WebSocket connections and audio pipelines run in one process.

### Recommended production architecture

For large-scale deployments (100+ attendees, 20+ languages), use a **3-tier design** with per-language delivery rooms:

```
Tier 1 — Ingestion            Tier 2 — Translation         Tier 3 — Delivery
┌──────────────┐             ┌──────────────────┐         ┌─────────────────┐
│  Main Room   │             │  Worker (FR)     │         │  Room: sess-fr  │
│              │  subscribe  │  Gemini Live API │ publish │                 │
│  Organizer ──┼────────────▶│  FR translation  ├────────▶│  67 attendees   │
│  (publishes  │             └──────────────────┘         └─────────────────┘
│   audio)     │             ┌──────────────────┐         ┌─────────────────┐
│              │  subscribe  │  Worker (DE)     │ publish │  Room: sess-de  │
│              ├────────────▶│  Gemini Live API ├────────▶│  67 attendees   │
│              │             └──────────────────┘         └─────────────────┘
│              │             ┌──────────────────┐         ┌─────────────────┐
│              │  subscribe  │  Worker (ZH)     │ publish │  Room: sess-zh  │
│              ├────────────▶│  Gemini Live API ├────────▶│  67 attendees   │
└──────────────┘             └──────────────────┘         └─────────────────┘
```

**Benefits:**
- **Isolated failure domains** — a worker crash only affects one language
- **Horizontal scaling** — workers are stateless, deploy via Kubernetes/Cloud Run
- **No signaling storm** — each delivery room has 1 publisher + N attendees (no N² problem)
- **Unlimited languages** — each language is a separate, independently scaled room
- **CDN-ready** — for 10K+ viewers, use LiveKit Egress → HLS → CDN on the delivery rooms

**Tradeoff:** switching languages requires a room reconnection (~200ms audio gap), vs. instant subscription toggle in the single-room design.
