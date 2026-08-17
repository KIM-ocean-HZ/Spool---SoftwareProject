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
  /** One way back from what just happened — 「撤销」 (Ocean 2026-08-17, after a line he had
   *  typed went for good on one click of 🗑). ⚠️ The undo lives HERE rather than as a
   *  confirmation dialog on purpose: a dialog charges every deletion for the one that was a
   *  mistake, and this list is meant to be pruned freely. */
  action?: { label: string; run: () => void };
}

interface ToastState {
  toasts: Toast[];
  push: (
    message: string,
    kind?: ToastKind,
    detail?: string,
    action?: Toast['action'],
  ) => void;
  dismiss: (id: number) => void;
  clear: () => void;
}

let nextId = 1;
// Default lifetime; matches the capture overlay's 2.5s so the two surfaces feel like
// one system. Errors stay 1s longer because they often quote a path the user might
// want to read before it disappears.
const LIFETIME_MS: Record<ToastKind, number> = { notice: 2500, error: 3500 };
// One with a way back has to outlive the moment of realising you need it: 2.5s is enough
// to read a confirmation and not enough to change your mind about a deletion.
const UNDO_LIFETIME_MS = 7000;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (message, kind = 'notice', detail, action) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, kind, message, detail, action }] }));
    // Something with a body to expand waits for the user (Esc or the × clears it).
    if (detail === undefined) {
      setTimeout(() => get().dismiss(id), action ? UNDO_LIFETIME_MS : LIFETIME_MS[kind]);
    }
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

// Convenience for non-component call sites (catch handlers, event listeners).
export const toast = {
  notice: (msg: string, detail?: string) =>
    useToastStore.getState().push(msg, 'notice', detail),
  error: (msg: string, detail?: string) => useToastStore.getState().push(msg, 'error', detail),
  /** 「…… 撤销」 — the line says what happened, the button undoes it. */
  undo: (msg: string, label: string, run: () => void) =>
    useToastStore.getState().push(msg, 'notice', undefined, { label, run }),
  /** Same shape as undo, opposite meaning: the button GOES somewhere rather than taking
   *  something back (「已导出 · 打开文件夹」). Kept separate so a call site cannot read as an
   *  undo it is not — it borrows undo's longer lifetime, which is what a button needs. */
  action: (msg: string, label: string, run: () => void) =>
    useToastStore.getState().push(msg, 'notice', undefined, { label, run }),
};
