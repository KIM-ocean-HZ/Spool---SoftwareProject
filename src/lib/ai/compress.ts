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

/** ⚠️ §6.4.1 原话是「默认最保守那档」，**2026-08-21 被实测改掉了**（WORKPLAN §9.5）。
 *
 *  十二次实测：最保守那档压完剩 73–98%（摊开 25 个点，八次里只有一次打中它自己写的目标），
 *  而「保留结论和数字」剩 72–78%（差 6 个点）。**它压得更狠，而且稳得多。**
 *  「默认给最保守的」本意是安全，但一个一半时候几乎不压的档位并不安全——
 *  它只是让人花了钱、等了两分钟，然后拿到一份和原文差不多长的东西。 */
export const DEFAULT_LEVEL: CompressLevel = 'balanced';

export const LEVEL_LABELS: Record<CompressLevel, string> = {
  conservative: '只删重复',
  balanced: '保留结论和数字',
  aggressive: '压到最短',
};

/** ⚠️⚠️ **这几句写的是实测区间，不是提示词里那个目标。**（WORKPLAN §9.6.1 ②）
 *
 *  原来这里写的是「大约压到四分之一到一半」之类 —— 那是**提示词里给模型的目标**，
 *  抄到用户界面上就变成了一句预告，而实测四十多次**一次都没达到过**。
 *  ⛔ 用户读到的必须是**真会发生的事**；目标是另一回事，它现在以「目标 X% / 这次 Y%」
 *  的读数形式出现在核对面顶部（`LEVEL_TARGET`），达不达标看得见，但不再冒充预告。
 *
 *  ⭐ 而实测最要紧的一条是：**压多少主要由「这个项目里有多少重复」决定，不由档位决定。**
 *  同一组设置换个项目差 33 个百分点（Flux 62% / 宣发 79% / 申请规划 95%），
 *  而三个档位在同一个项目上的中位数是 95% / 95% / 76% —— 统计上分不开。
 *  所以每一句都点出「看这个项目有多少重复」，而不是许诺一个数。 */
export const LEVEL_HINTS: Record<CompressLevel, string> = {
  conservative:
    '同一件事在别处说过了才合并。一般压完剩 73–100% —— 项目里没有重复的话，它几乎不会变短。',
  balanced:
    '去冗余，但结论、日期、数字、金额、人名一字不改。一般压完剩 60–100%，看这个项目里有多少重复。',
  aggressive:
    '只留结论、数字和你自己写的东西。一般压完剩 68–81%，并不比上一档更短。',
};

/** ⛔ 2026-08-22（D10，Ocean 原话「压缩程度预估准确度没有保证……不然就不显示」）：
 *  这里原来有一个 `LEVEL_TARGET`（50–75 / 25–50 / 10–25），核对桌照它报「目标 X%，
 *  这次 Y% —— 没达标」。§9.5 已经写明那几个目标是空话（四十多次一次没达到过），
 *  ⛔ **拿一个已知不成立的目标去判用户的稿子不合格，判的是我自己的提示词。**
 *  界面上那个读数整条撤掉，这个常数也就跟着没人用了。
 *
 *  ⚠️ **提示词里那几个目标没有动**（`mcp.rs::ratio_rule`）：给模型一个能被核对的长度目标
 *  仍然是对的，改的只是「不拿它去判用户」。要再把目标搬回界面，先在那边取数。 */

/** D-c · 两次调用合成一笔账（2026-08-22）。
 *
 *  ⚠️⚠️ **只报第二次那笔，界面上「这一次花了多少」就成了假话** —— 两次的钱都花了。
 *  正文取 `keep` 那一份（重跑成功就是第二份，重跑没跑成就还是第一份）。
 *
 *  ⚠️ 缓存命中只要有一次是「没报」，合起来也算没报 —— `estimateCost` 那时候按全部未命中
 *  算并写「最多」。⛔ 宁可把上限说出来，也不要报一个偏低的数。 */
export const mergeOutcomes = (other: CompressOutcome, keep: CompressOutcome): CompressOutcome => ({
  ...keep,
  inputTokens: other.inputTokens + keep.inputTokens,
  outputTokens: other.outputTokens + keep.outputTokens,
  cachedInputTokens:
    other.cachedInputTokens === null || keep.cachedInputTokens === null
      ? null
      : other.cachedInputTokens + keep.cachedInputTokens,
  reasoningTokens:
    other.reasoningTokens === null && keep.reasoningTokens === null
      ? null
      : (other.reasoningTokens ?? 0) + (keep.reasoningTokens ?? 0),
  ms: other.ms + keep.ms,
});

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
  /** 「思考」烧掉的 token。⚠️ 按**输出价**计费，而 §6.2 那张表按「2,000 输出」算的。 */
  reasoningTokens: number | null;
  ms: number;
  model: string | null;
}

// ---------------------------------------------------------------------------------------
// 数块
// ---------------------------------------------------------------------------------------

// pack 里每一条的行首长这样：可选的 📌 / 💭 记号，然后 `#12 [`。
// （`src/lib/pack/fixtures/golden-pack.expected.txt` 第 134 行往下就是样例。）
export const ENTRY_RE = /^(?:(?:📌|💭|🗜)\s+)*#\d+\s+\[/;

/** 同一条头行拆成四截：记号 / 编号 / 方括号里那一截 / 方括号后面那一截正文。
 *
 *  ⚠️ **只许有这一份。** `splitPackEntries` 按它切块，`missingNumbersBetween` 按它把
 *  「Spool 印的那一截」和「用户的字」分开 —— 两处各写一遍的话，
 *  一边认得的头行另一边认不得，而两边各自都编译得过、测试也绿。 */
export const HEAD_RE = /^((?:(?:📌|💭|🗜)\s+)*)#(\d+)\s+\[([^\]]*)\]\s?(.*)$/;

/** pack 里有多少条。§6.2 约束 3 要求界面写明「原始 N 块 → 压缩后 M 块」，
 *  而这个数字**由 Spool 自己数**，不问模型 —— 让被审查的一方报告自己的成绩单没有意义。 */
