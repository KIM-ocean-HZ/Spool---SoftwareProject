import { readText } from '@tauri-apps/plugin-clipboard-manager';
import { invoke } from '@tauri-apps/api/core';

// macOS NSPasteboard.string(forType:) can block when the clipboard data is a "promised
// type" still being materialized by a slow source app (e.g. Chrome paused under load,
// some PDF readers). A hard wall-clock cap on each read keeps the capture hot path
// honest: better to treat the clipboard as empty and let the user retry than to freeze
// for tens of seconds with no feedback.
const CLIPBOARD_READ_TIMEOUT_MS = 800;

const timeout = <T>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
  Promise.race([
    p,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);

export const readClipboardText = async (): Promise<string> => {
  try {
    const t = await timeout(readText(), CLIPBOARD_READ_TIMEOUT_MS, null);
    return (t ?? '').replace(/^\s+|\s+$/g, '');
  } catch {
    return '';
  }
};

// `app` is the plain app name (for focus-restore); `source` is the provenance label —
// the browser tab title for Safari/Chromium browsers, else the app name.
export interface ForegroundApp {
  app: string;
  source: string;
}

export const readForegroundApp = async (): Promise<ForegroundApp | null> => {
  try {
    const fg = await invoke<ForegroundApp | null>('get_foreground_app');
    return fg ?? null;
  } catch {
    return null;
  }
};
