import { nanoid } from 'nanoid';
import type { AttachmentKind } from '@/lib/db/attachments';

// §8.2 / §20.9 — the collect-mode staging buffer. In-memory ONLY: items live in the
// collect window's process and are NEVER persisted until Send merges them into one block
// (§20.9 isolation invariant). The buffer survives panel re-renders within a session but
// is lost when the window/app closes.
//
// A tiny pub-sub (subscribe/getAll) backs the panel via useSyncExternalStore — no Zustand
// here so the merge/buffer logic stays framework-free and unit-testable. Every mutator
// replaces `items` with a fresh array, so getAll() is a stable snapshot between emits.
//
// The buffer also owns a panel-LOCAL sub-undo stack (§9.13): add / remove / edit-content /
// edit-annotation each record their inverse, and undoLocal() reverses the last one. This
// is separate from the MAIN undo ring (which owns capture/merge/delete/collect_send); a
// user can undo within a staging session without touching committed blocks.

export interface StagingAttachment {
  kind: AttachmentKind;
  target: string;
  label: string;
}

export interface StagingItem {
  id: string; // local id; not a DB id
  content: string;
  annotation: string; // visible inline per §2.5.1
  source: string | null;
  pinned: boolean;
  attachments: StagingAttachment[]; // collected onto the survivor on Send
  createdAt: number;
}

type Listener = () => void;

let items: StagingItem[] = [];
const listeners = new Set<Listener>();

const emit = (): void => {
  for (const l of listeners) l();
};

export const subscribe = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getAll = (): StagingItem[] => items;

// --- panel-local sub-undo (§9.13) ---------------------------------------------------------

// Pin toggles are intentionally NOT undoable here (reversible by toggling again); §9.13
// lists add / remove / edit content / edit annotation as the panel-local ops.
type LocalUndoEntry =
  | { kind: 'add'; id: string }
  | { kind: 'remove'; index: number; item: StagingItem }
  | { kind: 'content'; id: string; prev: string }
  | { kind: 'annotation'; id: string; prev: string };

export type LocalUndoKind = LocalUndoEntry['kind'];

export interface LocalUndoResult {
  kind: LocalUndoKind;
  preview: string;
}

let undoStack: LocalUndoEntry[] = [];

const PREVIEW_MAX = 12;
const preview = (raw: string): string => {
  const one = raw.replace(/\s+/g, ' ').trim();
  return one.length <= PREVIEW_MAX ? one : `${one.slice(0, PREVIEW_MAX)}…`;
};

// Guard the capture-append path against the SAME item being staged twice from one capture —
// a duplicate `collect:append` delivery, or a dev HMR-leaked listener firing the handler more
// than once. A genuine re-capture of identical text is always far more than this apart, so
// this never drops a real second item. Restage (undo) bypasses this and calls addItem directly.
let lastAppend: { content: string; source: string | null; at: number } | null = null;
const APPEND_DEDUP_MS = 400;

export const stageCapturedItem = (content: string, source: string | null): void => {
  const now = Date.now();
  if (
    lastAppend &&
    lastAppend.content === content &&
    lastAppend.source === source &&
    now - lastAppend.at < APPEND_DEDUP_MS
  ) {
    return; // duplicate delivery — ignore
  }
  lastAppend = { content, source, at: now };
  addItem({ content, source });
};

export const addItem = (seed: Partial<StagingItem>): StagingItem => {
  const item: StagingItem = {
    id: seed.id ?? nanoid(),
    content: seed.content ?? '',
    annotation: seed.annotation ?? '',
    source: seed.source ?? null,
    pinned: seed.pinned ?? false,
    attachments: seed.attachments ?? [],
    createdAt: seed.createdAt ?? Date.now(),
  };
  items = [...items, item];
  undoStack.push({ kind: 'add', id: item.id });
  emit();
  return item;
};

export const removeItem = (id: string): void => {
  const index = items.findIndex((it) => it.id === id);
  if (index < 0) return;
  const item = items[index]!;
  items = items.filter((it) => it.id !== id);
  undoStack.push({ kind: 'remove', index, item });
  emit();
};

// Consecutive edits to the SAME field coalesce into one undo step (so Cmd+Z reverts a
// whole typing run, not one keystroke): only record when the top entry isn't already an
// edit of this same field, capturing the pre-run value.
export const updateItemContent = (id: string, content: string): void => {
  const top = undoStack[undoStack.length - 1];
  if (!(top && top.kind === 'content' && top.id === id)) {
    const cur = items.find((it) => it.id === id);
    if (cur) undoStack.push({ kind: 'content', id, prev: cur.content });
  }
  items = items.map((it) => (it.id === id ? { ...it, content } : it));
  emit();
};

export const updateItemAnnotation = (id: string, annotation: string): void => {
  const top = undoStack[undoStack.length - 1];
  if (!(top && top.kind === 'annotation' && top.id === id)) {
    const cur = items.find((it) => it.id === id);
    if (cur) undoStack.push({ kind: 'annotation', id, prev: cur.annotation });
  }
  items = items.map((it) => (it.id === id ? { ...it, annotation } : it));
  emit();
};

export const togglePin = (id: string): void => {
  items = items.map((it) => (it.id === id ? { ...it, pinned: !it.pinned } : it));
  emit();
};

// Reverse the last panel-local op and return what it was (for the UndoToast), or null when
// the local stack is empty (caller then falls through to the main undo ring). Inverses are
// applied directly — they don't push new undo entries.
export const undoLocal = (): LocalUndoResult | null => {
  const entry = undoStack.pop();
  if (!entry) return null;
  switch (entry.kind) {
    case 'add': {
      const removed = items.find((it) => it.id === entry.id);
      items = items.filter((it) => it.id !== entry.id);
      emit();
      return { kind: 'add', preview: preview(removed?.content ?? '') };
    }
    case 'remove': {
      const at = Math.min(entry.index, items.length);
      items = [...items.slice(0, at), entry.item, ...items.slice(at)];
      emit();
      return { kind: 'remove', preview: preview(entry.item.content) };
    }
    case 'content': {
      items = items.map((it) => (it.id === entry.id ? { ...it, content: entry.prev } : it));
      emit();
      return { kind: 'content', preview: preview(entry.prev) };
    }
    case 'annotation': {
      items = items.map((it) => (it.id === entry.id ? { ...it, annotation: entry.prev } : it));
      emit();
      return { kind: 'annotation', preview: preview(entry.prev) };
    }
  }
};

export const clear = (): void => {
  items = [];
  undoStack = [];
  emit();
};