export const countPackEntries = (packText: string): number =>
  packLines(packText).filter((l) => ENTRY_RE.test(l)).length;

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
  /** ⚠️⚠️ 原文里有、压缩稿里**再也找不到**的数字、日期、分数、金额。
   *
   *  ⛔ **这是第二轮实测里最重的一条发现**（2026-08-21）：
   *
   *  | 压完剩 | 丢掉的不同数字 |
   *  |---|---|
   *  | 91–101%（几乎没压） | **0** |
   *  | 63%（压得最狠那次） | **9**，含 `2026-11-25`（CMU SCS 建议的 GRE 最晚重考日）、`12-15`、`02-15`（申请截止） |
   *  | 72–77%（宣发） | 2，含 `26,163 / 50,000`（他引用过的那次测量） |
   *
   *  也就是说：**它一旦真的开始压，就开始丢日期和数字** —— 而这一档的名字就叫
   *  「保留结论和数字」，提示词原话是「所有结论、日期、数字、金额、人名一字不改地保留」。
   *  ⭐ 这正是「让被审查的一方报告自己的成绩单没有意义」的又一例：十次里没有一次
   *  在「它说删了」里提过自己删掉了一个日期。
   *
   *  ⚠️ 比的是**出现过没有**，不是出现几次 —— 合并重复本来就该让同一个数字少出现几次。 */
  missingNumbers: string[];
  /** ⚠️ 原文有、压缩稿没有的**关系行**（`↩ cites:` / `↩ replaces` / `↩ corrects`）。
   *
   *  为什么这一类要单独数：它们不是正文，是**块和块之间的连线** —— 「这一条引的是哪一条」
   *  「这一条替代了哪一条」。一份 pack 的价值有一半在这些连线上，而它们又短又长得像装饰，
   *  正是最容易被「压缩」掉的东西。
   *
   *  ⛔ 这不是假想的风险，是实测：2026-08-21 第二轮，同一份 pack 的 14 条关系行，
   *  第 4 次只剩 2 条、第 7 次一条不剩，**而当时的核对全部报「通过」** ——
   *  旧的检查根本没数过这一类。 */
  missingRelations: string[];
  /** ⚠️ 内容没变、只有成对引号被换成直引号的条目数（批注 / 手写 / 高亮合计）。
   *
   *  它**不算丢**（内容还在），但它确实破了「一字不改照抄」——所以单独报一个数，
   *  而不是塞进上面那几条里去喊狼来了。见 `normLoose` 上面那段。 */
  quoteRewrites: number;
  /** ⚠️⚠️ 压缩稿里**凭空多出来**的批注行。
   *
   *  为什么要防「添」：批注是 💭 Personal 那一带 —— pack 里权威最高的一带，规则明写着
   *  「有事实错误就直接指出，不要照顾用户感受」。一行编出来的批注会穿着用户自己的权威，
   *  被下一个 AI 当成他的主张去执行。只数「原文有的还在不在」是防丢，防不了这个。
   *
   *  ⚠️ 比的是**批注行对批注行**，不是拿批注文字去全文搜。
   *  2026-08-20 差点栽在这上面：当时怀疑 `↪ note: AI回复` 是编的，而全文搜法没有报——
   *  因为「AI回复」那四个字正好也出现在同一块的正文里。后来查清那一行本来就在正文里、
   *  根本不是编的，**结论蒙对了，方法是错的**：换一个措辞没那么巧的编造就会漏过去。 */
  fabricatedNotes: string[];
  /** ⚠️ 第三类：**被改写的批注**（D4-b，2026-08-22）。原文里那条找不到了、压缩稿里多出来
   *  一条，而两条像得配得上对 —— 那是同一条被改写，不是「丢了一条」加「编了一条」。
   *  ⛔ 它照样破了「一字不改」，所以照样算损失（`auditHasLosses`），只是不再报两遍。
   *  配对规则见 `pairRewrites`。 */
  rewrittenNotes: NoteRewrite[];
}

// ⛔⛔ **2026-08-21：这两条以前都对不上真的 pack，于是「一条都没少」这句话是空的。**
//
// 一条一条说，因为两条错得不一样：
//
//  1. `note:` **从来不是裸的**。渲染器打出来的是 `💭 note:`（用户写的，v22 §2.6 表头第八条
//     加的记号）或 `ai note:`（AI 写的）。而旧的 `^\s*note:` 两个都不匹配 —— 三份真实 pack
//     里 34 条批注，它一条都数不到。于是 `missingNotes` 恒为空，界面上那句
//     「你的批注一条都没少」**不管模型删没删都会显示**。一个恒真的核对等于没有核对，
//     而这个界面存在的全部理由就是替用户核对。
//  2. 置顶的用户条目印的是 `📌 💭 #7 […]`，而旧的 `^💭` 要求 💭 在最前面。
//     **恰恰是最重要的那些块（置顶 + 用户自己写的）漏出了检查。**
//
// ⚠️ 修法是让检测跟着**渲染器实际打出来的字**走，不是跟着我们以为它打的字走。
// 所以「有没有少」和「有没有多」现在用**同一条**规则（`ANY_NOTE_RE`）：
// 两个方向数的是同一批行，一边报丢、一边报编，对称。
export const ANY_NOTE_RE = /^\s*\S*\s*(?:ai\s+)?note:\s*(.+)$/;
/** ⚠️ 「**丢**」这个方向要用这一条，不能用上面那条宽的 —— 两个方向要的精度不一样：
 *
 *  - 查**添**要宽：编出来的那一行本来就不长得像正版，只认自己的记号就抓不到；
 *  - 查**丢**要准：它比的是「**Spool 自己渲染出来的批注**还在不在」，而这两个形状
 *    （`💭 note:` 用户写的 / `ai note:` AI 写的）是 `assemble.ts` 唯一会打出来的两种。
 *
 *  ⛔ 用宽的那条查丢会误报，而且实测撞见了：〈宣发〉那份 pack 的**正文里**有一行
 *  `↪ note: AI回复`（用户当初粘进来的原文的一部分，2026-08-20 查清过），模型压正文的时候
 *  把它并掉了 —— 宽规则于是报「少了一条你的批注」。那不是批注，是正文，
 *  **而正文被压短正是压缩在干的事**。误报三次之后，用户就不会再看这一行了。 */
export const RENDERED_NOTE_RE = /^\s*(?:💭\s+|ai\s+)note:\s*(.+)$/;
/** @deprecated 只认裸 `note:`，真实 pack 里一条都匹配不到。 */
export const NOTE_RE = /^\s*note:\s*(.+)$/;
export const PERSONAL_RE = /^(?:📌\s+)?💭\s+#\d+\s+\[[^\]]*\]\s*(.*)$/;
/** pack 自己的小节标题 —— 和 `pack/templates.ts` 里那几个常量一一对应，**改那边就要改这里**。
 *
 *  ⚠️⚠️ 为什么是一张名单而不是 `^## `：块的正文是 markdown，里面本来就有 `## 研究线`
 *  这种标题。按 `^## ` 一刀切，「整节被拆掉了」就会在模型压掉某一块正文里的一个二级标题时
 *  误报 —— 而那句话说的是**骨架被拆了**，是这个界面最重的几句之一。 */
export const PACK_SECTIONS = new Set([
  'Pinned Blocks',
  'Full Record (chronological)',
  'Related Files & Links',
  'Output Language',
  'How to Read This Context',
  'Notation',
  'What This Is',
]);
const SECTION_RE = /^##\s+(.+?)\s*$/;

