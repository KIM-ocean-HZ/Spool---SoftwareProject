// 形态 C 压缩：纯逻辑那一半（WORKPLAN-2026-08-20 §6.2 / §6.4.1 / §9 第 4 步）。
//
// 这里不碰 UI 也不发请求 —— 请求由 Rust 交给 `spool-ai` 子进程去发。放在这一层的是三件
// 能被测试钉住的事：**数块**、**核对压缩稿有没有把不该删的删掉**、**算这一次花了多少钱**。
//
// ⛔ 这一步**不接 `supersedes` 写入**（§9 第 4 步说得很死）：压缩稿在这里只被看，不进库。
//    先确认质量，再开写入那一段。

import { invoke } from '@tauri-apps/api/core';

/** §6.4.1：压缩比例是**显式档位**，不是在提示词里求模型「少删一点」。 */
export type CompressLevel = 'conservative' | 'balanced' | 'aggressive';

/** ⚠️ 默认最保守那档 —— §6.4.1 原话。 */
export const DEFAULT_LEVEL: CompressLevel = 'conservative';

export const LEVEL_LABELS: Record<CompressLevel, string> = {
  conservative: '只删重复',
  balanced: '保留结论和数字',
  aggressive: '压到最短',
};

export const LEVEL_HINTS: Record<CompressLevel, string> = {
  conservative: '同一件事在别处说过了才合并。大约压到原文的一半到四分之三。',
  balanced: '去冗余，但结论、日期、数字、金额、人名一字不改。大约压到四分之一到一半。',
  aggressive: '只留结论、数字和你自己写的东西。大约压到十分之一到四分之一。',
};

/** 子进程回来的信封，原样透到前端（`api_engine.rs` 的 CompressOutcome）。 */
export interface CompressOutcome {
  ok: boolean;
  text: string;
  /** 模型自己交代的「这次删/合并了哪几类东西」。⚠️ null = **它没说**，不是「什么都没删」。 */
  cuts: string | null;
  kind: string | null;
  message: string | null;
  status: number | null;
  inputTokens: number;
  outputTokens: number;
  /** ⚠️ null = 这家端点**没报**缓存命中，不是「一次都没命中」。见下面 estimateCost。 */
  cachedInputTokens: number | null;
  ms: number;
  model: string | null;
}

// ---------------------------------------------------------------------------------------
// 数块
// ---------------------------------------------------------------------------------------

// pack 里每一条的行首长这样：可选的 📌 / 💭 记号，然后 `#12 [`。
// （`src/lib/pack/fixtures/golden-pack.expected.txt` 第 134 行往下就是样例。）
const ENTRY_RE = /^(?:(?:📌|💭|🗜)\s+)*#\d+\s+\[/;

/** pack 里有多少条。§6.2 约束 3 要求界面写明「原始 N 块 → 压缩后 M 块」，
 *  而这个数字**由 Spool 自己数**，不问模型 —— 让被审查的一方报告自己的成绩单没有意义。 */
export const countPackEntries = (packText: string): number =>
  packText.split('\n').filter((l) => ENTRY_RE.test(l)).length;

// ---------------------------------------------------------------------------------------
// 核对：压缩稿有没有把「一字不改保留」的东西弄丢
// ---------------------------------------------------------------------------------------

/** 提示词第 3 条点名要一字不改保留的三类东西。这三类**不是风格偏好**：
 *  - `note:` 行是用户自己的批注，四带模型里权威最高的一带；
 *  - 不带来源标注的条目（💭）是用户自己写的；
 *  - `==...==` 是用户亲手划的重点。
 *
 *  ⚠️ 让人肉眼在五万字里核对这三类有没有少，等于没有核对。所以 Spool 自己先数一遍，
 *  把少掉的**指名道姓列出来**——这才是「并排核对界面」真正要干的活。 */
