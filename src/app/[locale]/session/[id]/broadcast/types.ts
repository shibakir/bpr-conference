export interface TranslationInfo {
    language: string;
    translatorIdentity: string;
    status: string;
    subscriberCount: number;
}

export type FetchTokenResult = { ok: true } | { ok: false; reason: "password" | "error" };
