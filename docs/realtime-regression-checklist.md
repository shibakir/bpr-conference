# Realtime regression checklist

Run this checklist before releasing changes to the translation bridge. The unit
tests cover protocol decisions in isolation; these checks cover the real
LiveKit, Gemini and browser path.

## Baseline delivery

1. Start a session and enable one target language.
2. Confirm the listener receives translated audio and, when enabled, text.
3. Confirm a `translation_latency` log is emitted and has
   `inputSampleRate: 16000`.
4. Switch the listener to another language and back. The old bridge should be
   released once it has no subscribers.

## Gemini lifecycle

1. Start a bridge and confirm `Gemini setup complete` appears before audio is
   sent.
2. During an active session, trigger or wait for a Gemini `GoAway` event.
   Confirm the next setup contains the latest resumption handle and only one
   translated audio track remains published afterwards.
3. Temporarily block the Gemini connection. Confirm no unbounded output queue
   is created, then restore connectivity and verify the bridge reconnects.
4. Stop the broadcast while Gemini is connected. Confirm no reconnect is
   attempted after the explicit stop.

## LiveKit and audience lifecycle

1. Disconnect the organizer. Confirm every language bridge stops.
2. Join listeners in two languages. Confirm each transcription is delivered
   only to listeners whose `language` attribute matches its translation.
3. Enable input diagnostics. Confirm diagnostics are delivered only to the
   organizer.
4. Simulate a slow LiveKit consumer or CPU pressure. Confirm output backlog is
   capped and stale translated audio is dropped rather than played late.

## Translation delay controls and bounded queues (September 2026)

1. As owner, change the output queue limit (1/2/3/5 seconds) and input packet
   duration (50/100/200 ms). Reload: values must persist. Confirm GET/PATCH with
   a wrong owner key returns 403, invalid choices return 400 and an outdated
   settings version returns 409.
2. Change settings while two languages are active, and add a third language.
   Check each applied version. A partial failure must identify the affected
   language and permit retry; an edit must not restart Gemini.
3. Replay deterministic PCM while changing packet sizes. Concatenated packets
   must equal the input, including the retained tail. Check there is exactly one
   organizer reader. Its volume and age limits are 500 ms.
4. Block the WebSocket, native capture and caption data channel separately.
   Memory must remain bounded. A stalled audio capture closes after 2 seconds;
   a stalled caption publication closes after 5 seconds. Verify a listener can
   request a replacement bridge. Stop during setup/reconnect and confirm it
   cannot resurrect. Repeat with a late callback from a retired socket.
5. Feed voice without model output for over 30 seconds, then repeat with
   silence. Only sustained unanswered voice should trigger recovery. Fresh
   restarts are limited to one per minute and three per five minutes.
6. With a moderate output backlog, check a gradual 1.00–1.15 speed change and
   stable pitch. Overload must trim toward half the limit with a smoothed
   transition. Listen to real speech for clicks and intelligibility; a sine-wave
   frequency test alone is insufficient for release audio quality approval.
7. Repeat, delay and reorder caption snapshots, including final-before-interim,
   stream reset and eviction after 50 segments. Text must not duplicate or
   regress. Audio drops must not erase caption history. Slow delivery must
   coalesce snapshots; discarded segments/errors must be observable.
8. Verify immediate captions on the page, Document PiP, canvas/video PiP and
   inline fallback. Check two languages, font/line settings, mute, original
   audio and text-only/audio-only sessions. Test supported browsers manually,
   including Safari's video PiP implementation.
9. Check listener WebRTC measurements with real RTP: jitter-buffer delay uses
   deltas of emitted-sample counters; packet loss uses packet-counter deltas.
   Missing stats show unavailable, never zero. These are not speaker-to-listener
   translation latency. Owner publication timing is an estimate at the server.
10. Audio-synchronized captions remain unavailable with the current Gemini
    model: no verified text/audio sample mapping was observed. Do not enable the
    mode until real phrase correspondence and p95 ≤250 ms have been tested.
11. Run the reproducible backend benchmark for at least 30 minutes with two
    languages and the same PCM, using the shared transport-clock slowdown.
    Report median/p95/max backlog, skipped speech, acceleration, CPU and memory.
    Preserve the distinction between real Gemini and simulated LiveKit transport.
