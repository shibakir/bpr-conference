import { normalizeOrigin } from "./public-origin";

const DEFAULT_BACKEND_API_ORIGIN = "http://127.0.0.1:3001";

export function getBackendApiOrigin() {
    const origin = normalizeOrigin(process.env["BACKEND_API_ORIGIN"]) || DEFAULT_BACKEND_API_ORIGIN;

    try {
        const url = new URL(origin);
        if (!["http:", "https:"].includes(url.protocol)) {
            throw new Error("Unsupported protocol");
        }

        return origin;
    } catch {
        throw new Error("BACKEND_API_ORIGIN must be a valid HTTP(S) URL");
    }
}