export interface CompressionAudit {
  entriesBefore: number;
  entriesAfter: number;
  charsBefore: number;
  charsAfter: number;
  /** 原文里有、压缩稿里找不到的用户批注行。 */
  missingNotes: string[];
  /** 原文里有、压缩稿里找不到的用户高亮片段。 */
  missingHighlights: string[];
  /** 原文里有、压缩稿里找不到的「用户自己写的」条目（💭 那些）。 */
  missingPersonal: string[];
  /** 原文有、压缩稿没有的整节标题——第 1 条要求整节照抄，少一节就是骨架被拆了。 */
  missingSections: string[];
}

const NOTE_RE = /^\s*note:\s*(.+)$/;
const PERSONAL_RE = /^💭\s+#\d+\s+\[[^\]]*\]\s*(.*)$/;
const SECTION_RE = /^##\s+(.+)$/;
const HIGHLIGHT_RE = /==([^=]+)==/g;

/** 比对用的归一化：只收拢空白。**不做大小写或标点的模糊匹配**——
 *  「一字不改」如果连标点都可以不一样，那这条规则就没有边界了。 */
const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();

const uniq = (xs: string[]): string[] => [...new Set(xs)];

export const auditCompression = (original: string, compressed: string): CompressionAudit => {
  const hay = norm(compressed);
  const lines = original.split('\n');

  const notes = uniq(lines.map((l) => NOTE_RE.exec(l)?.[1]).filter((s): s is string => !!s));
  const personal = uniq(
    lines.map((l) => PERSONAL_RE.exec(l)?.[1]).filter((s): s is string => !!s && s.length > 0),
  );
  const sections = uniq(lines.map((l) => SECTION_RE.exec(l)?.[1]).filter((s): s is string => !!s));
  const highlights = uniq([...original.matchAll(HIGHLIGHT_RE)].map((m) => m[1]));

  const gone = (xs: string[]): string[] => xs.filter((x) => !hay.includes(norm(x)));

  return {
    entriesBefore: countPackEntries(original),
    entriesAfter: countPackEntries(compressed),
    charsBefore: original.length,
    charsAfter: compressed.length,
    missingNotes: gone(notes),
    missingHighlights: gone(highlights),
    missingPersonal: gone(personal),
    missingSections: gone(sections),
  };
};

/** 有没有踩到「必须一字不改」那条线。界面用它决定顶部是绿的还是红的。 */
export const auditHasLosses = (a: CompressionAudit): boolean =>
  a.missingNotes.length > 0 ||
  a.missingHighlights.length > 0 ||
  a.missingPersonal.length > 0 ||
  a.missingSections.length > 0;

// ---------------------------------------------------------------------------------------
// 行级 diff：中间那一栏「压掉了哪些句子」
// ---------------------------------------------------------------------------------------

export type DiffOp = 'same' | 'cut' | 'added';
export interface DiffLine {
  op: DiffOp;
  text: string;
}

/** 行级 LCS。够用，因为压缩规则要求骨架整节照抄——两边有大量逐字相同的行可以对齐。
 *
 *  ⚠️ 上限 2500 行是为了不让一份异常大的 pack 把界面卡死（LCS 是 O(n·m)）。
 *  超过就退化成「原文里这一行在压缩稿里还在不在」，粒度差一点，但不会假死。 */
export const diffLines = (original: string, compressed: string): DiffLine[] => {
  const a = original.split('\n');
  const b = compressed.split('\n');
  if (a.length > 2500 || b.length > 2500) {
    const present = new Set(b.map(norm));
    return a.map((text) => ({ op: present.has(norm(text)) ? 'same' : 'cut', text }));
  }
  const n = a.length;
  const m = b.length;
  // dp[i][j] = LCS(a[i..], b[j..])
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = norm(a[i]) === norm(b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (norm(a[i]) === norm(b[j])) {
      out.push({ op: 'same', text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ op: 'cut', text: a[i] });
      i++;
    } else {
      out.push({ op: 'added', text: b[j] });
      j++;
    }
  }
  while (i < n) out.push({ op: 'cut', text: a[i++] });
  while (j < m) out.push({ op: 'added', text: b[j++] });
  return out;
};

// ---------------------------------------------------------------------------------------
// 这一次花了多少钱
// ---------------------------------------------------------------------------------------

