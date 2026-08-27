import { create } from 'zustand';

// 休息提醒 (2026-08-19 second pass, Ocean) — the one copy of 「how long has this person been
// working, and are they on a break right now」.
//
// ⚠️ **A store and not the hook's return value, because two places need the same numbers and
// only one of them may own the timer.** `useBreakReminder` is mounted once, in App, and drives
// this; App reads `lockUntil` to put the lock up, and the sidebar's SpoolCard reads `activeMs`
// to draw the countdown Ocean asked for (「在…面板里显示连续工作的时常」). Mounting the hook a
// second time in the sidebar would give the library two independent streaks, both wrong.
//
// ⚠️ It is deliberately NOT persisted. A streak is about one sitting; restoring 「你已经工作了
// 47 分钟」 from a file after a relaunch would claim time the user spent somewhere else, which
// is the same lie lib/breakReminder's tick cap exists to prevent.

interface BreakStoreState {
  /** Active ms in the current sitting, republished on every tick of the reducer. */
  activeMs: number;
  /** ⭐ 2026-08-27（Ocean:「倒计时结束之后，总专注时间还看得见、还在往上加」）——
   *  **本次开机以来**的总专注时间。休息清 `activeMs`，⛔ 清不掉这个。
   *  ⚠️ 一样不落盘（理由见上面那段），所以侧边栏写的是「已专注」而**不是**「今天已专注」。 */
  totalMs: number;
  /** When the break lock lifts by itself. Null = not locked. ⚠️ A DEADLINE rather than a
   *  remaining-ms counter: the lock's own display ticks once a second, and a counter would
   *  drift against the wall clock every time the timer was throttled. */
  lockUntil: number | null;
  publish: (activeMs: number, totalMs: number) => void;
  lock: (until: number) => void;
  unlock: () => void;
}

export const useBreakStore = create<BreakStoreState>((set) => ({
  activeMs: 0,
  totalMs: 0,
  lockUntil: null,
  publish: (activeMs, totalMs) => set({ activeMs, totalMs }),
  // The streak is already zeroed by the reducer on the tick that fired, so the sidebar clock
  // reads 0 for the length of the break — which is true, and is what makes the count-up start
  // from the moment the user comes back rather than from the moment they were interrupted.
  // ⚠️ 这两条只把**这一坐**归零。⛔ `totalMs` 不动 —— 那正是 Ocean 要的「还在往上加」
  // 的那个数，休息一次就抹掉它等于这件事没做。
  lock: (until) => set({ lockUntil: until, activeMs: 0 }),
  unlock: () => set({ lockUntil: null, activeMs: 0 }),
}));
