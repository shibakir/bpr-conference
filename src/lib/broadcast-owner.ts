const BROADCAST_OWNER_KEY_PREFIX = "broadcast_owner:";
const BROADCAST_PRESENTER_CLIENT_PREFIX = "broadcast_presenter_client:";

function getSessionStorage() {
    try {
        return globalThis.sessionStorage;
    } catch {
        return null;
    }
}

function createClientId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }

    return `presenter-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

function getStorageValue(key: string) {
    return getSessionStorage()?.getItem(key) ?? "";
}

export function getBroadcastOwnerStorageKey(sessionId: string) {
    return `${BROADCAST_OWNER_KEY_PREFIX}${sessionId}`;
}

export function getStoredBroadcastOwnerKey(sessionId: string) {
    return getStorageValue(getBroadcastOwnerStorageKey(sessionId));
}

export function setStoredBroadcastOwnerKey(sessionId: string, organizerKey: string) {
    getSessionStorage()?.setItem(getBroadcastOwnerStorageKey(sessionId), organizerKey);
}

export function clearStoredBroadcastOwnerKey(sessionId: string) {
    getSessionStorage()?.removeItem(getBroadcastOwnerStorageKey(sessionId));
}

export function getOrCreateBroadcastPresenterClientId(sessionId: string) {
    const storage = getSessionStorage();
    if (!storage) return createClientId();

    const storageKey = `${BROADCAST_PRESENTER_CLIENT_PREFIX}${sessionId}`;
    const existing = storage.getItem(storageKey);
    if (existing) return existing;

    const clientId = createClientId();
    storage.setItem(storageKey, clientId);
    return clientId;
}
