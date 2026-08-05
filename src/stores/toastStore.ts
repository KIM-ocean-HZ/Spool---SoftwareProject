import { create } from 'zustand';

// Lightweight in-window toast surface for the cases §14.4 calls out: clipboard empty
// / attachment target missing / capture monitoring stopped. AI failures and network
// errors deliberately do NOT toast (§14.4 + §18 rule 9 — silent degradation).

export type ToastKind = 'notice' | 'error';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  // DESIGN_AI_ENGINE §1.3: an AI run fails with the CLI's own words — "not logged in",
  // "over quota", a parse error. Those are the useful part and they are far too long for
  // a toast line, so the line says what happened and this sits behind a 详情 disclosure.
  // A toast carrying one does not auto-dismiss: it would vanish mid-read.
  detail?: string;
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, kind?: ToastKind, detail?: string) => void;
  dismiss: (id: number) => void;
  clear: () => void;
}

let nextId = 1;
// Default lifetime; matches the capture overlay's 2.5s so the two surfaces feel like
// one system. Errors stay 1s longer because they often quote a path the user might
// want to read before it disappears.
const LIFETIME_MS: Record<ToastKind, number> = { notice: 2500, error: 3500 };

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (message, kind = 'notice', detail) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, kind, message, detail }] }));
    // Something with a body to expand waits for the user (Esc or the × clears it).
    if (detail === undefined) setTimeout(() => get().dismiss(id), LIFETIME_MS[kind]);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

// Convenience for non-component call sites (catch handlers, event listeners).
export const toast = {
  notice: (msg: string, detail?: string) =>
    useToastStore.getState().push(msg, 'notice', detail),
  error: (msg: string, detail?: string) => useToastStore.getState().push(msg, 'error', detail),
};
