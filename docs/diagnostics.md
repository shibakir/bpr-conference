# Troubleshooting & API Diagnostics

If your session creation or connection gets stuck (e.g. infinite spinner or errors), follow this guide to inspect and verify that all API routes and credentials are functioning correctly.

---

## 1. Browser-based Diagnostics (Recommended)

The easiest way to see exactly what is failing is to use your browser's Developer Tools.

1. Open your web browser and navigate to your deployed Cloud Run URL.
2. Open **Developer Tools** (Press `F12` or `Cmd + Option + I` on macOS).
3. Switch to the **Network** tab and select **Fetch/XHR** to filter out static assets.
4. Click **Create session** on the home page.
5. You should see two critical API requests occur:

### Request 1: `POST /api/sessions`
- **Purpose**: Creates the session ID in the in-memory manager.
- **Status**: Should be `200 OK`.
- **Payload**: Should return a JSON body like:
  ```json
  {
    "sessionId": "c62f85dd",
    "organizerIdentity": "organizer-host",
    "organizerKey": "...",
    "joinUrl": "https://...",
    "broadcastUrl": "https://..."
  }
  ```

### Request 2: `POST /api/sessions/<SESSION_ID>/presenter`
- **Purpose**: Claims or refreshes the active presenter lease for this browser.
- **Status**: Should be `200 OK`.
- **Payload**: Should return a JSON body like:
  ```json
  {
    "active": true,
    "leaseExpiresAt": "2026-08-14T10:00:00.000Z"
  }
  ```

### Request 3: `POST /api/token`
- **Purpose**: Generates the LiveKit JWT token after presenter lease validation.
- **Status**: Should be `200 OK`.
- **Payload**: Should return a JSON body containing your JWT token:
  ```json
  {
    "token": "eyJhbGciOi..."
  }
  ```

> **Common browser failures**:
> - If either request returns a **500 Internal Server Error**, check the response body in the DevTools "Response" tab. It will often contain a helpful error message (e.g. `"LiveKit credentials not configured"`).
> - If a request is blocked or shows a **CORS error**, check if the request was intercepted or redirected (e.g. by IAP session expiration).

---

## 2. Local CLI Diagnostics

If you want to verify that the Next.js API logic works independently of Cloud Run, you can run the server locally.

1. Ensure your local `.env.local` contains all credentials:
   ```env
   GEMINI_API_KEY=your-gemini-key
   LIVEKIT_API_KEY=your-livekit-key
   LIVEKIT_API_SECRET=your-livekit-secret
   LIVEKIT_URL=wss://your-livekit.cloud
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Open a new terminal and test the routes directly using `curl`:

   **Test 1: Create Session**
   ```bash
   curl -X POST http://localhost:3000/api/sessions \
     -H "Content-Type: application/json" \
     -d '{"organizerName":"host"}'
   ```
   *Expected output: A JSON object containing a 8-character `sessionId`.*

   **Test 2: Claim Presenter Lease**
   *(Replace `<SESSION_ID>` and `<ORGANIZER_KEY>` with the values returned by Test 1)*
   ```bash
   curl -X POST "http://localhost:3000/api/sessions/<SESSION_ID>/presenter" \
     -H "Content-Type: application/json" \
     -d '{"clientId":"diagnostic-client","organizerKey":"<ORGANIZER_KEY>"}'
   ```
   *Expected output: A JSON object containing `active: true` and `leaseExpiresAt`.*

   **Test 3: Generate Token**
   ```bash
   curl -X POST "http://localhost:3000/api/token" \
     -H "Content-Type: application/json" \
     -d '{"room":"<SESSION_ID>","identity":"organizer-host","role":"organizer","presenterClientId":"diagnostic-client","organizerKey":"<ORGANIZER_KEY>"}'
   ```
   *Expected output: A JSON object containing the `token` JWT string.*

---

## 3. Translation latency metrics

Each active translation bridge emits a structured `translation_latency` log every five seconds while it processes audio. The log contains no audio or transcript content.

- `inputSampleRate` must be `16000`.
- `geminiFirstAudioAfterIdleMs` is the time from the first audio frame after a translated-audio pause to the first audio packet returned by Gemini. It includes Gemini processing and the network path to Gemini.
- `geminiToLiveKitPublishMs` is the time from receipt of an audio packet from Gemini until it has been accepted by the local LiveKit `AudioSource`; it exposes bridge and output-queue delay.
- `outputBacklogMs` is queued audio that would make listeners fall behind live speech. A sustained value above 500 ms needs investigation.

These timestamps are measured inside the server bridge. They do not include the final LiveKit-to-listener network and browser playback delay.

## 4. Verifying Cloud Run Credentials & Settings

If the local tests pass but the Cloud Run tests fail, verify the Cloud Run configuration using `gcloud`:

### Check environment mapping
Verify that the environment variables and Secret Manager mappings are correctly assigned:
```bash
gcloud run services describe live-translate \
  --region us-central1 \
  --format="json(spec.template.spec.containers[0].env)"
```

### Verify secrets are accessible
Cloud Run uses its default Compute Engine service account to access Secret Manager. Make sure it has the **Secret Manager Secret Accessor** role (`roles/secretmanager.secretAccessor`) on each secret:
```bash
# Get your project number
PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format="value(projectNumber)")

# Grant secret accessor permission to the default Cloud Run service account
gcloud secrets add-iam-policy-binding gemini-api-key \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding livekit-api-key \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding livekit-api-secret \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```
