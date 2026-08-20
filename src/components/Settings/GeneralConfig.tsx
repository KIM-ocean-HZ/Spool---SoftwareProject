import { useState } from 'react';
import Toggle from '@/components/ui/Toggle';
import { WORK_MINUTE_OPTIONS, type WorkMinutes } from '@/lib/breakReminder';
import { loadDemoProject } from '@/lib/db/client';
import { THEMES, type Theme } from '@/lib/theme';
import { useSettingsStore } from '@/stores/settingsStore';
import { useThreadsStore } from '@/stores/threadsStore';
import { useT } from '@/lib/i18n';

// 情人节限定版 (2026-08-19) — the switch's labels. Ocean asked for 「中英文都支持」, so these go
// through `t()` like everything else rather than being hard-coded display names.
// ⚠️ The 经典 label must keep saying 经典 / Classic and nothing more expressive. It is the
// default and the shipped look; a label that sold the other one ('普通' / 'Plain') would make
// returning to the released appearance feel like a downgrade.
const THEME_LABEL: Record<Theme, string> = {
  classic: '经典',
  valentine: '情人节',
};

// General settings (PLAN_EN.md §9.12): language, launch at login, attachment
// auto-extraction. 任务三 #2 (2026-07-12): the MCP block moved to its own tab and
// clear-all-data to 高级 — this tab is the short everyday page.
export default function GeneralConfig() {
  const t = useT();
  // WORKPLAN-2026-08-20 §2.3. A fresh install seeds this project automatically; the button
  // is for the libraries that already existed when it landed, and for anyone who deleted
  // the sample and wants it back. It only ever INSERTS — see demoSeed.ts on why that
  // distinction matters for a populated database.
  const [demoState, setDemoState] = useState<'idle' | 'loading' | 'done'>('idle');
  const launchAtLogin = useSettingsStore((s) => s.launchAtLogin);
  const setLaunchAtLogin = useSettingsStore((s) => s.setLaunchAtLogin);
  const autoExtractAttachments = useSettingsStore((s) => s.autoExtractAttachments);
  const language = useSettingsStore((s) => s.language);
  const theme = useSettingsStore((s) => s.theme);
  const breakReminderEnabled = useSettingsStore((s) => s.breakReminderEnabled);
  const breakWorkMinutes = useSettingsStore((s) => s.breakWorkMinutes);
  const update = useSettingsStore((s) => s.update);
  // 二级 disclosure, same shape EngineConfig uses: the evidence is read once and then never
  // again, so it must not sit in the resting page beside a switch that is touched often.
  const [studyOpen, setStudyOpen] = useState(false);

  return (
    <div>
      {/* Language switch (2026-07-07): zh is the product default; en flips every surface
          via lib/i18n. Rendered bilingually on purpose so it's findable in either. */}
      <div className="flex items-center justify-between gap-4 py-2.5">
        <div className="min-w-0">
          <div className="text-sm text-ink">语言 / Language</div>
          <div className="mt-0.5 text-xs text-muted">{t('界面语言。切换立即生效。')}</div>
        </div>
        <div className="flex flex-none items-center gap-1">
          {(['zh', 'en'] as const).map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => void update({ language: lang })}
              className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                language === lang
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-line bg-paper text-muted hover:border-line-strong hover:text-ink'
              }`}
            >
              {lang === 'zh' ? '中文' : 'English'}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-line" />

      {/* 情人节限定版 (2026-08-19, Ocean: 「版本需要可以随便调整」). Directly under the language
          switch because it is the same kind of control — the one thing on this page that changes
          how everything looks rather than what it does — and because both take effect instantly
          with no restart.
          ⚠️ Same markup as the language switch above, deliberately. Two adjacent pickers that
          are the same thing should not be two different widgets. */}
      <div className="flex items-center justify-between gap-4 py-2.5">
        <div className="min-w-0">
          <div className="text-sm text-ink">{t('外观')}</div>
          <div className="mt-0.5 text-xs text-muted">
            {t('配色、标题字体和背景。切换立即生效，不影响你存的东西。')}
          </div>
        </div>
        <div className="flex flex-none items-center gap-1">
          {THEMES.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => void update({ theme: name })}
              className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                theme === name
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-line bg-paper text-muted hover:border-line-strong hover:text-ink'
              }`}
            >
              {t(THEME_LABEL[name])}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-line" />

      {/* 休息提醒 (2026-08-19 second pass, Ocean: 「设置里面可以关闭休息提醒,做成两个 appearance 都有
          的功能」). ⚠️ This is the ONE control on this page that changes what the app DOES rather
          than how it looks, which is why it sits below the two appearance rows rather than
          between them. It is also the only part of 情人节限定版 that reaches 经典 users — the
          earlier 「只在情人节版」 ruling covered it and he reversed that half by name. */}
      <div className="flex items-center justify-between gap-4 py-2.5">
        <div className="min-w-0">
          <div className="text-sm text-ink">{t('休息提醒')}</div>
          <div className="mt-0.5 text-xs text-muted">
            {t('连续工作到点，窗口会锁上 5 分钟，提醒你站起来活动一下。两种外观都有。')}
          </div>
        </div>
        <Toggle
          checked={breakReminderEnabled}
          onChange={(v) => void update({ breakReminderEnabled: v })}
        />
      </div>

      {breakReminderEnabled && (
        <div className="flex items-center justify-between gap-4 pb-2.5">
          <div className="min-w-0">
            <div className="text-xs text-ink-2">{t('连续工作多久提醒一次')}</div>
            <div className="mt-0.5 text-xs text-muted">
              {t('休息固定 5 分钟——研究里三种节奏都是 5 分钟，变的只有工作时长。')}
            </div>
          </div>
          <select
            value={breakWorkMinutes}
            onChange={(e) =>
              void update({ breakWorkMinutes: Number(e.target.value) as WorkMinutes })
            }
            className="flex-none rounded border border-line bg-paper px-2 py-0.5 text-xs text-ink outline-none focus:border-accent"
          >
            {WORK_MINUTE_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {t('{n} 分钟', { n: m })}
                {m === 60 ? t('（推荐）') : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* The evidence, behind one disclosure. Ocean asked for it by name (「设置里面给出论文证明」)
          and it is what makes 30 / 60 / 120 the three numbers on offer rather than a guess.
          ⚠️ The citation itself is NOT run through t() — a bibliographic reference is the same
          string in every language, and translating a journal's name would make it unfindable. */}
      <div className="pb-2.5">
        <button
          type="button"
          onClick={() => setStudyOpen((v) => !v)}
          className="text-xs text-muted transition-colors hover:text-accent"
        >
          {studyOpen ? '▾ ' : '▸ '}
          {t('为什么是 60 分钟：近两万人的研究怎么说')}
        </button>
        {studyOpen && (
          <div className="mt-1.5 rounded-md border border-line bg-paper-2/40 px-3 py-2">
            <p className="text-xs leading-relaxed text-ink-2">
              {t('发表于 2026 年最新一期《英国运动医学杂志》上的一项研究，让近两万名成年人在真实的工作环境里试了三种节奏：每 30、60 或 120 分钟起来活动 5 分钟。')}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-2">
              {t('结果是：30 分钟一次在减轻疲劳上效果最强，但在实际工作中往往让人觉得太频繁、难以长年坚持。综合「提升心情、缓解疲劳」与「保持工作效率不下降」这两个维度，每 60 分钟活动 5 分钟被证明是最能被大众接受、也最能长期做下去的「黄金频率」。')}
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              Diaz, K. M., et al. (2026). Evaluating movement breaks as a public health strategy
              to mitigate the harms of prolonged sitting: a large-scale pragmatic intervention.{' '}
              <span className="italic">British Journal of Sports Medicine</span>.
            </p>
          </div>
        )}
      </div>

      <div className="border-t border-line" />

      <div className="flex items-center justify-between gap-4 py-2.5">
        <div className="min-w-0">
          <div className="text-sm text-ink">{t('开机启动')}</div>
          <div className="mt-0.5 text-xs text-muted">{t('登录时自动运行,捕捉快捷键随时可用')}</div>
        </div>
        <Toggle checked={launchAtLogin} onChange={(v) => void setLaunchAtLogin(v)} />
      </div>

      <div className="border-t border-line" />

      <div className="border-t border-line" />

      <div className="flex items-center justify-between gap-4 py-2.5">
        <div className="min-w-0">
          <div className="text-sm text-ink">{t('载入示例项目')}</div>
          <div className="mt-0.5 text-xs text-muted">
            {t('一个已经攒了几周的项目，用来看打包出来是什么样。不需要了整条删掉即可。')}
          </div>
        </div>
        <button
          type="button"
          disabled={demoState !== 'idle'}
          onClick={() => {
            setDemoState('loading');
            void (async () => {
              try {
                const id = await loadDemoProject(language === 'en' ? 'en' : 'zh');
                await useThreadsStore.getState().loadAll();
                if (id) useThreadsStore.getState().select(id);
                setDemoState('done');
              } catch (e) {
                console.error('[demo] load failed', e);
                setDemoState('idle');
              }
            })();
          }}
          className="flex-none rounded-md border border-line bg-paper px-2.5 py-1 text-xs text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {demoState === 'done' ? t('已载入') : t('载入')}
        </button>
      </div>

      <div className="border-t border-line" />

      <div className="flex items-center justify-between gap-4 py-2.5">
        <div className="min-w-0">
          <div className="text-sm text-ink">{t('自动提取附件文字内容')}</div>
          <div className="mt-0.5 text-xs text-muted">
            {t('PDF / Word / 纯文本文件被附加时自动读取内容,用于 Pack 输出。完全本地操作,不上传任何数据。')}
          </div>
        </div>
        <Toggle
          checked={autoExtractAttachments}
          onChange={(v) => void update({ autoExtractAttachments: v })}
        />
      </div>
    </div>
  );
}
