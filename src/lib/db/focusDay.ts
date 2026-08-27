import { Store } from '@tauri-apps/plugin-store';
import type { BreakState } from '@/lib/breakReminder';

// 今天专注了多久，跨重启记住（2026-08-27 第二轮，Ocean:「可以做成今天，按天算」）。
//
// ⚠️⚠️ **存在自己的一个文件里，⛔ 不进 spool.db，也 ⛔ 不进 settings.json。** 三个理由：
//
//   1. **它不是库里的内容。** 库是可以导出、搬到另一台电脑上去的（DESIGN_LIBRARY_TRANSFER）。
//      「今天专注了 47 分钟」跟着库搬到新机器上，说的是另一台电脑前的另一段时间 —— 那是假话。
//   2. **它不是设置。** settings.json 存的是「用户选了什么」，而这是一个自己会变的读数；
//      混在一起，下一个人读那个文件时会以为它可以手改。
//   3. **动 schema 是这个库最贵的操作**（记忆 spool-db-wipe-incident）。为一个随时可以丢的
//      数字加一张表、抬一次 user_version，代价和收益完全不成比例。
//
// ⇒ `focus.json`，一个文件三个数。读不到就当今天从零开始 —— 这个数据的每一种损坏后果都是
// 「今天的数字小了」，⛔ 没有一种是「用户的东西没了」。

const FILE = 'focus.json';
const KEY = 'today';

/** 落盘的那三个数。⚠️ `activeMs`（这一坐）**不在里面**，那条老理由一个字没变：
 *  重启之后还端出「你已经连续工作了 47 分钟」是在替用户撒谎。 */
export interface FocusDay {
  dayKey: string;
  totalMs: number;
  /** 上一次真的记上时间是什么时候 —— 「跨过午夜算不算新的一天」全靠它，
   *  见 lib/breakReminder.ts 的 shouldRollDay。 */
  lastActiveAt: number;
}

let storePromise: Promise<Store> | null = null;
const getStore = (): Promise<Store> => {
  if (!storePromise) storePromise = Store.load(FILE);
  return storePromise;
};

const isFocusDay = (v: unknown): v is FocusDay => {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.dayKey === 'string' &&
    typeof o.totalMs === 'number' &&
    Number.isFinite(o.totalMs) &&
    o.totalMs >= 0 &&
    typeof o.lastActiveAt === 'number' &&
    Number.isFinite(o.lastActiveAt)
  );
};

/** 读回昨天/今天留下的那一条。读不到、或者形状不对 → null（当作今天从零开始）。 */
export const loadFocusDay = async (): Promise<FocusDay | null> => {
  try {
    const store = await getStore();
    const raw = await store.get(KEY);
    return isFocusDay(raw) ? raw : null;
  } catch (e) {
    // ⚠️ 读不到不是错误路径的尽头：这个功能整体是「锦上添花」，⛔ 不该让它挡住启动。
    console.warn('[focus] load failed', e);
    return null;
  }
};

/** 写回去。⚠️ 调用方负责别每 tick 都写 —— 只在数字真的变了的时候写。 */
export const saveFocusDay = async (day: FocusDay): Promise<void> => {
  try {
    const store = await getStore();
    await store.set(KEY, day);
    await store.save();
  } catch (e) {
    console.warn('[focus] save failed', e);
  }
};

/** 落盘的那一条 → reducer 的起始状态。⚠️ `lastTickAt` 一定是 null：
 *  重启之后这一坐是新的，⛔ 不许把关机那段时间记成工作。 */
export const restoreBreakState = (day: FocusDay | null): Partial<BreakState> =>
  day === null
    ? {}
    : { totalMs: day.totalMs, dayKey: day.dayKey, lastActiveAt: day.lastActiveAt };