/** DeepSeek 官方价目，元 / 百万 token，2026-08-17 生效（2026-08-20 回查过）。
 *  三个数依次是：**缓存命中的输入 / 未命中的输入 / 输出**。 */
const PRICES = {
  flash: { peak: [0.1, 3, 9], off: [0.05, 1.5, 4.5] },
  pro: { peak: [0.3, 9, 27], off: [0.15, 4.5, 13.5] },
} as const;

export type PriceTier = 'flash' | 'pro';

/** 模型名 → 价目档。**认不出来就返回 null**，界面于是只报 token 数不报钱。
 *  编一个价格出来比不报价更糟：这个项目的招牌是「用实测推翻假设」。 */
export const priceTier = (model: string | null): PriceTier | null => {
  const m = (model ?? '').toLowerCase();
  if (m.includes('flash')) return 'flash';
  if (m.includes('pro')) return 'pro';
  return null;
};

/** 高峰 = 北京时间 9:00–12:00、14:00–18:00。
 *  ⚠️ 用 UTC 小时 + 8 算，不用本机时区——用户可能在别的时区，而计价用的是北京时间。 */
export const isPeakBeijing = (at: Date): boolean => {
  const h = (at.getUTCHours() + 8) % 24;
  return (h >= 9 && h < 12) || (h >= 14 && h < 18);
};

export interface CostBreakdown {
  yuan: number;
  tier: PriceTier;
  peak: boolean;
  /** ⚠️ true = 这家端点没报缓存命中，所以这笔账**按全部未命中算**，是个上限。 */
  cacheUnknown: boolean;
}

/** 算这一次的钱。返回 null = 算不了（认不出模型），界面就只显示 token 数。
 *
 *  ⚠️ 缓存命中数缺失时按**全部未命中**计价，也就是往贵了算。宁可高报也不要低报：
 *  §6.2 那个「一到三分钱」是要拿去对外说的，低报会让它变成一句假话。 */
export const estimateCost = (o: CompressOutcome, at: Date = new Date()): CostBreakdown | null => {
  const tier = priceTier(o.model);
  if (!tier) return null;
  const peak = isPeakBeijing(at);
  const [hit, miss, out] = PRICES[tier][peak ? 'peak' : 'off'];
  const cacheUnknown = o.cachedInputTokens === null;
  const cached = cacheUnknown ? 0 : Math.min(o.cachedInputTokens ?? 0, o.inputTokens);
  const uncached = o.inputTokens - cached;
  const yuan = (cached * hit + uncached * miss + o.outputTokens * out) / 1_000_000;
  return { yuan, tier, peak, cacheUnknown };
};

/** 界面上的钱。一到三分钱这个量级，两位小数会全变成 0.01/0.02/0.03，
 *  所以保留四位——用户要能自己拿价目表复算。 */
export const formatYuan = (yuan: number): string =>
  yuan >= 0.01 ? `¥${yuan.toFixed(4)}` : `¥${yuan.toFixed(5)}`;

// ---------------------------------------------------------------------------------------
// 实测记录（WORKPLAN §9 第 5 步）
// ---------------------------------------------------------------------------------------

/** 把一次压缩的全部数字凑成一段能贴回来的文本。
 *
 *  ⚠️ 这不是装饰。第 5 步要往案例账本追的是**实测 vs 估算**，而实测必须是**从这台机器上
 *  真的跑出来的数字**，不是事后回忆的。所以这里把每一项原样列出来，包括：
 *
 *  - `model`：**接口回报的**模型名，不是设置里填的那个。按次付费时「我以为在用便宜的那档」
 *    和「实际在用贵的那档」差三倍，而这一栏是唯一能分辨的东西。
 *  - `cached`：**「未报」和「0」分开写。** 前者是这家接口没这个字段，后者是真的一次没命中。
 *    §6.2 那个 30 倍全压在这一栏上，把两者混成一个数,实测就白做了。
 *  - 高峰/闲时：同一次调用在两个时段价钱差一倍,不写时段的账单没法对照价目表。 */
