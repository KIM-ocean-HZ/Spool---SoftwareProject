import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart';
import { emit, listen } from '@tauri-apps/api/event';
import { Store } from '@tauri-apps/plugin-store';
import { create } from 'zustand';
import { DEFAULT_CAPTURE_ACCEL, DEFAULT_SEARCH_ACCEL } from '@/lib/capture/shortcut';
import {
  DEFAULT_WORK_MINUTES,
  workMinutesOrDefault,
  type WorkMinutes,
} from '@/lib/breakReminder';
import { DEFAULT_LEVEL, type CompressLevel } from '@/lib/ai/compress';
import { DEFAULT_RAIL_WIDTH } from '@/lib/layout';
import { DEFAULT_THEME, themeOrDefault, type Theme } from '@/lib/theme';

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
  | 'aiEngine'
  | 'aiEnginePath'
  | 'aiModelClaude'
  | 'aiModelGemini'
  | 'aiEffortClaude'
  | 'language'
  | 'firstCaptureHintPending'
  | 'railWidth'
  | 'sidebarCollapsed'
  | 'railCollapsed'
  | 'aiAutoMaintain'
  | 'packInstructions'
  | 'closeToTrayHintSeen'
  | 'theme'
  | 'breakReminderEnabled'
  | 'breakWorkMinutes'
  // 形态 C（WORKPLAN-2026-08-20 §6.2）：Spool 自己出去调 API。
  // ⚠️ key 不在这里，也永远不要放进来 —— 见 api_engine.rs 里 api_key_save 上面那段。
  | 'apiEngineEnabled'
  | 'apiBaseUrl'
  | 'apiModel'
  | 'apiCompressLevel'
  | 'apiTimeoutSecs';

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
  // §7.4: which CLI runs the actions. Null = no pick, which is the normal state: it only
  // means anything when BOTH claude and codex are installed, and Rust falls back to
  // whatever it finds if this names one that is gone.
  aiEngine: 'claude' | 'codex' | 'gemini' | null;
  // 2026-08-17 (Ocean): 「AI 引擎是被动搜索形式的,这导致用户没法在 spool 里面去主动添加 AI 引擎」.
  // A full path to a CLI Spool's own search missed. Null = nothing typed, which is the normal
  // state — detection finds a standard install by itself. Rust identifies the engine from the
  // file's NAME and still runs `--version` on it, so a wrong path is a miss, not a crash.
  aiEnginePath: string | null;
  // DESIGN_WORKBENCH §9.3 #3 (W3-c) — which model the claude engine runs on. Null = the
  // account's own default, and that is not the same as picking one: with no value the
  // `--model` flag is not passed at all, so Spool never overrides a choice the user made
  // elsewhere. One of engine.rs's CLAUDE_MODELS aliases otherwise; Rust drops anything else,
  // because this file is hand-editable and a typo would fail the run with a flag error.
  //
  // ⚠️ claude only. Codex resolves its models from a server-fetched catalog and does not
  // validate `-c` overrides locally (measured 2026-08-07), so a picker there would offer
  // names that fail at the API rather than at the click. It waits on codex quota (2026-09-04).
  aiModelClaude: string | null;
  // DESIGN_AI_ENGINE §7.8 — the same thing for gemini, kept as a SEPARATE key rather than one
  // shared `aiModel`: the two catalogues share no names, so one key would mean switching
  // engine silently discards the other engine's choice. ⚠️ Full model ids here, not aliases,
  // because gemini's free quota is metered per model (§7.8.4) — which one is selected is
  // exactly what decides whether today's runs still work.
  aiModelGemini: string | null;
  // DESIGN_WORKBENCH §9.13 — how hard claude thinks. Null = the CLI's own default (the env
  // var is not set at all), otherwise one of engine.rs's CLAUDE_EFFORTS: low / medium / high.
  //
  // ⚠️ There is no `--effort` flag; it rides in `CLAUDE_CODE_EFFORT_LEVEL` (read out of the
  // 2.0.50 binary on 2026-08-07 — see engine.rs CLAUDE_EFFORTS for the resolver). ⚠️ And an
  // unrecognised value is IGNORED by the CLI rather than rejected, so a typo here would look
  // like it worked. Rust filters it against the list before setting anything.
  aiEffortClaude: string | null;
  // UI language. Defaults to the system locale (see detectSystemLanguage); 'en' vs 'zh'
  // switches every surface via the lib/i18n dictionary. Persisted only once the user
  // picks one by hand; other windows re-read on change.
  language: 'zh' | 'en';
  // DESIGN_FIRST_RUN 拍板点 5: armed by the launch that creates the database, spent by
  // the first successful capture (captureStore.noteCapture) — that pairing is what
  // keeps the one-time closing line away from existing libraries, which never had the
  // key written. Default false, so "no key" means "don't show it".
  firstCaptureHintPending: boolean;
  // DESIGN_WORKBENCH §3 — the two rails. Ocean 2026-08-06: "左右两侧边栏都可以拖移或者隐藏".
  // The width is persisted because a dragged rail that forgets is worse than one that
  // cannot be dragged, and it is clamped on read (lib/layout.ts) so a hand-edited
  // settings.json cannot leave the user with a 6000px rail and no way back.
  // ⚠️ `sidebarWidth` used to live here and is gone (Ocean 2026-08-11: the left rail is
  // fixed now). An existing settings.json still holding one is simply ignored — nothing
  // reads it, and rewriting a file on disk to drop a dead key buys nothing.
  railWidth: number;
  sidebarCollapsed: boolean;
  // The right rail starts collapsed: it is about the engine, and a user with no CLI
  // installed has nothing to put in it (DESIGN_AI_ENGINE §0 — absence is the default
  // state, and the product is complete without it).
  railCollapsed: boolean;
  // DESIGN_WORKBENCH §4.3 — automatic maintenance, the thing Ocean asked for on
  // 2026-08-06 ("我倾向于ai维护自动化…让用户放心并且有开关").
  //
  // ⚠️ Default OFF, and that is a deliberate reading of a request that pulled two ways.
  // He asked for automation AND for 「必须节约token」 and 「让用户放心」 in the same
  // breath — and this switch spends real money on a subscription without being asked
  // again. A feature that starts billing on upgrade is the opposite of 放心, so the
  // default is off and the switch sits in the rail where the runs appear, not buried in
  // settings. Flipping this default is a one-line change if he wants it the other way.
  aiAutoMaintain: boolean;
  // DESIGN_CONTEXT_HYGIENE §1.1 — whether a clipboard pack carries the four-category
  // reading instructions. Ocean 2026-08-06: 「pack 降级成最简便操作,让纯网页端 ai 用户使用」,
  // so this shipped defaulting OFF.
  //
  // ⚠️ 2026-08-08 he reversed the default: 「默认勾上(带说明)」. Off was the half of his
  // original ask that cost something — without the header a receiving AI cannot tell an
  // AI-written essay from the user's own judgement and weighs them the same, which is the
  // authority laundering DESIGN_MCP_WRITE_ROLE §2 exists to prevent. The switch stays, so
  // a user who wants the short pack unticks it once and it is remembered. MCP packs are
  // NOT affected; there the header is a contract with a model, not an explainer.
  packInstructions: boolean;
  /** Windows only — whether the one-time 「关掉窗口 ≠ 退出」 card has been shown. Rust decides
   *  what ✕ does and reads this bit through `set_close_hint_pending`, so this is the whole
   *  memory of it: cleared here, the card comes back. */
  closeToTrayHintSeen: boolean;
  /** 情人节限定版 (2026-08-19, Ocean) — which palette / display face / background the windows
   *  paint with. `'classic'` is the shipped v0.5.0 look and is the DEFAULT, so a build
   *  carrying this key installs over a real library and changes nothing until someone opens
   *  Settings (Ocean picked that default the same day).
   *
   *  ⚠️ Read by the capture overlay too — it is a separate window with its own store instance
   *  over the same settings.json, and it re-reads on the `settings:changed` broadcast. So
   *  flipping this repaints both windows at once; do not add a second copy of the value.
   *  ⚠️ NOT read by the `spool --mcp` subprocess, unlike `resolvedLanguage`: nothing an MCP
   *  client sees has a colour. */
  theme: Theme;
  /** 休息提醒 (2026-08-19 second pass, Ocean: 「设置里面可以关闭休息提醒,做成两个 appearance 都
   *  有的功能」). Default ON in BOTH themes — the earlier 「只在情人节版」 ruling covered the whole
   *  feature and he reversed that half of it by name. Gwen is untouched and stays 情人节-only.
   *
   *  ⚠️ This is the only key in this file that changes what 经典 does rather than how it looks,
   *  which is why it is a switch the user can find in one place and turn off in one click. */
  breakReminderEnabled: boolean;
  /** 形态 C 总开关。⚠️ 默认 false —— §6.2 约束 5。 */
  apiEngineEnabled: boolean;
  /** OpenAI 兼容端点的根地址。⛔ 必须 https,子进程会拒绝明文 http。 */
  apiBaseUrl: string;
  apiModel: string;
  apiCompressLevel: CompressLevel;
  apiTimeoutSecs: number;
  /** How long a sitting runs before the break lock comes up — 30 / 60 / 120, the arms of the
   *  study quoted beside the picker. Validated on read (lib/breakReminder's
   *  `workMinutesOrDefault`): the file is hand-editable and a stray number would otherwise
   *  become a schedule nobody chose. */
  breakWorkMinutes: WorkMinutes;
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
  'aiEngine',
  'aiEnginePath',
  'aiModelClaude',
  'aiModelGemini',
  'aiEffortClaude',
  'language',
  'firstCaptureHintPending',
  'railWidth',
  'sidebarCollapsed',
  'railCollapsed',
  'aiAutoMaintain',
  'packInstructions',
  'closeToTrayHintSeen',
  'theme',
  'breakReminderEnabled',
  'breakWorkMinutes',
  'apiEngineEnabled',
  'apiBaseUrl',
  'apiModel',
  'apiCompressLevel',
  'apiTimeoutSecs',
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
  captureShortcut: DEFAULT_CAPTURE_ACCEL,
  searchShortcut: DEFAULT_SEARCH_ACCEL,
  autoExtractAttachments: true,
  mcpEnabled: false,
  // §5-B / DESIGN_MCP_WRITE_ROLE M2: ON by default since 2026-08-13. The gate B3 set was
  // 「add_block 真跑过且没出事」, and it has (08-07, ChatGPT wrote 11 blocks). Writing is
  // append-only, always source-labelled, and undoable — and it is still a SUB-toggle of
  // mcpEnabled, so nothing can write until the user turns the MCP server on themselves.
  // ⚠️ The Rust side has its own default in mcp.rs (mcp_write_enabled) — the key is absent
  // from settings.json until someone touches the toggle, so both have to agree.
  mcpWriteEnabled: true,
  aiEngineActionsEnabled: true,
  aiEngineTimeoutSecs: 300,
  aiEngine: null,
  aiEnginePath: null,
  aiModelClaude: null,
  aiModelGemini: null,
  aiEffortClaude: null,
  language: detectSystemLanguage(),
  firstCaptureHintPending: false,
  railWidth: DEFAULT_RAIL_WIDTH,
  sidebarCollapsed: false,
  railCollapsed: true,
  aiAutoMaintain: false,
  packInstructions: true,
  // Windows only (2026-08-18, Ocean #1): whether the 「关掉窗口 ≠ 退出」 card has been shown.
  // Written once, by the card's own button — see components/CloseToTrayHint.
  closeToTrayHintSeen: false,
  theme: DEFAULT_THEME,
  breakReminderEnabled: true,
  breakWorkMinutes: DEFAULT_WORK_MINUTES,
  // ⚠️ §6.2 设计约束 5：**默认关闭**，而且是和 MCP 分开的第二个独立开关。
  // 打开它才会有任何东西离开这台机器,而且离开的也不是主进程 —— 是 spool-ai 子进程。
  apiEngineEnabled: false,
  // DeepSeek 是 §6.2 算过账的那家（兼容 OpenAI 格式）。地址可改,因为「OpenAI 兼容」
  // 的端点不止一家,而换一家不需要改一行代码。
  apiBaseUrl: 'https://api.deepseek.com',
  // ⚠️ 2026-08-20 改过一次：原来填的 `deepseek-chat` 是旧名字，现在这家只有 pro 和 flash
  // 两档。这个名字是**接口自己回报的**（Ocean 那次实测的响应里 model 字段就是它），
  // 不是照着文档抄的——而且它带着 `flash`，成本估算那边正好认得出是哪一档价目。
  apiModel: 'deepseek-v4-flash',
  apiCompressLevel: DEFAULT_LEVEL,
  // ⚠️ 2026-08-20 从 180 提到 600。180 是照着「一次几十秒的调用」定的，而那个前提是错的：
  // 26,615 字符那份 pack 跑到 180 秒还没写完就被掐了，**而那一次已经计了 ¥0.08**。
  // 会思考的模型要先想再写，几分钟是正常的。
  apiTimeoutSecs: 600,
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
      // ⚠️ The loop above trusts the file. `theme` is the one key where that is not safe
      // enough: settings.json is hand-editable, and an unrecognised name would be written
      // onto <html> where no stylesheet matches it — a half-painted window rather than either
      // theme. Everything else here is a boolean, a number or a string the UI re-validates.
      if (next.theme !== undefined) next.theme = themeOrDefault(next.theme);
      // Same reason, same shape: a number that is not one of the three offered would run a
      // schedule the picker cannot even display.
      if (next.breakWorkMinutes !== undefined) {
        next.breakWorkMinutes = workMinutesOrDefault(next.breakWorkMinutes);
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
