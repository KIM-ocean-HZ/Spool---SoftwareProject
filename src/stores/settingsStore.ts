import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart';
import { emit, listen } from '@tauri-apps/api/event';
import { Store } from '@tauri-apps/plugin-store';
import { create } from 'zustand';
import { DEFAULT_SEARCH_ACCEL } from '@/lib/capture/shortcut';

// Keys persisted to settings.json via tauri-plugin-store. `captureShortcut` /
// `searchShortcut` are accelerator strings (lib/capture/shortcut.ts).
type PersistableKey =
  | 'captureShortcut'
  | 'searchShortcut'
  | 'autoExtractAttachments'
  | 'mcpEnabled'
  | 'mcpWriteEnabled'
  | 'language';

type PersistablePatch = Partial<Pick<SettingsState, PersistableKey>>;

interface SettingsState {
  // Null = no capture shortcut bound (the default since 2026-07-07 — ⌘⇧C retired,
  // double-tap ⌥ captures). Non-null only when the user records one in Settings.
  captureShortcut: string | null;
  searchShortcut: string;
  // v2.7: auto-extract text from file attachments on attach (§9.6). When false, the
  // three extraction columns stay NULL and pack output treats files as pointers only.
  autoExtractAttachments: boolean;
  // §20.12: gates the `spool --mcp` stdio server's tools. Default OFF; the --mcp
  // subprocess reads this straight from settings.json (it runs outside the webview).
  mcpEnabled: boolean;
  // §20.13: separate consent for the MCP write tools (create_thread / add_block).
  // Default OFF — reading packs and letting an external AI insert rows are different
  // trust levels. Also read straight from settings.json by the --mcp subprocess.
  mcpWriteEnabled: boolean;
  // UI language. 'zh' is the product default (§18 rule 11); 'en' switches every
  // surface via the lib/i18n dictionary. Persisted; other windows re-read on change.
  language: 'zh' | 'en';
  loaded: boolean;
  panelOpen: boolean; // Settings modal visibility — runtime only, never persisted
  // Reflects the OS launch-agent registration; the OS is the source of truth, so
  // this is read back from the autostart plugin rather than persisted here.
  launchAtLogin: boolean;
  load: () => Promise<void>;
  update: (patch: PersistablePatch) => Promise<void>;
  loadAutostart: () => Promise<void>;
  setLaunchAtLogin: (enabled: boolean) => Promise<void>;
  openPanel: () => void;
  closePanel: () => void;
}

let storePromise: Promise<Store> | null = null;
const getStore = (): Promise<Store> => {
  if (!storePromise) storePromise = Store.load('settings.json');
  return storePromise;
};

const KEYS: PersistableKey[] = [
  'captureShortcut',
  'searchShortcut',
  'autoExtractAttachments',
  'mcpEnabled',
  'mcpWriteEnabled',
  'language',
];

// Settings the removed built-in AI layer (2026-07-09, MCP-first pivot) used to
// persist. Scrubbed from settings.json on load: groqKey/geminiKey were plaintext
// API keys and must not linger on disk once nothing reads them.
const LEGACY_AI_KEYS = [
  'groqKey',
  'geminiKey',
  'ollamaEndpoint',
  'ollamaModel',
  'privacyMode',
] as const;

export const useSettingsStore = create<SettingsState>((set) => ({
  captureShortcut: null,
  searchShortcut: DEFAULT_SEARCH_ACCEL,
  autoExtractAttachments: true,
  mcpEnabled: false,
  mcpWriteEnabled: false,
  language: 'zh',
  loaded: false,
  panelOpen: false,
  launchAtLogin: false,

  load: async () => {
    try {
      const store = await getStore();
      const next: Partial<SettingsState> = {};
      for (const k of KEYS) {
        const v = await store.get<string | boolean>(k);
        if (v !== null && v !== undefined) (next as Record<string, unknown>)[k] = v;
      }
      // One-time cleanup for users upgrading across the MCP-first pivot.
      let scrubbed = false;
      for (const k of LEGACY_AI_KEYS) {
        if (await store.has(k)) {
          await store.delete(k);
          scrubbed = true;
        }
      }
      if (scrubbed) await store.save();
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
      // broadcast so a change (language, …) reaches them without a restart.
      void emit('settings:changed').catch(() => {});
    } catch (e) {
      console.warn('settings save failed', e);
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
// including the sender, harmlessly — re-reads so language flips apply live.
// Module-scope on purpose: the store is a singleton per window, so this listener is too.
void listen('settings:changed', () => {
  void useSettingsStore.getState().load();
}).catch(() => {
  // Non-Tauri context (tests): no event system, nothing to sync.
});
