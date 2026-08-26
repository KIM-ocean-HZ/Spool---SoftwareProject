import { loadApiKey, weeklyReviewViaApi } from '@/lib/ai/compress';
import { recordRun } from '@/lib/db/engineRuns';

/**
 * 用形态 C（`spool-ai` 子进程 + 用户自己填的端点）跑一次周回顾，并把它记进 `engine_runs`。
 *
 * ⚠️ **这一段本来长在 `ReviewBoard` 里。** 2026-08-26 搬出来，因为 `W2` 让自动那条路也能走
 * API —— 而「手动跑」和「自动跑」如果各记各的账，`engine_runs` 里就会出现两种形状的同一件事，
 * 而周回顾那一页只有一张列表。
 *
 * ⚠️ 材料**不在这儿拼** —— Rust 那边自己开库拼（digest 当历史 + 本周新加的块当新动作，
 * ⭐ 范围是 Ocean 拍的：「不是整个 pack」）。这里只负责端点、key、模型和记账。
 */
export interface ApiWeeklySettings {
  apiBaseUrl: string;
  apiModel: string;
  apiReasoning: string;
  apiTimeoutSecs: number;
}

export const runWeeklyReviewViaApi = async (s: ApiWeeklySettings): Promise<boolean> => {
  const startedAt = Date.now();
  const key = await loadApiKey();
  const out = await weeklyReviewViaApi({
    baseUrl: s.apiBaseUrl,
    apiKey: key,
    model: s.apiModel,
    reasoning: s.apiReasoning,
    timeoutSecs: s.apiTimeoutSecs,
  });
  await recordRun({
    action: 'weekly_review',
    // 周回顾读的是整个库，不属于任何一个项目 —— 和 CLI 那条一样。
    threadId: null,
    // ⚠️ 记「实际跑的是哪个模型」而不是一句「api」：按次付费的时候，
    // 「我以为在用 Flash」和「实际在用 Pro」差好几倍，而端点会回报真名。
    engine: out.model ?? s.apiModel,
    outcome: out.ok ? 'ok' : 'failed',
    resultText: out.text.trim() || null,
    detail: out.ok ? null : (out.message ?? null),
    blocksWritten: 0,
    proposalsQueued: 0,
    usage: {
      model: out.model ?? s.apiModel,
      costUsd: null,
      inputTokens: out.inputTokens || null,
      outputTokens: out.outputTokens || null,
    },
    startedAt,
    finishedAt: Date.now(),
  });
  return out.ok;
};