/** 抽出「数字类」的东西：日期、分数、金额、端口、版本号。
 *
 *  ⚠️ 先**把空白全部去掉**再抽。库里有从 PDF 提取出来的文字，那些文字里 `2026-08-07`
 *  会被拆成 `2026-0 8-0 7`；不去空白的话抽出来的是碎片，两边都碎、而且碎得不一样。
 *  千分位逗号同理（`50,000` 和 `50000` 必须算同一个数）。
 *
 *  ⚠️ 三个字符以下不算：`R29/L24/S25/W26` 那种拆出来的 `29`、`24` 满篇都是，
 *  报出来只会淹掉真正丢掉的那几个。**宁可少报，也不要把这一行变成噪声。** */
const NUMBERISH = /\d+(?:[.\-:]\d+)*/g;
const squeeze = (text: string): string => text.replace(/\s+/g, '').replace(/(?<=\d),(?=\d)/g, '');
export const numberTokens = (text: string): string[] =>
  uniq((squeeze(text).match(NUMBERISH) ?? []).filter((n) => n.length >= 3));
/** 这一行里有没有这个数字。⚠️⚠️ **必须和 `numberTokens` 走同一套归一化** —— 抽出来的
 *  `2026-08-07` 在原文里可能长着 `2026-0 8-0 7`（PDF 提取），一行一行地找的时候不去空白
 *  就永远对不上它自己抽出来的那个数。D7「加回去」要靠它找到那个数住在哪一行。 */
export const lineHasNumber = (line: string, n: string): boolean => squeeze(line).includes(n);
// 块和块之间的连线。渲染器打出来的三种：`↩ cites:` / `↩ replaces (…)` / `↩ corrects …`。
const RELATION_RE = /^\s*↩\s*(.+)$/;
export const HIGHLIGHT_RE = /==([^=]+)==/g;

/** 比对用的归一化：只收拢空白。 */
export const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** 按行切开，并且**把行尾的 `\r` 去掉**。
 *
 *  ⚠️⚠️ 这不是洁癖。库里的块是用户从别处粘进来的，**从 Word 粘过来的那些带 CRLF**，
 *  于是 pack 里就有 `\r`。而 JS 的 `.` 不匹配 `\r`，所以任何以 `(.+)$` 收尾的检测
 *  （批注行、💭 条目、条目头行）**在这些行上全部失配**。
 *
 *  2026-08-21 实测撞见的样子：〈Flux〉那份 pack 有 9 条，按块核对只切出 8 条 ——
 *  少掉的正是 `#5 … from Microsoft Word`。它**不报错、不提示**，那一块就是不在核对面上。
 *  ⛔ 这是 §9.6.5 明令禁止的「静默跳过」，而且偏偏跳过的是从别处粘进来的块。 */
export const packLines = (text: string): string[] =>
  text.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));

/** ⚠️ **2026-08-21 加的第二档归一化，起因是一次真实的假警报。**
 *
 *  第二轮实测第 6 次（压得最狠的那一次，剩 64%），核对报「⚠️ 它凭空写了 4 条你没写过的
 *  批注」。查下来四条**一个字都没改**，改的是**引号**：它把 `“…”` 换成了 `"…"`。
 *
 *  这件事两面都真，所以两面都要说，不能只说一面：
 *
 *   - **它确实动了要求一字不改照抄的文字**，这条不该被抹掉；
 *   - **但把它报成「编造」是错的**，而且错得很贵：「编造批注」是这个界面最重的一句警告
 *     （一行编出来的批注穿着用户自己的权威），用它去喊一次标点替换，
 *     下一次真的编造出现时，用户已经学会忽略这句话了。**喊狼来了的代价是整个核对失信。**
 *
 *  所以「还在不在」按这一档比（换了引号 = 还在），而「引号被改写了」单独报一个数。
 *  ⛔ 只折叠成对引号，不折叠别的 —— 再宽一点，「一字不改」这条规则就没有边界了。 */
export const normLoose = (s: string): string =>
  norm(s).replace(/[\u201c\u201d]/g, '"').replace(/[\u2018\u2019]/g, "'");

export const uniq = (xs: string[]): string[] => [...new Set(xs)];

// ---------------------------------------------------------------------------------------
// 改写：第三类（D4-b，2026-08-22）
// ---------------------------------------------------------------------------------------

/** ⚠️⚠️ **2026-08-22 Ocean 那一次跑出来的账里，「少了 13 条批注」和「它凭空写了 13 条」
 *  数目一样 —— 因为那是同一批东西**：原批注被改写之后的样子
 *  （「现有成绩需按 Fall 2027 开学日复核」→「需按开学日复核」）。
 *
 *  现在的两个判断各自都没错：查「丢」的按整条字符串比，找不到就是丢了；查「编」的反向比，
 *  原文没有一模一样的就是编的。**但改一个字会同时满足两条**，于是同一件事被报成两条罪，
 *  警报数目翻倍 —— 而且最重的那一类（真的凭空捏造）被淹在改写里。
 *
 *  ⛔ **修法不是放松核对**：改写**确实**破了「一字不改」，它照样要报、照样算损失。
 *  修的是**分类**：把配得上对的那些从「丢了」和「编了」两边都取出来，单列成第三类。
 *
 *  为什么用「短的那条有多少落在长的那条里」而不是 Dice：改写的典型形态是**删字**，
 *  两条长度差得远。上面那个真实例子的 Dice 只有 0.43（配不上），而这个比值是 0.83。 */
export interface NoteRewrite {
  before: string;
  after: string;
}

const bigrams = (s: string): string[] => {
  const t = normLoose(s).replace(/\s+/g, '');
  const out: string[] = [];
  for (let i = 0; i + 1 < t.length; i++) out.push(t.slice(i, i + 2));
  return out;
};

/** 两条文字的重合度：**共有的二元组 ÷ 短的那条的二元组数**，0–1。 */
export const overlapRatio = (a: string, b: string): number => {
  const ga = bigrams(a);
  const gb = bigrams(b);
  if (ga.length === 0 || gb.length === 0) return 0;
  const setB = new Map<string, number>();
  for (const g of gb) setB.set(g, (setB.get(g) ?? 0) + 1);
  let shared = 0;
  for (const g of ga) {
    const n = setB.get(g) ?? 0;
    if (n > 0) {
      shared++;
      setB.set(g, n - 1);
    }
  }
  return shared / Math.min(ga.length, gb.length);
};

/** ⚠️ 两条都短于这个长度就不配对：三四个字的两条批注碰巧重合太容易了，
 *  而把两条**不相干**的批注说成「改写」，比分成两条报还糟。 */
