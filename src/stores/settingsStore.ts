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
  | 'aiEngineActionsEnabled'
  | 'aiEngineTimeoutSecs'
  | 'language'
  | 'firstCaptureHintPending';

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
  // DESIGN_AI_ENGINE §1.4: whether the "让 AI 维护" group appears in a thread's ⋯ menu.
  // Default ON, because it only means anything once the Claude Code CLI is detected —
  // no CLI, no menu group, whatever this says (§1.1's three-way render gate).
  aiEngineActionsEnabled: boolean;
  // §1.4: per-run budget in seconds. Default 5 minutes, and Rust clamps to 10 whatever
  // arrives here — an agentic loop with no ceiling is a runaway subscription bill.
  aiEngineTimeoutSecs: number;
  // UI language. Defaults to the system locale (see detectSystemLanguage); 'en' vs 'zh'
  // switches every surface via the lib/i18n dictionary. Persisted only once the user
  // picks one by hand; other windows re-read on change.
  language: 'zh' | 'en';
  // DESIGN_FIRST_RUN 拍板点 5: armed by the launch that creates the database, spent by
  // the first successful capture (captureStore.noteCapture) — that pairing is what
  // keeps the one-time closing line away from existing libraries, which never had the
  // key written. Default false, so "no key" means "don't show it".
  firstCaptureHintPending: boolean;
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

// UI language on a machine that has never picked one (2026-07-31, Ocean): English is
// the default, and a Chinese system gets Chinese without touching anything. The webview's
// navigator.language is the system locale — enough on its own, no plugin-os needed.
//
// The rule that keeps this from fighting the user: `language` is written to
// settings.json ONLY by an explicit switch (Settings → 语言 / the onboarding banner), so
// a persisted value always means "the user chose this" and load() lets it win. Nothing
// auto-writes the detected value back.
export const languageForLocale = (locale: string | undefined): 'zh' | 'en' =>
  locale?.toLowerCase().startsWith('zh') ? 'zh' : 'en';

const detectSystemLanguage = (): 'zh' | 'en' =>
  languageForLocale(globalThis.navigator?.language);

// The language actually in effect right now, mirrored into settings.json for readers
// outside the webview. `language` above cannot serve that purpose: it is absent until
// the user explicitly switches, and its absence is exactly what means "follow the
// system" — so a reader that only sees settings.json cannot tell Chinese-by-default
// from English-by-default. The MCP server is such a reader (a separate `spool --mcp`
// process with no navigator), and it has to speak the same language the app does.
// Written on every load, never read back into state, and NOT in KEYS — nothing about
// `language`'s "the user chose this" semantics changes.
export const RESOLVED_LANGUAGE_KEY = 'resolvedLanguage';

const mirrorResolvedLanguage = async (store: Store, effective: 'zh' | 'en'): Promise<void> => {
  try {
    if ((await store.get<string>(RESOLVED_LANGUAGE_KEY)) === effective) return;
    await store.set(RESOLVED_LANGUAGE_KEY, effective);
    await store.save();
  } catch (e) {
    console.warn('resolvedLanguage mirror failed', e);
  }
};

let storePromise: Promise<Store> | null = null;
const getStore = (): Promise<Store> => {
  if (!storePromise) storePromise = Store.load('settings.json');
  return storePromise;
};

// load() re-runs on every settings:changed broadcast in every window — the legacy-key
// scrub only needs to run once per window session (and only ever deletes on the first
// launch after the MCP-first pivot).
let legacyScrubDone = false;

const KEYS: PersistableKey[] = [
  'captureShortcut',
  'searchShortcut',
  'autoExtractAttachments',
  'mcpEnabled',
  'mcpWriteEnabled',
  'aiEngineActionsEnabled',
  'aiEngineTimeoutSecs',
  'language',
  'firstCaptureHintPending',
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
  aiEngineActionsEnabled: true,
  aiEngineTimeoutSecs: 300,
  language: detectSystemLanguage(),
  firstCaptureHintPending: false,
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
      if (!legacyScrubDone) {
        legacyScrubDone = true;
        let scrubbed = false;
        for (const k of LEGACY_AI_KEYS) {
          if (await store.delete(k)) scrubbed = true;
        }
        if (scrubbed) await store.save();
      }
      await mirrorResolvedLanguage(store, (next.language as 'zh' | 'en') ?? detectSystemLanguage());
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
      // The overlay runs its own store instance off the same settings.json;
      // broadcast so a change (language, …) reaches it without a restart.
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

// Cross-window settings sync: each window (main / overlay) runs its own store
// instance over the same settings.json. Any window's update() broadcasts; every window —
// including the sender, harmlessly — re-reads so language flips apply live.
// Module-scope on purpose: the store is a singleton per window, so this listener is too.
void listen('settings:changed', () => {
  void useSettingsStore.getState().load();
}).catch(() => {
  // Non-Tauri context (tests): no event system, nothing to sync.
});
