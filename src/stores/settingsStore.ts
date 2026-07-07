import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart';
import { emit, listen } from '@tauri-apps/api/event';
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
  | 'searchShortcut'
  | 'autoExtractAttachments'
  | 'mcpEnabled'
  | 'language';

type PersistablePatch = Partial<Pick<SettingsState, PersistableKey>>;

interface SettingsState {
  groqKey: string;
  geminiKey: string;
  ollamaEndpoint: string;
  ollamaModel: string;
  privacyMode: boolean;
  captureShortcut: string;
  searchShortcut: string;
  // v2.7: auto-extract text from file attachments on attach (§9.6). When false, the
  // three extraction columns stay NULL and pack output treats files as pointers only.
  autoExtractAttachments: boolean;
  // §20.12: gates the `spool --mcp` stdio server's tools. Default OFF; the --mcp
  // subprocess reads this straight from settings.json (it runs outside the webview).
  mcpEnabled: boolean;
  // UI language. 'zh' is the product default (§18 rule 11); 'en' switches every
  // surface via the lib/i18n dictionary. Persisted; other windows re-read on change.
  language: 'zh' | 'en';
  loaded: boolean;
  panelOpen: boolean; // Settings modal visibility — runtime only, never persisted
  // True once a local Ollama model has been detected via /api/tags. Runtime-only —
  // re-probed on startup, never persisted.
  ollamaAvailable: boolean;
  // Models reported by the Ollama endpoint — populates the model dropdown (§9.12).
  ollamaModels: string[];
  // Reflects the OS launch-agent registration; the OS is the source of truth, so
  // this is read back from the autostart plugin rather than persisted here.
  launchAtLogin: boolean;
  load: () => Promise<void>;
  update: (patch: PersistablePatch) => Promise<void>;
  detectOllama: () => Promise<void>;
  loadAutostart: () => Promise<void>;
  setLaunchAtLogin: (enabled: boolean) => Promise<void>;
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
  'autoExtractAttachments',
  'mcpEnabled',
  'language',
];

export const useSettingsStore = create<SettingsState>((set) => ({
  groqKey: '',
  geminiKey: '',
  ollamaEndpoint: 'http://localhost:11434',
  ollamaModel: 'qwen3:8b',
  privacyMode: false,
  captureShortcut: DEFAULT_CAPTURE_ACCEL,
  searchShortcut: DEFAULT_SEARCH_ACCEL,
  autoExtractAttachments: true,
  mcpEnabled: false,
  language: 'zh',
  loaded: false,
  panelOpen: false,
  ollamaAvailable: false,
  ollamaModels: [],
  launchAtLogin: false,

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
      // Overlay + collect run their own store instances off the same settings.json;
      // broadcast so a change (language, privacy, …) reaches them without a restart.
      void emit('settings:changed').catch(() => {});
    } catch (e) {
      console.warn('settings save failed', e);
    }
  },

  // Probe the local Ollama endpoint for installed models. Pure local request; any
  // failure (no Ollama, network error) just leaves it unavailable.
  detectOllama: async () => {
    try {
      const models = await listOllamaModels(useSettingsStore.getState().ollamaEndpoint);
      set({ ollamaAvailable: models.length > 0, ollamaModels: models });
    } catch {
      set({ ollamaAvailable: false, ollamaModels: [] });
    }
  },

  loadAutostart: async () => {
    try {
      set({ launchAtLogin: await isEnabled() });
    } catch (e) {
      console.warn('autostart isEnabled failed', e);
    }
  },

  setLaunchAtLogin: async (enabled) => {
    try {
      if (enabled) await enable();
      else await disable();
      set({ launchAtLogin: enabled });
    } catch (e) {
      console.warn('autostart toggle failed', e);
    }
  },

  openPanel: () => set({ panelOpen: true }),
  closePanel: () => set({ panelOpen: false }),
}));

// Cross-window settings sync: each window (main / overlay / collect) runs its own store
// instance over the same settings.json. Any window's update() broadcasts; every window —
// including the sender, harmlessly — re-reads so language/privacy flips apply live.
// Module-scope on purpose: the store is a singleton per window, so this listener is too.
void listen('settings:changed', () => {
  void useSettingsStore.getState().load();
}).catch(() => {
  // Non-Tauri context (tests): no event system, nothing to sync.
});