const REWRITE_MIN_CHARS = 6;
/** ⚠️ 卡这么高是因为宁可漏判：漏判 = 退回原来那种「报两条」的样子（吵，但没说错），
 *  误判 = 说了一句假话。 */
const REWRITE_MIN_OVERLAP = 0.6;

/** 把「丢了的批注」和「编出来的批注」配对，配得上的那些单列成改写。
 *  ⚠️ 一对一，按相似度从高到低贪心 —— 一条原批注只可能被改写成一条。 */
export const pairRewrites = (
  missing: string[],
  fabricated: string[],
): { rewrites: NoteRewrite[]; missing: string[]; fabricated: string[] } => {
  const scored: { i: number; j: number; score: number }[] = [];
  missing.forEach((m, i) => {
    fabricated.forEach((f, j) => {
      if (normLoose(m).length < REWRITE_MIN_CHARS && normLoose(f).length < REWRITE_MIN_CHARS) return;
      const score = overlapRatio(m, f);
      if (score >= REWRITE_MIN_OVERLAP) scored.push({ i, j, score });
    });
  });
  scored.sort((a, b) => b.score - a.score);
  const usedM = new Set<number>();
  const usedF = new Set<number>();
  const rewrites: NoteRewrite[] = [];
  for (const { i, j } of scored) {
    if (usedM.has(i) || usedF.has(j)) continue;
    usedM.add(i);
    usedF.add(j);
    rewrites.push({ before: missing[i], after: fabricated[j] });
  }
  return {
    rewrites,
    missing: missing.filter((_, i) => !usedM.has(i)),
    fabricated: fabricated.filter((_, j) => !usedF.has(j)),
  };
};

/** 原文里有、压缩稿里再也找不到的数字。按块和整份用的是同一个判断。 */
/** ⚠️ **Spool 自己印上去的行，不是用户的字。** 三类都要排掉，理由不同：
 *
 *  - `↩ cites:` 那种预览行是**别的块的开头几十个字**，还被 `…` 从中间截断 ——
 *    `（2026-0…` 会被抽成一个叫 `2026-0` 的假数字，而那一行本来就有 `missingRelations` 在管；
 *  - `[... truncated, 8945 more chars not shown ...]` 里的 **8945 是渲染器算出来的字数**。
 *    ⛔ 2026-08-22 在真实语料上抓到的：它被报成「丢了一个数字」，于是数字硬闸门把一份
 *    好稿子挡在库外，而用户按「加回去」还补不回来 —— 那个数在原文里根本不是一个内容。
 *    ⚠️ 这一条按形状认，不按具体数字认（`templates.ts::truncationMarker`）。
 *  - ⭐ **条目头行** `#12 [2026-08-09 20:42 · from …]`（T5，2026-08-23）。同一族的最后一个：
 *    那个日期是渲染器从 `created_at` 印出来的，**用户没打过这几个字**，而
 *    `addBackNumbers` 按设计**拒绝**把头行粘回正文（粘回去会把一行结构行塞进内容里）。
 *    于是它被报成「丢了数字」→ `numbersGateOpen` 关死 → 「用这一份」永远点不动 →
 *    「加回去」永远补不回来。⛔ **一个用户无论如何都解不开的闸门，比不设闸门更糟。**
 *
 *    ⭐ **它没有资格当硬闸门，还有一条更硬的理由**：R1 之后写回库的只有块的 `content`
 *    （`contentFromEntryBody`），**头行是下一次渲染时重新印的** —— 头行上的日期
 *    **在结构上不可能丢进库里**。
 *
 *    ⚠️ 实测（第五轮，45 份真实压缩稿）：22 个补不回的数字里有 **4 个**是这一类，
 *    3 个 `2026-08-09` 加一个 `2026-08-0717:09`（后者是 `squeeze` 把「日期+空格+时间」
 *    挤成了一个 token，原文里根本没有这个字符串，所以**永远**对不上）。
 *
 *    ⚠️ 代价说清楚：模型改写了头行的话，这里不再报。⛔ 那不是无声的损失 ——
 *    `compareByEntry` 仍然按 `#N` 配对，块不见了/多出来照样报；而头行改了也进不了库。 */
const SPOOL_OWN_LINE = /^\s*(?:↩|\[\.\.\. truncated, \d+ more chars not shown \.\.\.\])/;

export const missingNumbersBetween = (original: string, compressed: string): string[] => {
  const hay = new Set(numberTokens(compressed));
  // ⚠️ 头行**只去掉方括号那一截**（`#12 [2026-08-09 20:42 · from …]`），
  // ⛔ 不是整行丢掉 —— 块的正文第一行就印在头行上，整行丢掉等于把用户的字排除在核对之外。
  const body = packLines(original)
    .filter((l) => !SPOOL_OWN_LINE.test(l))
    .map((l) => HEAD_RE.exec(l)?.[4] ?? l)
    .join('\n');
  return numberTokens(body).filter((n) => !hay.has(n));
};

export const auditCompression = (original_: string, compressed: string): CompressionAudit => {
  const hay = norm(compressed);
  const lines = packLines(original_);

  const notes = uniq(lines.map((l) => RENDERED_NOTE_RE.exec(l)?.[1]).filter((s): s is string => !!s));
  const personal = uniq(
    lines.map((l) => PERSONAL_RE.exec(l)?.[1]).filter((s): s is string => !!s && s.length > 0),
  );
  const sections = uniq(
    lines.map((l) => SECTION_RE.exec(l)?.[1]).filter((s): s is string => !!s && PACK_SECTIONS.has(s)),
  );
  const relations = uniq(lines.map((l) => RELATION_RE.exec(l)?.[1]).filter((s): s is string => !!s));
  const missingNumbers = missingNumbersBetween(original_, compressed);
  const highlights = uniq([...original_.matchAll(HIGHLIGHT_RE)].map((m) => m[1]));

  // ⚠️ 「还在不在」按宽的那一档比：换了引号算还在（见 normLoose）。
  const looseHay = normLoose(compressed);
  const gone = (xs: string[]): string[] => xs.filter((x) => !looseHay.includes(normLoose(x)));
  // 而「一字不改被破了几处」单独数：宽的找得到、严的找不到。
  const rewritten = (xs: string[]): number =>
    xs.filter((x) => looseHay.includes(normLoose(x)) && !hay.includes(norm(x))).length;

  // 反向查一遍：压缩稿里的每一条批注，原文里**有没有同样的一条批注**。
  const noteLines = (text: string): string[] =>
    uniq(
      packLines(text)
        .map((l) => ANY_NOTE_RE.exec(l)?.[1])
        .filter((s): s is string => !!s)
        .map(normLoose),
    );
  const originalNotes = new Set(noteLines(original_));
  const fabricatedNotes = noteLines(compressed).filter((x) => !originalNotes.has(x));
  // D4-b：配得上对的那些，从「丢了」和「编了」两边同时取出来，单列成改写。
  const paired = pairRewrites(gone(notes), fabricatedNotes);

  return {
    entriesBefore: countPackEntries(original_),
    entriesAfter: countPackEntries(compressed),
    charsBefore: original_.length,
    charsAfter: compressed.length,
    missingNotes: paired.missing,
    rewrittenNotes: paired.rewrites,
    missingHighlights: gone(highlights),
    missingPersonal: gone(personal),
    missingSections: gone(sections),
    missingRelations: gone(relations),
    missingNumbers,
    quoteRewrites: rewritten(notes) + rewritten(personal) + rewritten(highlights),
    fabricatedNotes: paired.fabricated,
  };
};

