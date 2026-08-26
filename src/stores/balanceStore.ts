import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { loadApiKey } from '@/lib/ai/compress';
import { useSettingsStore } from '@/stores/settingsStore';

/**
 * API 那条路还剩多少钱 —— `X 批`（Ocean 2026-08-26：「能不能拿到用户的 api 剩余额度，
 * 目前使用 api 摩擦还是比较大，用户需要反复查看余额，但是尽可能保住不出网叙事」）。
 *
 * ⭐ **「不出网叙事」没被推翻。** 这一条走的还是那个 `spool-ai` 子进程、还是用户自己填的
 * 那个端点 —— 那句话现在的形状是「只有 spool-ai 会出去，而且只在你要它出去的时候」。
 * 触发它的只有两处：用户点「查一下」，和一次**已经出过网**的运行刚结束。
 * ⛔⛔ **没有定时器，也不许有。** 加一个定时刷新才是真的推翻那句话，那要先问 Ocean。
 *
 * ⚠️ 数字是**字符串**，⛔ 从头到尾不折算成 number：厂商回的是 `"25.50"`，
 * 过一次二进制浮点就可能变成 25.499999。这里只负责把它传到界面上印出来。
 */
interface BalanceOutcome {
  ok: boolean;
  currency: string;
  total: string;
  usable: boolean;
  kind: string | null;
  message: string | null;
  status: number | null;
}

/** ⭐ 三种状态，⛔ 不是两种。「这家不报余额」既不是成功也不是失败 —— 把它显示成 0，
 *  会让用户按着一个假余额去安排事情。 */
export type BalanceState =
  | { at: 'idle' }
  | { at: 'checking' }
  | { at: 'known'; currency: string; total: string; usable: boolean; checkedAt: number }
  | { at: 'unsupported' }
  | { at: 'failed'; message: string };

interface BalanceStore {
  state: BalanceState;
  /** 查一次。⚠️ 已经在查就不再叠一次 —— 用户连点三下不该变成三次请求。 */
  refresh: () => Promise<void>;
}

export const useBalanceStore = create<BalanceStore>((set, get) => ({
  state: { at: 'idle' },

  refresh: async () => {
    if (get().state.at === 'checking') return;
    const s = useSettingsStore.getState();
    // 总开关关着的时候一个请求都不发 —— 那个开关的意思就是「什么都不许出去」。
    if (!s.apiEngineEnabled) return;
    set({ state: { at: 'checking' } });
    try {
      const key = await loadApiKey();
      const out = await invoke<BalanceOutcome>('api_balance', {
        baseUrl: s.apiBaseUrl,
        apiKey: key,
      });
      if (out.ok) {
        set({
          state: {
            at: 'known',
            currency: out.currency,
            total: out.total,
            usable: out.usable,
            checkedAt: Date.now(),
          },
        });
      } else if (out.kind === 'unsupported') {
        set({ state: { at: 'unsupported' } });
      } else {
        set({ state: { at: 'failed', message: out.message ?? '' } });
      }
    } catch (e) {
      set({ state: { at: 'failed', message: e instanceof Error ? e.message : String(e) } });
    }
  },
}));
