export interface TranscriptEntry {
  id: string;
  text: string;
  language: string;
  final: boolean;
  timestamp: number;
}

export type InputLanguageMode = "single" | "multi";

export type WatchError = {
  kind: "ended" | "inactive" | "generic";
  message: string;
};