/** ⛔⛔ **D-b · 数字硬闸门**（2026-08-22）：这一份**够不够格进库**。
 *
 *  丢了数字/日期就是不够格 —— ⛔ **写入解锁之后这条也照样在**，而且**不许用"用户点了确认"
 *  把它放行**。封锁写入的理由从来不是「AI 写的东西不可信」这种泛泛的话，是一件具体的事：
 *  **它压得动的时候会丢日期，它不丢日期的时候等于没压，而两种结果长得一模一样。**
 *  （实测：剩 91–101% 的那些一个数字都没丢；压到 64% 的那次丢了 5 个，含 CMU SCS 建议的
 *  GRE 最晚重考日 `2026-11-25` —— 而那一档就叫「保留结论和数字」。）
 *
 *  ⭐ 闸门是**能过的**：`addBackNumbers` 把丢掉的那几行从原文补回来（纯本地、不问模型、
 *  不花钱），补完这个判断就为真。⛔ 别把它改成「警告一下然后放行」—— 那就等于没有闸门。 */
export const numbersGateOpen = (a: Pick<CompressionAudit, 'missingNumbers'>): boolean =>
  a.missingNumbers.length === 0;

/** 有没有踩到「必须一字不改」那条线。界面用它决定顶部是绿的还是红的。 */
export const auditHasLosses = (a: CompressionAudit): boolean =>
  a.missingNotes.length > 0 ||
  // ⛔ 改写照样是损失。D4-b 改的是「不报两遍」，不是「当没事」。
  a.rewrittenNotes.length > 0 ||
  a.missingHighlights.length > 0 ||
  a.missingPersonal.length > 0 ||
  a.missingSections.length > 0 ||
  a.missingRelations.length > 0 ||
  a.missingNumbers.length > 0 ||
  a.fabricatedNotes.length > 0;

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
// 字级 diff：⭐ **要看的是真正变了的那几个字，不是变了的那一段**
// ---------------------------------------------------------------------------------------
//
// Ocean 2026-08-22（第二轮反馈第 2 条）原话：「**删除和新加的文字大部分都是重复的，需要对比的
// 是真正变化的文字，而不是变化的段落**，做到让用户一看就知道哪些文字在被压缩后的 block 中
// 消失了，哪些文字是原来没有的」。
//
// 行级 diff 会把「改了三个字的一整段」报成「整段删掉 + 整段新加」—— 屏幕上一片红一片黄，
// 而真正丢掉的那个日期淹在里面。所以：
//
//   1. 先按行对齐（`diffLines`）；
//   2. **同一处**的删行和加行**合起来**按字对一遍（`hunkRuns`），再把结果切回每一行。
//
// ⚠️ 中文没有词边界，所以是**按字**不是按词。二元组重合度那套（`overlapRatio`）在这个项目里
// 已经被实测校准过一次（D4-b：真实例子的 Dice 只有 0.43，重合比 0.83），闸门沿用它。
//
// ⭐ 第 2 步**原来是一对一配对**，2026-08-22 第二轮第 5 次反馈把它换掉了 —— 理由和实测数字
// 写在 `hunkRuns` 上面。一句话：压缩最常干的是「把七行并成一行」，而一对一只标得动其中一行。

/** 一行里的一段：`same` 两边都有，`cut` 只在原文里，`added` 只在压缩稿里。 */
export interface InlineRun {
  op: DiffOp;
  text: string;
}

/** 一行文字够长就不按字对了。⚠️ LCS 是 O(n·m)，两条 4000 字的行 = 一千六百万格，
 *  而核对面上一屏可能有二十几块。超了就整行标 —— 粒度差一点，但不会把界面卡住。 */
const CHAR_DIFF_CAP = 1500;

