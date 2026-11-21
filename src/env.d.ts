/// <reference types="vite/client" />

// Minimal typing for Chrome's Prompt API (only what availability() needs).
declare const LanguageModel:
  | {
      availability(options?: unknown): Promise<'available' | 'downloadable' | 'downloading' | 'unavailable'>;
    }
  | undefined;

interface ImportMetaEnv {
  readonly VITE_APPCHECK_DEBUG_TOKEN?: string;
}
