import { Store } from '@tauri-apps/plugin-store';
import { create } from 'zustand';
import { listOllamaModels } from '@/lib/ai/providers/ollama';
import { DEFAULT_CAPTURE_ACCEL, DEFAULT_SEARCH_ACCEL } from '@/lib/capture/shortcut';

// Keys persisted to settings.json via tauri-plugin-store. `captureShortcut` /
// `searchShortcut` are accelerator strings (lib/capture/shortcut.ts); the rest are
// Phase 11/12 AI settings, already present so the store shape is stable.
type PersistableKey =
  | 'groqKey'
  | 'geminiKey'
  | 'ollamaEndpoint'
  | 'ollamaModel'
  | 'privacyMode'
  | 'captureShortcut'
  | 'searchShortcut';

type PersistablePatch = Partial<Pick<SettingsState, PersistableKey>>;

interface SettingsState {
  groqKey: string;
  geminiKey: string;
  ollamaEndpoint: string;
  ollamaModel: string;
  privacyMode: boolean;
  captureShortcut: string;
  searchShortcut: string;
  loaded: boolean;
  panelOpen: boolean; // Settings modal visibility — runtime only, never persisted
  // True once a local Ollama model has been detected via /api/tags. Runtime-only —
  // re-probed on startup, never persisted.
  ollamaAvailable: boolean;
  load: () => Promise<void>;
  update: (patch: PersistablePatch) => Promise<void>;
  detectOllama: () => Promise<void>;
  openPanel: () => void;
  closePanel: () => void;
}

// AI entry points are shown only when the AI can actually run (§6.4 rule 3, §11.6):
// either a local model is present, or online keys are configured with privacy off.
export const isAiAvailable = (s: SettingsState): boolean => {
  if (s.ollamaAvailable) return true;
  if (s.privacyMode) return false;
  return Boolean(s.groqKey || s.geminiKey);
};

let storePromise: Promise<Store> | null = null;
const getStore = (): Promise<Store> => {
  if (!storePromise) storePromise = Store.load('settings.json');
  return storePromise;
};

const KEYS: PersistableKey[] = [
  'groqKey',
  'geminiKey',
  'ollamaEndpoint',
  'ollamaModel',
  'privacyMode',
  'captureShortcut',
  'searchShortcut',
];

export const useSettingsStore = create<SettingsState>((set) => ({
  groqKey: '',
  geminiKey: '',
  ollamaEndpoint: 'http://localhost:11434',
  ollamaModel: 'qwen3:8b',
  privacyMode: false,
  captureShortcut: DEFAULT_CAPTURE_ACCEL,
  searchShortcut: DEFAULT_SEARCH_ACCEL,
  loaded: false,
  panelOpen: false,
  ollamaAvailable: false,

  load: async () => {
    try {
      const store = await getStore();
      const next: Partial<SettingsState> = {};
      for (const k of KEYS) {
        const v = await store.get<string | boolean>(k);
        if (v !== null && v !== undefined) (next as Record<string, unknown>)[k] = v;
      }
      set({ ...(next as Partial<SettingsState>), loaded: true });
    } catch (e) {
      console.warn('settings load failed', e);
      set({ loaded: true });
    }
  },

  update: async (patch) => {
    set(patch);
    try {
      const store = await getStore();
      for (const [k, v] of Object.entries(patch)) {
        await store.set(k, v as unknown as string | boolean);
      }
      await store.save();
    } catch (e) {
      console.warn('settings save failed', e);
    }
  },

  // Probe the local Ollama endpoint for installed models. Pure local request; any
  // failure (no Ollama, network error) just leaves ollamaAvailable false.
  detectOllama: async () => {
    try {
      const models = await listOllamaModels(useSettingsStore.getState().ollamaEndpoint);
      set({ ollamaAvailable: models.length > 0 });
    } catch {
      set({ ollamaAvailable: false });
    }
  },

  openPanel: () => set({ panelOpen: true }),
  closePanel: () => set({ panelOpen: false }),
}));
