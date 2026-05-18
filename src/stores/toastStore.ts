import { create } from 'zustand';

// Lightweight in-window toast surface for the cases §14.4 calls out: clipboard empty
// / attachment target missing / capture monitoring stopped. AI failures and network
// errors deliberately do NOT toast (§14.4 + §18 rule 9 — silent degradation).

export type ToastKind = 'notice' | 'error';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, kind?: ToastKind) => void;
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
  push: (message, kind = 'notice') => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, kind, message }] }));
    setTimeout(() => get().dismiss(id), LIFETIME_MS[kind]);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

// Convenience for non-component call sites (catch handlers, event listeners).
export const toast = {
  notice: (msg: string) => useToastStore.getState().push(msg, 'notice'),
  error: (msg: string) => useToastStore.getState().push(msg, 'error'),
};
