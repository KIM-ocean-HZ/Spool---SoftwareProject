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
  emit();
  return item;
};

export const removeItem = (id: string): void => {
  items = items.filter((it) => it.id !== id);
  emit();
};

export const updateItemContent = (id: string, content: string): void => {
  items = items.map((it) => (it.id === id ? { ...it, content } : it));
  emit();
};

export const updateItemAnnotation = (id: string, annotation: string): void => {
  items = items.map((it) => (it.id === id ? { ...it, annotation } : it));
  emit();
};

export const togglePin = (id: string): void => {
  items = items.map((it) => (it.id === id ? { ...it, pinned: !it.pinned } : it));
  emit();
};

export const clear = (): void => {
  items = [];
  emit();
};
