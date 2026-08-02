import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';

// The Input Monitoring grant, shared by the two surfaces that must never contradict
// each other (DESIGN_FIRST_RUN 拍板点 2/4): the onboarding banner and the empty-thread
// copy. `null` = unknown (outside Tauri, or before the first check) — callers keep the
// granted wording in that case rather than claiming something is missing with no
// evidence. PermissionBanner owns the re-check on window focus, i.e. on the way back
// from System Settings.
interface PermissionState {
  inputMonitoring: boolean | null;
  // Seen missing at least once this session — what tells "granted all along" (say
  // nothing) apart from "granted just now" (the tap is deaf until relaunch).
  everDenied: boolean;
  // The user pressed "turn on capture" this session, i.e. the system prompts fired.
  requested: boolean;
  check: () => Promise<void>;
  request: () => Promise<void>;
}

export const usePermissionStore = create<PermissionState>((set, get) => ({
  inputMonitoring: null,
  everDenied: false,
  requested: false,

  check: async () => {
    try {
      const granted = await invoke<boolean>('input_monitoring_granted');
      set((s) => ({ inputMonitoring: granted, everDenied: s.everDenied || !granted }));
    } catch {
      // Non-Tauri context (tests / plain vite) — leave the grant unknown.
    }
  },

  // 拍板点 3: startup only preflights, so this is where the two TCC dialogs come from.
  // A false answer is the normal one (macOS shows its dialog, the user finishes in
  // System Settings), so the banner keeps a settings route open afterwards.
  request: async () => {
    set({ requested: true });
    try {
      await invoke<boolean>('request_capture_access');
    } catch (e) {
      console.warn('[permission] request_capture_access failed', e);
    }
    await get().check();
  },
}));
