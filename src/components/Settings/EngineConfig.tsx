import { invoke } from '@tauri-apps/api/core';
import { useEffect } from 'react';
import Toggle from '@/components/ui/Toggle';
import { useT } from '@/lib/i18n';
import { useEngineStore } from '@/stores/engineStore';
import { useSettingsStore } from '@/stores/settingsStore';

// DESIGN_WORKBENCH §3.5 / §9.2 R5 — 「设置里 ai 引擎单独一项，不和 mcp 挤」.
//
// Ocean's #2 named the disease and §3.5 named the cause: the MCP page had two unrelated
// jobs side by side, sharing one word.
//
//   接出去 — hand Spool's library to an AI client you use elsewhere.  → the MCP tab
//   请进来 — let a CLI on this machine do maintenance work for you.   → this tab
//
// §3.5 was half-done: the actions moved to the rail, the page never split. This is the other
// half. What stays here is what you set once — detection, whether the actions show at all,
// the per-run ceiling. What is NOT here is engine and model: those belong next to the runs
// they pay for, which is the rail (§9.3 #3), so this page says where to find them instead of
// making the user carry a decision back from a dialog.
export default function EngineConfig() {
  const t = useT();
  const aiEngineActionsEnabled = useSettingsStore((s) => s.aiEngineActionsEnabled);
  const aiEngineTimeoutSecs = useSettingsStore((s) => s.aiEngineTimeoutSecs);
  const mcpEnabled = useSettingsStore((s) => s.mcpEnabled);
  const mcpWriteEnabled = useSettingsStore((s) => s.mcpWriteEnabled);
  const update = useSettingsStore((s) => s.update);
  // §1.4: null = still probing. Detection is a Rust round-trip, so it lands a beat after
  // the panel opens.
  const engineStatus = useEngineStore((s) => s.status);
  const probeEngine = useEngineStore((s) => s.probe);

  // §2.1: re-probe each time the panel opens — the user may have just installed it.
  useEffect(() => {
    void probeEngine();
  }, [probeEngine]);

  return (
    <div className="py-2.5">
      <div className="text-sm text-ink">{t('本机 AI 引擎')}</div>
      <div className="mt-0.5 text-xs text-muted">
        {t('装了 Claude Code 或 Codex 之后，右侧栏里就能让它替你整理项目——用你自己已经登录的那个 CLI 跑，Spool 不存任何 API key，也不联网。')}
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        {engineStatus === null ? (
          <span className="text-muted">{t('检测中…')}</span>
        ) : engineStatus.available ? (
          <span style={{ color: 'var(--status-active)' }}>
            {t('✓ 已检测到')}{' '}
            {engineStatus.engines.map((e) => `${e.kind} ${e.version ?? ''}`.trim()).join(t('、'))}
          </span>
        ) : (
          <>
            <span className="text-muted">{t('没检测到 Claude Code，也没检测到 Codex')}</span>
            {/* §7.4: when nothing is installed, BOTH routes are shown — this line is the
                only place a user without a Claude subscription finds out the slot exists at
                all. Neither is presented as free: 2026-08-06 measured Codex's free tier
                running out and locking the account for a month. */}
            {(['claude-code', 'codex'] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() =>
                  void invoke('open_mcp_client_page', { client: c }).catch((e) =>
                    console.warn('[settings] open install page failed', e),
                  )
                }
                className="text-accent underline-offset-2 hover:underline"
              >
                {c === 'codex' ? t('装 Codex') : t('装 Claude Code')}
              </button>
            ))}
          </>
        )}
      </div>

      {engineStatus?.available && (
        <>
          {/* §3.5's 「设置页只留一行指路」. */}
          <p className="mt-2 rounded border border-line bg-paper-2/40 px-2.5 py-1.5 text-[11px] leading-relaxed text-muted">
            {t('用哪个引擎、用哪个模型、这周花了多少——都在右侧栏最上面那一行，就在动作旁边。')}
          </p>

          {/* §7.3 asked for the degradation to be stated plainly rather than papered over.
              Measured against codex-cli 0.146.1: its shell tool cannot be switched off (there
              is no config key for it), where claude's whitelist denies Bash outright.
              Read-only sandboxing is the lever that does exist, and it is passed every run. */}
          {engineStatus.selected === 'codex' && (
            <div className="mt-2 rounded border border-line bg-paper-2/40 px-2.5 py-1.5 text-[11px] leading-relaxed text-muted">
              {t('Codex 这条路有一处关不掉：它自带的终端工具没法摘掉（Claude Code 那边可以）。Spool 能做的是把它锁成只读——它读得到东西，但改不了你机器上的文件。')}
            </div>
          )}

          <div className="mt-2 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-sm text-ink">{t('显示 AI 维护动作')}</div>
              <div className="mt-0.5 text-xs text-muted">
                {t('需要 MCP 那一页的两个开关都打开——AI 维护的产出是写回一块，读权限不够用。')}
              </div>
            </div>
            <Toggle
              checked={aiEngineActionsEnabled}
              onChange={(v) => void update({ aiEngineActionsEnabled: v })}
            />
          </div>
          {/* The gate is three-way (lib/engine/gate.ts) and two thirds of it live on another
              tab now, so say which one is shut rather than leaving the rail mysteriously
              empty with this switch on. */}
          {aiEngineActionsEnabled && !(mcpEnabled && mcpWriteEnabled) && (
            <p className="mt-1 text-[11px] text-muted">
              {t('现在还不会出现：MCP 那一页的「MCP 服务」和「允许 AI 写入」要都打开。')}
            </p>
          )}

          <div className="mt-2 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-sm text-ink">{t('单次最长运行时间')}</div>
              <div className="mt-0.5 text-xs text-muted">
                {t('超过就停下（已经写进去的块会留着——Spool 只追加，不回滚）。上限 10 分钟。')}
              </div>
            </div>
            <select
              value={aiEngineTimeoutSecs}
              onChange={(e) => void update({ aiEngineTimeoutSecs: Number(e.target.value) })}
              className="flex-none rounded border border-line bg-paper px-2 py-0.5 text-xs text-ink outline-none focus:border-accent"
            >
              {[60, 180, 300, 600].map((s) => (
                <option key={s} value={s}>
                  {s / 60} {t('分钟')}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
    </div>
  );
}
