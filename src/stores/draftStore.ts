import { create } from 'zustand';

// 未发出的草稿，**按项目存**（2026-08-27，Ocean:「在输入框打字，按 ⌘F，草稿没了」）。
//
// ⚠️⚠️ 为什么草稿不能放在 Composer 自己的 useState 里：`LogView` 是用 `key={thread.id}`
// 挂的（ThreadView/index.tsx），React 遇到新的 key 会把整棵子树**卸载重建** —— Composer
// 跟着重建，它那个 `useState('')` 也就回到空串。而「切到别的项目」不只有点侧边栏一条路：
//   - 查找跳到别的项目里的命中（searchStore.goToHit 会 select 那个项目）；
//   - 全局搜索面板里按 ↵ 或点一条结果；
//   - 项目切到「块摘要 / 压缩 / 过期检测」页签（那时 LogView 整个不画）。
// 上面每一条都会把正在打的字扔掉，而且**没有任何提示**。
//
// ⛔ 修法不是在 Composer 里加一个 ref 兜着 —— ref 也跟着组件一起被卸载。草稿必须活在
// 组件树外面，这个 store 就是那个外面。
//
// ⚠️ 只在内存里，⛔ 不落盘：一条没发出去的草稿是「这一坐正在写的东西」，重启之后还把它
// 端出来，和 breakStore 那条「重启后还显示『你已经工作了 47 分钟』是在替用户撒谎」是同一
// 类问题。真要跨重启留住，那是另一件事（要先决定它算不算库里的内容）。

interface DraftState {
  /** threadId → 还没发出去的那段字。没有这一格 = 这个项目没有草稿。 */
  byThread: Record<string, string>;
  setDraft: (threadId: string, value: string) => void;
  /** 发出去之后清掉。⚠️ 只清这一个项目的，别的项目的草稿一个字都不动。 */
  clearDraft: (threadId: string) => void;
}

export const useDraftStore = create<DraftState>((set) => ({
  byThread: {},
  setDraft: (threadId, value) =>
    set((s) => (s.byThread[threadId] === value ? s : { byThread: { ...s.byThread, [threadId]: value } })),
  clearDraft: (threadId) =>
    set((s) => {
      if (!(threadId in s.byThread)) return s;
      const next = { ...s.byThread };
      delete next[threadId];
      return { byThread: next };
    }),
}));

/** 这个项目现在的草稿。⚠️ 抽出来是为了 Composer 的选择器和测试读的是同一句话。 */
export const selectDraft =
  (threadId: string) =>
  (s: DraftState): string =>
    s.byThread[threadId] ?? '';