export const measurementRecord = (args: {
  project: string;
  level: CompressLevel;
  outcome: CompressOutcome;
  audit: CompressionAudit;
  at?: Date;
}): string => {
  const { project, level, outcome: o, audit: a } = args;
  const at = args.at ?? new Date();
  const cost = estimateCost(o, at);
  const pct = Math.round((a.charsAfter / Math.max(1, a.charsBefore)) * 100);
  const losses = [
    a.missingSections.length && `少${a.missingSections.length}节`,
    a.missingNotes.length && `少${a.missingNotes.length}条批注`,
    a.missingPersonal.length && `少${a.missingPersonal.length}条手写`,
    a.missingHighlights.length && `少${a.missingHighlights.length}处高亮`,
  ].filter(Boolean);
  return [
    'SPOOL 压缩实测',
    `时间      ${at.toISOString()}（北京${isPeakBeijing(at) ? '高峰' : '闲时'}）`,
    `项目      ${project}`,
    `档位      ${level}`,
    `原文      ${a.charsBefore} 字符 / ${a.entriesBefore} 块`,
    `压缩稿    ${a.charsAfter} 字符 / ${a.entriesAfter} 块（剩 ${pct}%）`,
    `模型      ${o.model ?? '(接口没报)'}`,
    `tokens    输入 ${o.inputTokens} · 输出 ${o.outputTokens} · 缓存命中 ${
      o.cachedInputTokens === null ? '未报（这家接口没有这个字段）' : o.cachedInputTokens
    }`,
    `耗时      ${(o.ms / 1000).toFixed(1)}s`,
    `估算      ${cost ? `${formatYuan(cost.yuan)}${cost.cacheUnknown ? '（按全未命中算，上限）' : ''}` : '认不出这个模型的价目'}`,
    `一字不改  ${losses.length ? `⚠️ ${losses.join('、')}` : '通过'}`,
    `它说删了  ${o.cuts ? o.cuts.replace(/\s*\n\s*/g, ' / ') : '（它没说）'}`,
  ].join('\n');
};

// ---------------------------------------------------------------------------------------
// 调用
// ---------------------------------------------------------------------------------------

export interface CompressRequest {
  packText: string;
  level: CompressLevel;
  baseUrl: string;
  apiKey: string;
  model: string;
  maxOutputTokens: number;
  timeoutSecs: number;
}

export const compressPack = (req: CompressRequest): Promise<CompressOutcome> =>
  invoke<CompressOutcome>('compress_pack_via_api', { ...req });

export const cancelCompress = (): Promise<boolean> => invoke<boolean>('compress_cancel');

export const sidecarPresent = (): Promise<boolean> => invoke<boolean>('compress_sidecar_present');

export const saveApiKey = (key: string): Promise<void> => invoke('api_key_save', { key });
export const loadApiKey = (): Promise<string> => invoke<string>('api_key_load');
export const apiKeyPresent = (): Promise<boolean> => invoke<boolean>('api_key_present');

/** 失败分类 → 界面上说哪一句人话。
 *
 *  §6.2 约束 4 点名了三种（超时 / 余额不足 / 限流）必须**在界面上说出来**，
 *  不能退回未压缩版而不告诉用户。所以这里一种都不许塌成「失败了」。 */
export const FAILURE_SENTENCE: Record<string, string> = {
  auth: '这个 key 被拒绝了。检查一下是不是复制少了字符，或者已经被吊销。',
  quota: '账户余额不足，这次没跑成。去模型厂商那边充值后再试。',
  rate_limit: '被限流了——刚才请求太密。等一会儿再点一次。',
  timeout: '模型太久没回话，已经停掉了。可以在设置里把超时调长，或者换个小一点的范围。',
  network: '连不上那个地址。检查网络，或者确认设置里的接口地址没写错。',
  upstream: '模型厂商那边出错了，不是你的问题。过一会儿再试。',
  bad_config: '设置有问题：接口地址必须是 https 开头，而且 key 不能是空的。',
  bad_response: '对方回来的东西看不懂，可能不是一个 OpenAI 兼容的接口。',
  no_sidecar: '找不到负责联网的那个小程序（spool-ai）。重装一次 Spool 应该能修好。',
  http: '接口返回了一个错误。',
  internal: 'Spool 自己出错了。',
};
