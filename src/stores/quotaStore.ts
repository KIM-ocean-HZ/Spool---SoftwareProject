import { create } from 'zustand';
import type { Tier } from '@/lib/ai/providers/types';

// Free-tier daily request ceilings (PLAN §6.1). Local Ollama is unlimited and not
// tracked.
export const DAILY_LIMITS = { groq: 14_400, gemini: 1_500 } as const;

const today = (): string => new Date().toISOString().slice(0, 10);

interface QuotaState {
  date: string;
  groq: number;
  gemini: number;
  record: (tier: Tier) => void;
}

// Today's AI usage (PLAN §6.5). In-memory only — a restart resets the counts, and a
// day rollover resets them too. Drives the read-only quota bars in the settings panel.
export const useQuotaStore = create<QuotaState>((set) => ({
  date: today(),
  groq: 0,
  gemini: 0,
  record: (tier) =>
    set((s) => {
      const base = s.date === today() ? s : { date: today(), groq: 0, gemini: 0 };
      if (tier === 'fast') return { ...base, groq: base.groq + 1 };
      if (tier === 'quality') return { ...base, gemini: base.gemini + 1 };
      return base; // local: unlimited, untracked
    }),
}));
