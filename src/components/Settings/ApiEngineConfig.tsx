import { Eye, EyeOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import ApiBalance from '@/components/ApiBalance';
import Toggle from '@/components/ui/Toggle';
import { apiKeyPresent, loadApiKey, saveApiKey, sidecarPresent } from '@/lib/ai/compress';
import { useT } from '@/lib/i18n';
import { useSettingsStore } from '@/stores/settingsStore';

// 形态 C 的设置（WORKPLAN-2026-08-20 §6.2 / §6.3）。
//
// ⚠️ 这一节存在本身就在改一句对外说了很久的话，所以它必须自己把话说清楚。原来的说法是
// 「Spool 永不联网」；§6.3 把它精确化成：
//
//   主进程不发任何网络请求。打开这个开关之后，请求由 Spool 启动的**本地子进程**发出，
//   用你自己的 key 和额度，内容到达你选的那家模型厂商。
//
// §6.3 还有一句必须照做的：「不要因为不好讲就不讲」。所以那段话是**常驻**在页面上的，
// 不是折在「详细说明」里等人去点。
export default function ApiEngineConfig() {
  const t = useT();
  const enabled = useSettingsStore((s) => s.apiEngineEnabled);
  const baseUrl = useSettingsStore((s) => s.apiBaseUrl);
  const model = useSettingsStore((s) => s.apiModel);
  const timeoutSecs = useSettingsStore((s) => s.apiTimeoutSecs);
  const reasoning = useSettingsStore((s) => s.apiReasoning);
  const keepOriginal = useSettingsStore((s) => s.compressKeepOriginal);
  const update = useSettingsStore((s) => s.update);

  const [key, setKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [showKey, setShowKey] = useState(false);
  // null = 还在探。子进程在不在，是打开开关之前就该知道的事，不该等到点了压缩才报错。
  const [sidecar, setSidecar] = useState<boolean | null>(null);

  useEffect(() => {
    void sidecarPresent().then(setSidecar);
    void apiKeyPresent().then(setHasKey);
  }, []);

  const revealKey = async () => {
    if (!showKey && !key) setKey(await loadApiKey());
    setShowKey((v) => !v);
  };

  const commitKey = async (next: string) => {
    setKey(next);
    await saveApiKey(next);
    setHasKey(next.trim().length > 0);
  };

  return (
    <div className="space-y-3 py-2.5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs text-ink">{t('让 Spool 自己调 AI 压缩上下文')}</div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            {t(
              'Spool 主程序不发任何网络请求。打开这个开关之后，请求由 Spool 启动的一个本地小程序发出，用你自己的 key 和额度，内容会到达你选的那家模型厂商。',
            )}
          </p>
        </div>
        <Toggle checked={enabled} onChange={(v) => void update({ apiEngineEnabled: v })} />
      </div>

      {/* ⚠️ 这一句在开关关着的时候也要在：它是「已经装了 CLI 的人不用填 key」这条路的指路牌。
          §6.2：形态 B 并行保留，不是被取代。 */}
      <p className="text-[11px] leading-relaxed text-muted/80">
        {t('已经装了 claude / codex 这类命令行工具的话，用「AI 引擎」那一节就行，一分钱不花、一个 key 不用填。这一节是给不想装命令行工具的人的第二条路。')}
      </p>

      {enabled && (
        <div className="space-y-2.5 rounded-md border border-line bg-paper-2/30 p-3">
          {sidecar === false && (
            <p className="text-[11px] leading-relaxed" style={{ color: 'var(--urgent)' }}>
              {t('找不到负责联网的那个小程序（spool-ai）。重装一次 Spool 应该能修好。')}
            </p>
          )}

          <label className="block">
            <span className="text-[11px] text-muted">{t('API key')}</span>
            <div className="mt-1 flex items-center gap-1">
              <input
                type={showKey ? 'text' : 'password'}
                value={showKey ? key : hasKey && !key ? '••••••••••••' : key}
                onChange={(e) => setKey(e.target.value)}
                onBlur={(e) => void commitKey(e.target.value)}
                placeholder="sk-…"
                spellCheck={false}
                className="min-w-0 flex-1 rounded border border-line bg-paper px-2 py-1 font-mono text-[11px] text-ink outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={() => void revealKey()}
                className="rounded p-1 text-muted hover:bg-paper-2 hover:text-ink"
                aria-label={showKey ? t('隐藏') : t('显示')}
              >
                {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
            {/* ⚠️ 说实话，而且说在它旁边。这个产品的信任全靠「说的和做的一致」。 */}
            <span className="mt-1 block text-[11px] leading-relaxed text-muted/80">
              {t('key 存在你这台电脑的系统钥匙串里，和别的密码放在一起。它不会进设置文件，也不会跟着导出的库走。')}
            </span>
            {/* ⭐ X 批（Ocean 2026-08-26:「用户需要反复查看余额」）—— 余额在 key 底下,
                因为它回答的正是「这个 key 还能不能用」。⛔ 不自动查:一个开着就自己
                往外连的设置页,会推翻「只在你要它出去的时候才出去」那句话。 */}
            <ApiBalance className="mt-1.5" />
          </label>

          <label className="block">
            <span className="text-[11px] text-muted">{t('接口地址')}</span>
            <input
              value={baseUrl}
              onChange={(e) => void update({ apiBaseUrl: e.target.value })}
              spellCheck={false}
              className="mt-1 w-full rounded border border-line bg-paper px-2 py-1 font-mono text-[11px] text-ink outline-none focus:border-accent"
            />
            {!baseUrl.startsWith('https://') && (
              <span className="mt-1 block text-[11px]" style={{ color: 'var(--urgent)' }}>
                {t('必须是 https 开头 —— 用普通 http 的话，你的 key 会明文发出去。')}
              </span>
            )}
          </label>

          <label className="block">
            <span className="text-[11px] text-muted">{t('模型')}</span>
            <input
              value={model}
              onChange={(e) => void update({ apiModel: e.target.value })}
              spellCheck={false}
              className="mt-1 w-full rounded border border-line bg-paper px-2 py-1 font-mono text-[11px] text-ink outline-none focus:border-accent"
            />
          </label>

          {/* ⚠️ 2026-08-20 实测：约九成的账单和九成的等待时间花在「思考」上，不是花在压缩上。
              DeepSeek 文档里有 thinking / reasoning_effort 两个旋钮，**但没有列出调低或关掉的
              合法取值**。所以这里不替用户猜：把他选的值原样发出去，让端点自己回答——
              不认的值会被 400 顶回来，而 400 不计费，报错里带着厂商原话。 */}
          <label className="block">
            <span className="text-[11px] text-muted">{t('思考力度')}</span>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {[
                { v: '', label: t('默认') },
                { v: 'high', label: 'high' },
                { v: 'medium', label: 'medium' },
                { v: 'low', label: 'low' },
                { v: 'off', label: t('关掉') },
              ].map(({ v, label }) => (
                <button
                  key={v || 'default'}
                  type="button"
                  onClick={() => void update({ apiReasoning: v })}
                  className={`rounded-md border px-2 py-0.5 text-[11px] transition-colors ${
                    reasoning === v
                      ? 'border-accent text-accent'
                      : 'border-line bg-paper text-muted hover:border-line-strong hover:text-ink'
                  }`}
                  style={reasoning === v ? { background: 'var(--accent-soft)' } : undefined}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* ⛔ D0（2026-08-22）：原来这句是「实测下来……这几个值都试一次就知道」——
                那是把做实验这件事外包给用户。我们已经跑了 130 次，知道答案是 low，
                那就该给一个默认值和一句说明，而不是给一段实验说明。 */}
            <span className="mt-1 block text-[11px] leading-relaxed text-muted/80">
              {t('模型下笔之前会先想一会儿，这一段也按字数收费。默认 low：想得短一点，压出来的东西不比想得久的差，钱和时间都省下大半。不认的值会被接口顶回来，那一次不收费。')}
            </span>
          </label>

          {/* ⭐ R1 §1c（Ocean：「未压缩的原库需要备份保存，默认备份，用户可关」）。
              ⚠️ 关掉之后那句话**同时印在核对面的页脚上** —— 用户不会为了压一次上下文
              先去翻一遍设置，而这一条关系到他的字改不改得回来。 */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[11px] text-ink">{t('备份压缩前的原文')}</div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted/80">
                {t('压缩把块的正文换成更短的版本。留着原文，块的工具条上就有一个入口能打开看，也能随时换回去；关掉的话省一点磁盘，但压过就找不回原来的字了。')}
              </p>
            </div>
            <Toggle
              checked={keepOriginal}
              onChange={(v) => void update({ compressKeepOriginal: v })}
            />
          </div>

          <label className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-muted">{t('单次最长等待（秒）')}</span>
            <input
              type="number"
              min={10}
              max={900}
              value={timeoutSecs}
              onChange={(e) => void update({ apiTimeoutSecs: Number(e.target.value) || 180 })}
              className="w-20 rounded border border-line bg-paper px-2 py-1 text-right text-[11px] text-ink outline-none focus:border-accent"
            />
          </label>
        </div>
      )}
    </div>
  );
}
