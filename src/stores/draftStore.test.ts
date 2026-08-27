import { beforeEach, describe, expect, it } from 'vitest';
import { selectDraft, useDraftStore } from './draftStore';

// ⛔⛔ 这一组钉的是一个**会丢用户的字**的 bug（2026-08-27，Ocean:「在输入框打字，按 ⌘F，
// 草稿没了」）。根子在 LogView 是 `key={thread.id}` 挂的：查找跳到别的项目 = 整棵子树卸载
// 重建，Composer 那个 useState('') 跟着回到空串。
//
// ⚠️ 这里测的是「草稿活在组件树外面」这件事本身 —— 组件卸载重建在这套测试里没法演
// （没有 jsdom），但只要草稿是从这个 store 读的，卸载重建就影响不到它。⛔ 所以 Composer
// 里那个 `useDraftStore(selectDraft(threadId))` 不许改回本地 state。
describe('draftStore', () => {
  beforeEach(() => {
    useDraftStore.setState({ byThread: {} });
  });

  it('没写过的项目，草稿是空串', () => {
    expect(selectDraft('t1')(useDraftStore.getState())).toBe('');
  });

  it('切到别的项目再回来，草稿还在（⌘F 跳走再跳回来走的就是这条路）', () => {
    const { setDraft } = useDraftStore.getState();
    setDraft('t1', '写到一半的一句话');
    // 查找跳到 t2 —— Composer 在 t1 上卸载、在 t2 上重建。store 不认识组件，所以什么都没发生。
    expect(selectDraft('t2')(useDraftStore.getState())).toBe('');
    setDraft('t2', '另一个项目里的字');
    // 跳回 t1。
    expect(selectDraft('t1')(useDraftStore.getState())).toBe('写到一半的一句话');
    expect(selectDraft('t2')(useDraftStore.getState())).toBe('另一个项目里的字');
  });

  it('发出去只清这一个项目的草稿，别的项目一个字不动', () => {
    const { setDraft, clearDraft } = useDraftStore.getState();
    setDraft('t1', '这条要发出去');
    setDraft('t2', '这条还在写');
    clearDraft('t1');
    expect(selectDraft('t1')(useDraftStore.getState())).toBe('');
    expect(selectDraft('t2')(useDraftStore.getState())).toBe('这条还在写');
  });

  it('同一个值写第二遍不产生新状态（订阅它的 Composer 不会白重画）', () => {
    const { setDraft } = useDraftStore.getState();
    setDraft('t1', 'abc');
    const before = useDraftStore.getState().byThread;
    setDraft('t1', 'abc');
    expect(useDraftStore.getState().byThread).toBe(before);
  });

  it('清一个本来就没有草稿的项目，是空操作', () => {
    const before = useDraftStore.getState().byThread;
    useDraftStore.getState().clearDraft('never-typed-here');
    expect(useDraftStore.getState().byThread).toBe(before);
  });
});
