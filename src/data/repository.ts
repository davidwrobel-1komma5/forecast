import type { AppState } from "../domain/types";
import { STATE_VERSION, seedState } from "./seed";

/**
 * Persistenz hinter einer schmalen Schnittstelle. Version 1 speichert lokal im
 * Browser; ein serverseitiges Repository kann später dieselbe Signatur erfüllen,
 * ohne dass Domänenlogik oder UI angefasst werden müssen.
 */
export interface Repository {
  load(): AppState;
  save(state: AppState): void;
}

const STORAGE_KEY = "forecast-app-state-v1";

export const localRepository: Repository = {
  load() {
    const fallback = seedState();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as AppState;
      if (!parsed || parsed.version !== STATE_VERSION) return fallback;
      return {
        ...fallback,
        ...parsed,
        settings: { ...fallback.settings, ...parsed.settings }
      };
    } catch {
      return fallback;
    }
  },
  save(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Speicher voll oder blockiert – die App bleibt in diesem Fall nutzbar.
    }
  }
};
