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
    '同一件事在别处说过了才合并。实测压完剩 73–100% —— 项目里没有重复的话，它几乎不会变短。',
  balanced:
    '去冗余，但结论、日期、数字、金额、人名一字不改。实测压完剩 60–100%，看这个项目里有多少重复。',
  aggressive:
    '只留结论、数字和你自己写的东西。实测压完剩 68–81%（5 次，只在一个项目上跑过）—— 并不比上一档更短。',
};

/** 提示词第 5 条给这一档写的**目标区间**（`mcp.rs` 的 `ratio_rule`，百分比，含两端）。
 *
 *  ⚠️⚠️ **这不是预告，是一个要被核对的目标。** §6.4.1 定显式档位的理由原话是
 *  「给它一个**能被核对的目标**」，而第一轮十二次跑完发现这件事只做了一半：
 *  **目标写了，一次没达到，也没人因此被拦下。**
 *
 *  §9.6.1 的解法：⛔ **不要**把这几个数字改成实测值——那等于把「做不到」写成
 *  「本来就该这样」。改的是**把没达标显示出来**：核对面顶部写「这一档的目标是压到 X%，
 *  这次是 Y%」。目标继续保持有野心，但它从一句空话变成一个读数。
 *
 *  ⚠️ 这里的数字必须和 `mcp.rs::ratio_rule` 里那几句话说的一致 —— 改一边就要改另一边，
 *  否则界面报的目标不是真的发出去的那个目标。 */
export const LEVEL_TARGET: Record<CompressLevel, [number, number]> = {
  conservative: [50, 75],
  balanced: [25, 50],
  aggressive: [10, 25],
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
export const numberTokens = (text: string): string[] =>
  uniq(
    (text.replace(/\s+/g, '').replace(/(?<=\d),(?=\d)/g, '').match(NUMBERISH) ?? []).filter(
      (n) => n.length >= 3,
    ),
  );
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

/** 原文里有、压缩稿里再也找不到的数字。按块和整份用的是同一个判断。 */
export const missingNumbersBetween = (original: string, compressed: string): string[] => {
  const hay = new Set(numberTokens(compressed));
  // ⚠️ `↩ cites:` 那种预览行不算数：它是**别的块的开头几十个字**，而且被 `…` 从中间截断
  // ——`（2026-0…` 会被抽成一个叫 `2026-0` 的假数字，而那一行本来就有 `missingRelations`
  // 在管。不排掉的话，每一份压缩稿都会挂着同一个不存在的「丢失数字」。
  const body = packLines(original).filter((l) => !/^\s*↩/.test(l)).join('\n');
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

  return {
    entriesBefore: countPackEntries(original_),
    entriesAfter: countPackEntries(compressed),
    charsBefore: original_.length,
    charsAfter: compressed.length,
    missingNotes: gone(notes),
    missingHighlights: gone(highlights),
    missingPersonal: gone(personal),
    missingSections: gone(sections),
    missingRelations: gone(relations),
    missingNumbers,
    quoteRewrites: rewritten(notes) + rewritten(personal) + rewritten(highlights),
    fabricatedNotes,
  };
};

/** 有没有踩到「必须一字不改」那条线。界面用它决定顶部是绿的还是红的。 */
export const auditHasLosses = (a: CompressionAudit): boolean =>
  a.missingNotes.length > 0 ||
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

/** 跑之前的估算：这么大一份 pack，大概要花多少钱。
 *
 *  ⚠️⚠️ **这是估算，不是账单**，界面上必须标出来。放一个估算在这儿的唯一理由是
 *  §9.6.4 那条：睡前勾项目的时候要看得见「今晚这一批大概多少钱」——
 *  **授权发生在花钱之前**，而没有数字的授权不是授权。跑完之后用真实账单替换。
 *
 *  下面两个常数**全部来自第二轮那 45 次实测**（`docs/Deepseek-API-compress-test.md` §4），
 *  不是从价目表推的：
 *
 *  - `TOK_PER_CHAR`：中文 pack 的字符 → token。三份 pack 实测 **0.45 / 0.55 / 0.63**
 *    （Flux / 申请规划 / 宣发 —— 英文和代码多的 pack 每字符更省）。取中间那个。
 *  - `OUT_PER_IN`：输出是输入的几倍。⛔ **这是整件事里最贵、也最不稳的一个数**：
 *    §6.2 原来那张成本表按「输出 = 输入的 6%」算，实测 `low` 那一档中位 **1.5 倍**、
 *    摊开 0.6–2.5 倍，`medium` 能到 4.4 倍 —— 因为约一半到八成的输出是「思考」，
 *    而思考按**输出价**计费。这里按默认的 `low` 取中位数。
 *
 *  ⚠️ 所以这个估算的误差可以到两三倍，**界面上必须写「估算」**，跑完用真实账单替换。 */
const TOK_PER_CHAR = 0.55;
const OUT_PER_IN = 1.5;

export const estimateYuanForChars = (chars: number, model: string, at: Date = new Date()): number | null => {
  const tier = priceTier(model);
  if (!tier) return null;
  const [, miss, out] = PRICES[tier][isPeakBeijing(at) ? 'peak' : 'off'];
  const input = chars * TOK_PER_CHAR;
  // ⚠️ 按**全部未命中**算，往贵了估。实测说输入只占总花销 8%，所以这一项估错也没多少，
  // 但宁可高报不要低报 —— 一个低报的估算会变成一句假话。
  return (input * miss + input * OUT_PER_IN * out) / 1_000_000;
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
