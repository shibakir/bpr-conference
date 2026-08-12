export interface TranslationInfo {
    language: string;
    translatorIdentity: string;
    status: string;
    subscriberCount: number;
}

export interface TranslationDiagnostic {
    id: string;
    targetLanguage: string;
    text: string;
    final: boolean;
    timestamp: number;
}

export type FetchTokenResult = { ok: true } | { ok: false; reason: "password" | "error" };
