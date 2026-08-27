// 正文字号三档（2026-08-27）—— 读设置、写 <html>。和 hooks/useTheme.ts 是同一对分工：
// 类型和常量在 lib/blockFont.ts（它谁都不引，所以 settingsStore 引得动它），碰 store 的那
// 一半在这里。
//
// ⛔ 只有主窗挂它。捕捉浮窗是另一个进程、里面没有块，字号对它没有意义（见 useTheme.ts 里
// 那段关于浮窗为什么读不到设置的注释）。

import { useEffect } from 'react';
import { applyBlockFont, type BlockFontSize } from '@/lib/blockFont';
import { useSettingsStore } from '@/stores/settingsStore';

export const useBlockFontSize = (): BlockFontSize => useSettingsStore((s) => s.blockFontSize);

/** ⚠️ 只认 `blockFontSize`，不等 `loaded`：设置没到之前它已经是「中」，也就是已发布版本的
 *  字号，第一帧画的就是老样子；选了别的档的用户晚一拍换过去。反过来会让每次启动都闪一下。 */
export const useAppliedBlockFont = (): void => {
  const size = useBlockFontSize();
  useEffect(() => {
    applyBlockFont(size, document.documentElement);
  }, [size]);
};
