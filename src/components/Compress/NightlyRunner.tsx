import { useEffect } from 'react';
import { nightlyDue, useCompressStore } from '@/stores/compressStore';
import { useSettingsStore } from '@/stores/settingsStore';

// ⑥ 睡前排队的「调度器」（WORKPLAN-2026-08-20 §9.6.4）—— 全部就是下面这十几行。
//
// ⛔ **没有 launchd，没有后台常驻。** v1 就做成「应用开着的时候到点跑；到点没开，
// 下次启动时补跑」，这样整个调度器表面根本不用长出来：
//
//   * v0.7 §10.4 已经把提醒调度器定为**唯一真正新增的表面、排在最后**，
//     这里不许偷偷再造一个；
//   * 而且这台机器上 launchd 碰 `~/Desktop` 会**永久卡死**（无报错、无日志，
//     `launchctl` 只显示 running），这个仓库正好在 Desktop 下。
//
// ⚠️ 一分钟看一次。⛔ 不要为了「准时」把它改成秒级：这件事的时间精度是「今晚」，
// 而每一次 tick 都要读一次 store。
export default function NightlyRunner() {
  const enabled = useSettingsStore((s) => s.apiEngineEnabled);
  const at = useSettingsStore((s) => s.compressNightlyAt);
  const lastRunDay = useSettingsStore((s) => s.compressLastRunDay);
  const queue = useSettingsStore((s) => s.compressQueue);
  const loaded = useSettingsStore((s) => s.loaded);
  const runQueue = useCompressStore((s) => s.runQueue);

  useEffect(() => {
    // ⚠️ `loaded` 不能省：settings.json 读回来之前，`compressLastRunDay` 是空字符串，
    // 那会让「今天还没跑过」在每次冷启动的一瞬间成立，于是启动即扣钱。
    if (!loaded || !enabled || queue.length === 0 || !at) return;
    const tick = () => {
      if (nightlyDue(at, useSettingsStore.getState().compressLastRunDay, new Date())) {
        void runQueue();
      }
    };
    tick(); // 启动时先看一眼 —— 这一下就是「到点没开，下次启动补跑」。
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [loaded, enabled, at, lastRunDay, queue.length, runQueue]);

  return null;
}