/** 两行文字按**字**对一遍。返回的段落连起来：`same+cut` = 原文那一行，`same+added` = 新那一行。 */
export const charDiff = (before: string, after: string): InlineRun[] => {
  const a = [...before];
  const b = [...after];
  if (a.length > CHAR_DIFF_CAP || b.length > CHAR_DIFF_CAP) {
    return [
      { op: 'cut', text: before },
      { op: 'added', text: after },
    ];
  }
  const n = a.length;
  const m = b.length;
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: InlineRun[] = [];
  // 相邻的同类段并成一段，免得逐字生成上千个 span。
  const push = (op: DiffOp, ch: string): void => {
    const last = out[out.length - 1];
    if (last && last.op === op) last.text += ch;
    else out.push({ op, text: ch });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push('same', a[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push('cut', a[i++]);
    } else {
      push('added', b[j++]);
    }
  }
  while (i < n) push('cut', a[i++]);
  while (j < m) push('added', b[j++]);
  return out;
};

/** ⚠️ 太短的一段「两边都有」不算数：中文里「的」「了」「是」到处都是，LCS 会在两段
 *  **不相干**的话之间挑出一堆一两个字的重合，屏幕上就成了字符沙拉 —— 那比整段划掉更难读。 */
const MIN_SAME_RUN = 2;

/** ⚠️ 一行里至少要有这么多字是「两边都有」的，才按字标。低于这个数说明它是**真的整行删了**
 *  （或者真的整行新写的），那时候整行标一个记号反而一眼就懂。 */
const LINE_SAME_MIN = 0.35;

/** ⚠️ 而且这一行里至少要有**一段连着这么长**的字是两边都有的。
 *  只看比例挡不住字符沙拉：一行里凑够 35% 的两字重合是很容易的事，而那样的一行读起来
 *  是一堆碎记号。实测语料上加了这一条之后，「平均 same 段短于 3 个字」的行从 3 行变成 0 行。 */
const MIN_SAME_ANCHOR = 4;

/** ⚠️ 一整处的重合度低于这个数就整处不标 —— 那是真的删了一段、又新写了一段。
 *
 *  ⛔ 别把它调回 `REWRITE_MIN_OVERLAP`（0.6）：那是**批注配对**的门槛，一条对一条，
 *  宁可漏判。这里是一整处对一整处，里面本来就混着「真删掉的」和「被并进去的」，
 *  卡 0.6 会把整处一起挡掉。实测：0.6 → 0.4 多标出 11 行，再往下放一分不涨。
 *  真正的把关在下面那两条**逐行**的闸上，这一条只是先把明显不相干的挡掉（LCS 是 O(n·m)）。 */
const HUNK_MIN_OVERLAP = 0.4;

/** 一处里每一行各自的按字记号。`null` = 这一行不按字标，整行标。 */
export interface HunkRuns {
  /** 和传进来的删行一一对应。 */
  cut: (InlineRun[] | null)[];
  /** 和传进来的加行一一对应。 */
  added: (InlineRun[] | null)[];
}

/** 把一整处的删行和加行**合起来**按字对一遍，再把结果切回每一行。
 *
 *  ⭐⭐ 这是 2026-08-22 第二轮第 5 次反馈的正题（Ocean：「逐词核对被删除的和新加的目前还没有
 *  做到，只有部分的文本做到了逐词可视化审核，大部分的文本还是整段删除，整段更新」）。
 *
 *  病根是**一对一配对**：压缩最常干的一件事是「把七行并成一行」，而一对一只能挑其中一行说
 *  「这一句被改写了」，剩下六行整段划掉 —— 可它们的字大半就在那一行里。在真实语料上量过：
 *  一对一时原文侧只有 **34%** 的删行拿得到按字记号。合起来对之后，那七行会一起落在同一次
 *  LCS 上，谁的哪几个字进了压缩稿一目了然。
 *
 *  ⚠️ 三道闸，每一道都是为了不让「标得更细」变成「标得更假」：
 *   1. **整处重合度**低于门槛就整处不标 —— 那是真的删了一段、又新写了一段；
 *   2. **一两个字的 `same`** 掰回两侧各自的改动（`MIN_SAME_RUN`）；
 *   3. **一行里 `same` 占比太低、或者没有一段连着够长的**，退回整行标
 *      （`LINE_SAME_MIN` + `MIN_SAME_ANCHOR`）。
 *
 *  返回 `null` = 这一处整个不按字标。 */
export const hunkRuns = (
  cut: readonly string[],
  added: readonly string[],
): HunkRuns | null => {
  if (cut.length === 0 || added.length === 0) return null;
  const cutText = cut.join('\n');
  const addText = added.join('\n');
  // ⚠️ 和 `charDiff` 共用同一个上限 —— 两个数各写一个的话，超了之后 `charDiff` 会退化成
  // 「整段删 + 整段加」，而这里会把那份退化结果当成真的按字结果去切行。一个数，不会打架。
  if (cutText.length > CHAR_DIFF_CAP || addText.length > CHAR_DIFF_CAP) return null;
  // ⛔ 闸 ①：整处配不上就整处不标。
  if (overlapRatio(cutText, addText) < HUNK_MIN_OVERLAP) return null;

  const runs = charDiff(cutText, addText);
  // ⛔ 闸 ②：一两个字的「两边都有」掰回改动。⚠️ 带换行的那种不动 —— 它是行的边界，
  //    掰开会让两侧的行号错位。
  const cleaned: InlineRun[] = [];
  runs.forEach((r, i) => {
    const tiny =
      r.op === 'same' &&
      i > 0 &&
      i < runs.length - 1 &&
      !r.text.includes('\n') &&
      [...r.text].length < MIN_SAME_RUN;
    if (tiny) cleaned.push({ op: 'cut', text: r.text }, { op: 'added', text: r.text });
    else cleaned.push(r);
  });

  // 切回行。⚠️ `same` 段里的换行两边同时换一行；`cut` 段里的只换原文那一侧，
  // `added` 段里的只换压缩稿那一侧 —— 「七行并成一行」正是靠这一点对得上。
  const cutOut: InlineRun[][] = cut.map(() => []);
  const addOut: InlineRun[][] = added.map(() => []);
  let ci = 0;
  let ai = 0;
  const push = (arr: InlineRun[][], idx: number, op: DiffOp, text: string): void => {
    if (text.length === 0) return;
    const row = arr[idx];
    if (!row) return;
    const last = row[row.length - 1];
    if (last && last.op === op) last.text += text;
    else row.push({ op, text });
  };
  for (const r of cleaned) {
    const parts = r.text.split('\n');
    parts.forEach((part, k) => {
      if (k > 0) {
        if (r.op !== 'added') ci++;
        if (r.op !== 'cut') ai++;
      }
      if (r.op !== 'added') push(cutOut, ci, r.op === 'same' ? 'same' : 'cut', part);
      if (r.op !== 'cut') push(addOut, ai, r.op === 'same' ? 'same' : 'added', part);
    });
  }

  // ⛔ 闸 ③：这一行几乎没有字是两边都有的 → 它是真的整行删了 / 真的整行新写的。
  const keep = (line: string, row: InlineRun[]): InlineRun[] | null => {
    if (line.trim() === '') return null;
    const total = row.reduce((n, x) => n + x.text.length, 0);
    if (total === 0) return null;
    const same = row.reduce((n, x) => (x.op === 'same' ? n + x.text.length : n), 0);
    const longest = row.reduce((n, x) => (x.op === 'same' ? Math.max(n, x.text.length) : n), 0);
    return same / total >= LINE_SAME_MIN && longest >= MIN_SAME_ANCHOR ? row : null;
  };
  return {
    cut: cutOut.map((row, k) => keep(cut[k], row)),
    added: addOut.map((row, k) => keep(added[k], row)),
  };
};

/** 铺回正文上的一段：连着的、同一种命运的几行。 */
export interface DiffChunk {
  op: DiffOp;
  text: string;
  /** 它和上一段之间本来隔着一个空行。⚠️ 段尾的空行剪掉之后就渲染不出间距了，靠这个补回来。 */
  gap: boolean;
  /** ⭐ 这一段是**被改写的一行**时，里面哪几个字变了。有它就按字标，没有它才整段标。 */
  runs?: InlineRun[];
  /** ⭐ 这一行是用户自己按「加回去」补回来的 —— ⛔ 绝不能和「它新写的」混为一谈。 */
  restored?: boolean;
}

/** 把行级 diff 折成**一侧**的段落，好让划线和底色直接落在渲染后的正文上：
 *  `before` 要 same+cut（划掉的那些还留在原文里），`after` 要 same+added。
 *
 *  ⭐ **被改写的那些行按字标**（Ocean 2026-08-22 第二轮第 2 条）：同一处的删行和加行先配对，
 *  配上的按 `charDiff` 只标真正变的那几个字；配不上的才是真的整行删了 / 真的整行新写的。
 *
 *  ⭐ `restored` = 用户自己按「加回去」补回来的那几行。⛔ **必须单独认出来**：它们不是
 *  「它新写的」，而且补回去之后 LCS 会把它们和原文对齐、当成 `same` —— 那样用户就
 *  **看不见自己刚才那一下做了什么**（他原话：「加回去用户根本看不到这个动作」）。
 *
 *  ⚠️⚠️ **返回 null = 这一侧拼不回原样**，调用方必须退回不带标记的正文。
 *  `diffLines` 超过行数上限时会退化成只报原文侧那一路，压缩稿侧的 added 行根本不生成 ——
 *  ⛔ 那时候把重建出来的、缺了行的文本当正文显示，就是核对界面自己在丢内容。 */
export const diffChunks = (
  lines: DiffLine[],
  side: 'before' | 'after',
  text: string,
  restored: readonly string[] = [],
): DiffChunk[] | null => {
  const drop: DiffOp = side === 'before' ? 'added' : 'cut';
  const rows = lines.filter((l) => l.op !== drop);
  if (rows.map((r) => r.text).join('\n') !== text) return null;

  // ① 按字对。⚠️ 只在**同一处**（两个 same 之间那一段）里对 —— 跨处对齐会把不相干的两段
  //    说成「这一句被改写成了那一句」，而那是这个界面最不该说的一类话。
  const runsOf = new Map<DiffLine, InlineRun[]>();
  for (let i = 0; i < lines.length; ) {
    if (lines[i].op === 'same') {
      i++;
      continue;
    }
    let j = i;
    while (j < lines.length && lines[j].op !== 'same') j++;
    const hunk = lines.slice(i, j);
    const cut = hunk.filter((l) => l.op === 'cut');
    const added = hunk.filter((l) => l.op === 'added');
    const hr = hunkRuns(
      cut.map((l) => l.text),
      added.map((l) => l.text),
    );
    if (hr) {
      cut.forEach((l, k) => {
        const row = hr.cut[k];
        if (row) runsOf.set(l, row);
      });
      added.forEach((l, k) => {
        const row = hr.added[k];
        if (row) runsOf.set(l, row);
      });
    }
    i = j;
  }

  // ② 折段。带记号的行（按字标的、加回去的）各自成一段，不和别人并。
  const groups: DiffChunk[] = [];
  for (const r of rows) {
    const blank = r.text.trim() === '';
    const runs = runsOf.get(r);
    const restoredHere = side === 'after' && !blank && restored.includes(r.text);
    const last = groups[groups.length - 1];
    const plain = !runs && !restoredHere;
    // 空行不自己成一段：它是段落之间那个间隔，跟着上一段走。
    if (last && plain && !last.runs && !last.restored && (blank || last.op === r.op)) {
      last.text += '\n' + r.text;
      continue;
    }
    groups.push({
      op: blank ? 'same' : r.op,
      text: r.text,
      gap: false,
      ...(runs ? { runs } : {}),
      ...(restoredHere ? { restored: true } : {}),
    });
  }

  return groups
    .map((g, i) => ({
      ...g,
      // 段尾的空行要剪掉:它落在段里渲染不出间距,得换成下一段头上的 gap。
      text: g.text.replace(/\s+$/, ''),
      gap: i > 0 && /\n[ \t]*$/.test(groups[i - 1].text),
    }))
    .filter((g) => g.text.length > 0);
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

/** ⛔ 2026-08-22（D10）：这里原来有一个 `estimateYuanForChars`（按字符线性外推「这一份
 *  大概要花多少钱」），右栏睡前那张单子照它报「约 ¥X」和一个合计。撤掉的理由是
 *  **它系统性偏低**：它只按输入字符算，而 08-22 那次实测里**输出 token 几乎和输入一样多**
 *  （15,360 进 / 13,336 出），输出单价还是未命中输入的三倍。
 *
 *  ⚠️ 代价记在这里：睡前勾项目的时候不再看得见「今晚大概多少钱」，只看得见字数。
 *  按 Ocean 的规矩（「测试如果能够保证准确才能写，不然就不显示」）这是对的一半 ——
 *  另一半（重做一个把输出算进去的估算）没做，要做就从四轮实测里回归，
 *  原始数据在 `docs/Deepseek-API-compress-test.md` §4，那两个常数是 0.55 字符/token
 *  和 1.5 倍输出（`low` 那一档的中位数）。
 *
 *  ⚠️ 跑完之后的那个钱**不是**估算，是拿接口回报的真实用量算的 —— 见上面 `estimateCost`。 */

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
  /** 思考力度。⚠️ 必须是**这一次实际发出去的**那个值。 */
  reasoning: string;
  outcome: CompressOutcome;
  audit: CompressionAudit;
  at?: Date;
}): string => {
  const { project, level, reasoning, outcome: o, audit: a } = args;
  const at = args.at ?? new Date();
  const cost = estimateCost(o, at);
  const pct = Math.round((a.charsAfter / Math.max(1, a.charsBefore)) * 100);
  const losses = [
    a.missingSections.length && `少${a.missingSections.length}节`,
    a.missingNotes.length && `少${a.missingNotes.length}条批注`,
    a.rewrittenNotes.length && `改写了${a.rewrittenNotes.length}条批注`,
    a.missingPersonal.length && `少${a.missingPersonal.length}条手写`,
    a.missingHighlights.length && `少${a.missingHighlights.length}处高亮`,
    a.missingRelations.length && `少${a.missingRelations.length}条引用/替代关系`,
    a.missingNumbers.length && `⚠️丢了${a.missingNumbers.length}个数字/日期(${a.missingNumbers.slice(0, 5).join('、')})`,
    a.fabricatedNotes.length && `⚠️编了${a.fabricatedNotes.length}条批注`,
  ].filter(Boolean);
  return [
    'SPOOL 压缩实测',
    `时间      ${at.toISOString()}（北京${isPeakBeijing(at) ? '高峰' : '闲时'}）`,
    `项目      ${project}`,
    `档位      ${level}`,
    `思考力度  ${reasoning === '' ? '默认（没发这个参数）' : reasoning === 'off' ? '关掉' : reasoning}`,
    `原文      ${a.charsBefore} 字符 / ${a.entriesBefore} 块`,
    `压缩稿    ${a.charsAfter} 字符 / ${a.entriesAfter} 块（剩 ${pct}%）`,
    `模型      ${o.model ?? '(接口没报)'}`,
    `tokens    输入 ${o.inputTokens} · 输出 ${o.outputTokens} · 缓存命中 ${
      o.cachedInputTokens === null ? '未报（这家接口没有这个字段）' : o.cachedInputTokens
    }`,
    `其中思考  ${
      o.reasoningTokens === null ? '未报' : `${o.reasoningTokens} token（按输出价计费）`
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
  reasoning: string;
  timeoutSecs: number;
}

/** 子进程报回来的进度。
 *
 *  ⚠️ 2026-08-20 之后这条路是**流式**的，所以这里能报的不只是阶段，还有
 *  **已经思考了多少字 / 已经写了多少字**。这两个数字是「它还在正常干活」的唯一证据——
 *  之前那次 180 秒超时，界面上分不出「在写」和「卡死」，就是因为没有它们。 */
export type CompressStage = 'starting' | 'sending' | 'thinking' | 'writing';
export interface CompressProgress {
  stage: CompressStage;
  /** 已经产出的「思考」字数。会思考的模型先想再写，这个数先涨。 */
  thinking?: number;
  /** 已经写出的压缩稿字数。 */
  written?: number;
}
export const PROGRESS_EVENT = 'compress://progress';

export const compressPack = (req: CompressRequest): Promise<CompressOutcome> =>
  invoke<CompressOutcome>('compress_pack_via_api', { ...req });

export const cancelCompress = (): Promise<boolean> => invoke<boolean>('compress_cancel');

export const sidecarPresent = (): Promise<boolean> => invoke<boolean>('compress_sidecar_present');

/** D-a · 这个项目里有多少重复。⚠️ 走的是 Rust 那一套（`find_similar_blocks`，字符三元组
 *  Jaccard ≥ 0.6）—— ⛔ 别在 TS 这边另写一套判断，用户看到的和别的 AI 通过 MCP 看到的
 *  必须是同一个数。纯本地、只读、不出网、不花钱。 */
export interface DuplicateProbe {
  /** 近重复的组数。 */
  groups: number;
  /** 这些组里可以并掉的块数（每组留一块）—— ⭐ 用户要的是这个数，不是组数。 */
  extraBlocks: number;
  scannedBlocks: number;
}

export const duplicateProbe = (threadId: string): Promise<DuplicateProbe> =>
  invoke<DuplicateProbe>('compress_duplicate_probe', { threadId });

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
  thought_only:
    '这个模型把整次回复都用来「思考」了，正文一个字都没写出来。换一个不思考的模型（比如 pro 那一档里的非推理款），或者把范围缩小一点再试。',
  truncated: '结果被输出长度掐断了，没拿到完整的压缩稿。换个小一点的打包范围再试。',
  cut_off:
    '压缩稿写到一半连接断了，没拿到完整的一份。⚠️ 半份稿子看起来和「删得很狠」一模一样，所以没有交给你。把设置里的「单次最长等待」调大，或者换个小一点的打包范围。',
  no_sidecar: '找不到负责联网的那个小程序（spool-ai）。重装一次 Spool 应该能修好。',
  http: '接口返回了一个错误。',
  internal: 'Spool 自己出错了。',
};

// ---------------------------------------------------------------------------------------
// E3 · 作废检测（COMPRESS-UX-R2-2026-08-22 §7 / WORKPLAN §2.E3）
// ---------------------------------------------------------------------------------------
//
// ⚠️ 这一整段只是**过桥**：提示词、请求、和回来之后那道**引文逐字闸**全在 Rust 那一侧
// （`api_engine.rs`）。⛔ 别在这边另写一道闸 —— 界面上放行的和 Rust 放行的必须是同一批。

/** 一条提议。⚠️ 编号是**块自己的 `#N`**，不是它在 pack 里排第几。 */
export interface StaleProposal {
  staleSeq: number;
  bySeq: number;
  why: string;
  /** 旧块里能证明它作废的那一句原文。⚠️ 已经过了逐字闸。 */
  quoteStale: string;
  /** 新块里取代它的那一句原文。 */
  quoteNew: string;
  /** 两句引文里至少有一句是「只差标点的重打」。⚠️ 界面要说出来：
   *  它确实破了「逐字」，只是没改内容。 */
  retyped: boolean;
}

/** 为什么这一条没过闸。⚠️ 界面按它挑话说，⛔ 别在界面里另判一遍。 */
export type StaleDropReason =
  /** 它没说清是哪两块。 */
  | 'no_seq'
  /** 它说的编号不在这份 pack 里。 */
  | 'no_block'
  /** 它把一块说成取代了它自己。 */
  | 'same_block'
  /** 它说旧块里有这么一句，那一句在那一块里找不到。 */
  | 'quote_stale'
  /** 新块那一句找不到。 */
  | 'quote_new';

/** ⛔ 没过闸、被整条丢掉的那一条 —— **连它说了什么一起带回来**。
 *
 *  ⚠️⚠️ 2026-08-23（Ocean 真手指验收第 8 条）：原来这里只有一个数，界面于是只能写
 *  「另有 1 条被丢掉了…Spool 不拿它给你看」，而他读到的是「我的项目有问题，Spool 不告诉我」。
 *  **闸挡住的是「拿它去动库」，⛔ 不是「不让用户知道 AI 说过什么」。** */
export interface StaleDropped {
  /** null = 它连编号都没说。 */
  staleSeq: number | null;
  bySeq: number | null;
  why: string;
  quoteStale: string;
  quoteNew: string;
  reason: StaleDropReason;
}

export interface StaleScan {
  outcome: CompressOutcome;
  /** ⚠️ **过了闸的**才在这儿。 */
  proposals: StaleProposal[];
  /** ⛔ 引文对不上、被整条丢掉的那几条。⚠️ **必须报出来**：模型提了 5 条只留下 2 条
   *  和它本来就只提了 2 条，是两件完全不同的事。⭐ 而且要带上它到底说了什么。 */
  dropped: StaleDropped[];
}

interface StaleScanRaw {
  outcome: CompressOutcome;
  proposals: {
    stale_seq: number;
    by_seq: number;
    why: string;
    quote_stale: string;
    quote_new: string;
    retyped: boolean;
  }[];
  dropped: {
    stale_seq: number | null;
    by_seq: number | null;
    why: string;
    quote_stale: string;
    quote_new: string;
    reason: StaleDropReason;
  }[];
}

export const staleScan = async (req: Omit<CompressRequest, 'level'>): Promise<StaleScan> => {
  const raw = await invoke<StaleScanRaw>('stale_scan_via_api', {
    packText: req.packText,
    baseUrl: req.baseUrl,
    apiKey: req.apiKey,
    model: req.model,
    reasoning: req.reasoning,
    timeoutSecs: req.timeoutSecs,
  });
  return {
    outcome: raw.outcome,
    dropped: raw.dropped.map((d) => ({
      staleSeq: d.stale_seq,
      bySeq: d.by_seq,
      why: d.why,
      quoteStale: d.quote_stale,
      quoteNew: d.quote_new,
      reason: d.reason,
    })),
    proposals: raw.proposals.map((p) => ({
      staleSeq: p.stale_seq,
      bySeq: p.by_seq,
      why: p.why,
      quoteStale: p.quote_stale,
      quoteNew: p.quote_new,
      retyped: p.retyped,
    })),
  };
};
