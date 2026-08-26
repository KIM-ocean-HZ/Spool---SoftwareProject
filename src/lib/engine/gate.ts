// DESIGN_AI_ENGINE §1.1 — the render gate for the "让 AI 维护" menu group.
//
// Three conditions, all required: the Claude Code CLI was detected, the MCP service
// switch is on, and "允许 AI 写入" is on. The actions write blocks through the existing
// MCP surface, so without the write switch they cannot do the thing they promise —
// showing them would be an offer Spool can't keep.
//
// Any condition unmet: the group does not render at all. No greyed-out entries, no
// explanatory tooltip (§1.1 安静原则 — a feature that needs a CLI the user has never
// heard of should be invisible, not nagging). The Settings page is where the detection
// state is visible, and that is the only place it appears.

export interface EngineGateInput {
  /** Whether `claude` was found on this machine (Rust: ai_engine_status). */
  cliAvailable: boolean;
  mcpEnabled: boolean;
  mcpWriteEnabled: boolean;
  /** §1.4 user opt-out. Default true — meaningful only once the CLI is present. */
  actionsEnabled: boolean;
  /**
   * §1.2: whether THIS thread already has a task running or waiting.
   *
   * M1 read this as "anything is running anywhere", which was right when a second click
   * was simply refused. M2 has a queue, and a global lock would make it unreachable —
   * you could never line up a second project's tidy-up while the first ran. The rule that
   * survives is the one the queue is actually for: one task per thread, because two
   * distils of the same project produce two conclusions off the same material.
   */
  busyOnThisThread?: boolean;
}

export const canShowEngineActions = (g: EngineGateInput): boolean =>
  g.cliAvailable && g.mcpEnabled && g.mcpWriteEnabled && g.actionsEnabled;

// Visible but not clickable, so the user can see why nothing happens on a second click.
// Distinct from the hidden case above: hiding mid-run would make the menu jump.
export const engineActionsDisabled = (g: EngineGateInput): boolean =>
  g.busyOnThisThread === true;

/**
 * `W2` —— 自动回顾**实际**走哪条路。
 *
 * ⚠️ 存的那个偏好可能指着一条**今天走不通**的路：他选了 CLI 然后把 CLI 卸了，或者选了
 * API 然后把总开关关了。⛔ 那时候不能什么都不做 —— 用户打开的是「每周自动回顾一次」，
 * 一个不声不响什么也不跑的开关，是这个项目最怕的那类 bug。
 *
 * ⭐ 所以能走的那条就走，**但界面必须把「实际走的是哪条」写出来**（`ReviewBoard` 那一行）。
 * 退让是可以的，⛔ 悄悄退让不行 —— 另一条路是按字数花钱的。
 *
 * `null` = 两条都走不通,那就一条都不跑。
 */
export const effectiveAutoRoute = (
  preferred: 'cli' | 'api',
  cliReady: boolean,
  apiOn: boolean,
): 'cli' | 'api' | null => {
  if (preferred === 'api') return apiOn ? 'api' : cliReady ? 'cli' : null;
  return cliReady ? 'cli' : apiOn ? 'api' : null;
};
