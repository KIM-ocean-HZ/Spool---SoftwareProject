import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useEffect, useState } from 'react';
import Toggle from '@/components/ui/Toggle';
import { useT } from '@/lib/i18n';
import { ENGINE_LABEL, useEngineStore } from '@/stores/engineStore';
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
//
// ⚠️ 2026-08-18 (Ocean, after living with it): 「mac 上面的 AI 引擎设置部分也很凌乱……看着像是
// 开发者测试使用的，而不是给用户使用的商业 app 设置」. Everything true stayed true; what changed
// is what the page says while it is RESTING. Two versions of that mistake were on it:
//
//   ① raw CLI output as the status line — 「claude 2.1.233、codex 0.147.0、gemini 0.54.4」.
//      Three executable names and three build numbers is a terminal talking, and none of it
//      answers the only question the line is for: is this working, and with what. The
//      product names answer it; the versions moved behind 详细说明, where a version number is
//      what you want.
//   ② a resting page that explained itself. The path box, the two engines' limits, the
//      pointer at the rail — each earned its place when it was written and none of them is
//      read twice. They are one disclosure now.
//
// The rule that decides what stays: a control the user CHANGES, or a fact they need before
// they can decide anything. Everything else is 详细说明.
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
  const aiEnginePath = useSettingsStore((s) => s.aiEnginePath);
  // 2026-08-17 (Ocean): 「这些都可以放进二级窗口里详细教学」 — one disclosure for the whole
  // explanatory half, so the resting page is a status line and two controls.
  const [helpOpen, setHelpOpen] = useState(false);

  // §2.1: re-probe each time the panel opens — the user may have just installed it.
  useEffect(() => {
    void probeEngine();
  }, [probeEngine]);

  const detected = engineStatus?.engines ?? [];

  return (
    <div className="py-2.5">
      <div className="text-sm text-ink">{t('本机 AI 引擎')}</div>
      <div className="mt-0.5 text-xs text-muted">
        {t('装了 Claude Code、Codex 或 Gemini CLI，就能让它替你整理项目。用你自己已经登录的那个，Spool 不存 API key。')}
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        {engineStatus === null ? (
          <span className="text-muted">{t('检测中…')}</span>
        ) : engineStatus.available ? (
          // Product names, not executables (see the ① note above). 「在用」 rather than
          // 「检测到」 when more than one is present: which of them a run would actually pick
          // is the fact the user came for, and it is not the same as what is installed.
          <span style={{ color: 'var(--status-active)' }}>
            {detected.length > 1 && engineStatus.selected
              ? t('✓ 已连接 {name}（还装了另外 {n} 个）', {
                  name: ENGINE_LABEL[engineStatus.selected],
                  n: detected.length - 1,
                })
              : t('✓ 已连接 {name}', {
                  name: ENGINE_LABEL[engineStatus.selected ?? detected[0]?.kind ?? 'claude'],
                })}
          </span>
        ) : (
          <>
            <span className="text-muted">{t('没检测到 Claude Code、Codex 或 Gemini CLI')}</span>
            {/* §7.4: when nothing is installed, EVERY route is shown — this line is the only
                place a user without a Claude subscription finds out the slot exists at all.
                None is presented as free: 2026-08-06 measured Codex's free tier running out
                and locking the account for a month, and 2026-08-10 measured Gemini's at 20
                requests per model per day. Saying 免费 here would send a user down a path
                that stops working on their first serious run. */}
            {(['claude-code', 'codex', 'gemini'] as const).map((c) => (
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
                {c === 'codex' ? t('装 Codex') : c === 'gemini' ? t('装 Gemini CLI') : t('装 Claude Code')}
              </button>
            ))}
          </>
        )}
      </div>

      {/* The two controls — the only things on this page a user comes here to change. */}
      {engineStatus?.available && (
        <>
          <div className="mt-2.5 flex items-center justify-between gap-4">
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

      {/* 二级：everything that is read once. Ocean 2026-08-17 asked for the teaching to live
          here (「用户……根本不知道需要什么,或者 api key 要放在哪里」); 2026-08-18 moved the rest
          of the prose in beside it. */}
      <div className="mt-3 border-t border-line pt-2">
        <button
          type="button"
          onClick={() => setHelpOpen((v) => !v)}
          className="text-xs text-muted transition-colors hover:text-accent"
        >
          {helpOpen ? '▾ ' : '▸ '}
          {t('详细说明：要装什么、装在哪、各家的限制')}
        </button>
        {helpOpen && (
          <div className="mt-2 space-y-2.5">
            <div className="space-y-1.5 text-[11px] leading-relaxed text-ink-2">
              <p>
                {t('引擎不是 Spool 的一部分，是你自己装在电脑上的命令行工具（Claude Code / Codex / Gemini CLI）。装好之后在终端里登录一次它自己的账号，Spool 就能借它干活。')}
              </p>
              <p>
                {t('所以 Spool 里没有填 API key 的地方，以后也不会有：key 和登录状态都在那个工具自己的目录里（比如 Gemini 是 ~/.gemini/.env），Spool 不存、也读不到。你的账单也走那边。')}
              </p>
              <p className="text-muted">
                {t('不装也没关系——AI 那半边主要走 MCP（上一页），那条路不需要这些。')}
              </p>
            </div>

            {/* The version numbers Ocean saw on the resting page. They belong to this half:
                nobody needs a build number to know whether the feature works, and everybody
                who asks for one wants it exactly here. */}
            {detected.length > 0 && (
              <ul className="space-y-0.5 font-mono text-[10.5px] leading-relaxed text-muted">
                {detected.map((e) => (
                  <li key={e.kind} className="truncate" title={e.path}>
                    {ENGINE_LABEL[e.kind]} {e.version ?? ''} · {e.path}
                  </li>
                ))}
              </ul>
            )}

            {/* §3.5's 「设置页只留一行指路」. */}
            {engineStatus?.available && (
              <p className="text-[11px] leading-relaxed text-muted">
                {t('用哪个引擎、用哪个模型、这周花了多少——都在右侧栏最上面那一行，就在动作旁边。')}
              </p>
            )}

            {/* §7.3 asked for the degradation to be stated plainly rather than papered over.
                Measured against codex-cli 0.146.1: its shell tool cannot be switched off (there
                is no config key for it), where claude's whitelist denies Bash outright.
                Read-only sandboxing is the lever that does exist, and it is passed every run. */}
            {detected.some((e) => e.kind === 'codex') && (
              <p className="text-[11px] leading-relaxed text-muted">
                {t('Codex 这条路有一处关不掉：它自带的终端工具没法摘掉（Claude Code 那边可以）。Spool 能做的是把它锁成只读——它读得到东西，但改不了你机器上的文件。')}
              </p>
            )}

            {/* Same rule as the codex line above (§7.3: state the degradation plainly). Both
                sentences here are measurements from 2026-08-10, not caveats-in-general: the
                quota is 20 requests per model per day, and one follow-up run spends all of
                them. §7.4's standing rule is why the word 免费 never appears alone. */}
            {detected.some((e) => e.kind === 'gemini') && (
              <p className="text-[11px] leading-relaxed text-muted">
                {t('Gemini CLI 走的是 Gemini API 的免费额度：每个模型每天大约 20 次请求。压缩和体检够用，联网跟进不够——所以那一项在这个引擎上不出现。API key 配在 gemini 自己那里（~/.gemini/.env），Spool 不存、也读不到。')}
              </p>
            )}

            {/* §1.4 的对面:一次搜不到就没辙了,是 Ocean 08-17 说的「被动搜索」。这一行是主动的
                那半边 —— 也是这一整页最少被用到的一个控件，所以它在二级里。 */}
            <div className="border-t border-line pt-2">
              <div className="text-xs text-ink">{t('手动指定 CLI 路径')}</div>
              <div className="mt-0.5 text-[11px] leading-relaxed text-muted">
                {t('装完这里还是写「没检测到」，多半是它装在了 Spool 没找的地方。终端里敲 which claude（或 codex / gemini）看一眼路径，填到下面那一行就行。')}
              </div>
              <div className="mt-0.5 text-[11px] leading-relaxed text-muted">
                {t('只在没检测到、但你确定装了的时候用。文件名要还是 claude / codex / gemini——Spool 靠它认出是哪个引擎。')}
              </div>
              <div className="mt-1 flex items-center gap-1">
                <input
                  value={aiEnginePath ?? ''}
                  onChange={(e) => void update({ aiEnginePath: e.target.value || null })}
                  onBlur={() => void probeEngine()}
                  placeholder={t('留空 = 自动找')}
                  spellCheck={false}
                  className="min-w-0 flex-1 rounded border border-line bg-paper px-2 py-1 font-mono text-[11px] text-ink outline-none focus:border-accent"
                />
                <button
                  type="button"
                  onClick={() => {
                    void (async () => {
                      const picked = await open({ multiple: false, directory: false });
                      if (typeof picked === 'string') {
                        await update({ aiEnginePath: picked });
                        await probeEngine();
                      }
                    })();
                  }}
                  className="flex-none rounded-md border border-line-strong bg-paper px-2.5 py-1 text-xs text-ink-2 transition-colors hover:border-accent hover:text-accent"
                >
                  {t('选文件')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Outside the disclosure on purpose: a path that was typed and did not work is not a
          detail, and the box that holds it may be folded away by the time the probe answers. */}
      {aiEnginePath && engineStatus?.available === false && (
        <p className="mt-1 text-[11px]" style={{ color: 'var(--urgent)' }}>
          {t('这个路径没认出来：要么文件不在，要么名字不是 claude / codex / gemini，要么它跑 --version 跑不通。')}
        </p>
      )}
    </div>
  );
}
