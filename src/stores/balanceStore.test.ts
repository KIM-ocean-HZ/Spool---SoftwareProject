import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
const loadApiKey = vi.fn(async () => 'sk-test');
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
// ⚠️ 部分 mock：`settingsStore` 也从这个模块里读 `DEFAULT_LEVEL`，整个替掉会把它一起打断。
vi.mock('@/lib/ai/compress', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/compress')>()),
  loadApiKey: () => loadApiKey(),
}));

import { useBalanceStore } from './balanceStore';
import { useSettingsStore } from './settingsStore';

const reply = (o: Record<string, unknown>): void => {
  invoke.mockResolvedValue({
    ok: false,
    currency: '',
    total: '',
    usable: false,
    kind: null,
    message: null,
    status: null,
    ...o,
  });
};

describe('balanceStore (X 批)', () => {
  beforeEach(() => {
    invoke.mockReset();
    useBalanceStore.setState({ state: { at: 'idle' } });
    useSettingsStore.setState({ apiEngineEnabled: true, apiBaseUrl: 'https://api.deepseek.com' });
  });

  it('⛔ 总开关关着的时候一个请求都不发', async () => {
    useSettingsStore.setState({ apiEngineEnabled: false });
    await useBalanceStore.getState().refresh();
    expect(invoke).not.toHaveBeenCalled();
    expect(useBalanceStore.getState().state.at).toBe('idle');
  });

  it('把金额原样留成字符串', async () => {
    // ⛔ 不许折算成 number：'25.50' 过一次二进制浮点就可能变成 25.499999。
    reply({ ok: true, currency: 'CNY', total: '25.50', usable: true });
    await useBalanceStore.getState().refresh();
    const s = useBalanceStore.getState().state;
    expect(s.at).toBe('known');
    if (s.at === 'known') {
      expect(s.total).toBe('25.50');
      expect(s.currency).toBe('CNY');
    }
  });

  it('⭐「这家不报余额」是自己一种状态，⛔ 不是失败，也不是 0', async () => {
    reply({ kind: 'unsupported', message: 'no /user/balance', status: 404 });
    await useBalanceStore.getState().refresh();
    expect(useBalanceStore.getState().state.at).toBe('unsupported');
  });

  it('key 不对是一次失败，带着厂商原话', async () => {
    reply({ kind: 'auth', message: 'The endpoint refused the key (401).', status: 401 });
    await useBalanceStore.getState().refresh();
    const s = useBalanceStore.getState().state;
    expect(s.at).toBe('failed');
    if (s.at === 'failed') expect(s.message).toContain('401');
  });

  it('连点三下不会变成三次请求', async () => {
    let release: (v: unknown) => void = () => {};
    invoke.mockReturnValue(new Promise((r) => (release = r)));
    const first = useBalanceStore.getState().refresh();
    await useBalanceStore.getState().refresh();
    await useBalanceStore.getState().refresh();
    expect(invoke).toHaveBeenCalledTimes(1);
    release({ ok: true, currency: 'CNY', total: '1.00', usable: true, kind: null, message: null, status: null });
    await first;
  });
});
