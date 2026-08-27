import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { plainText } from '@/lib/blocks/contentRuns';
import { indexAtOffset, scrollBlockIntoView } from '@/lib/blocks/viewportAnchor';
import { hitLead, hitLine, type SearchHit } from '@/lib/search/query';
import { useActiveBlockStore } from '@/stores/activeBlockStore';
import { useBlocksStore } from '@/stores/blocksStore';
import { useSearchStore } from '@/stores/searchStore';
import { useT } from '@/lib/i18n';

// V2 ③ (WORKPLAN §2.V2) — the permanent way in, chosen by Ocean 2026-08-25 out of four
// proposals: 「一列极细短横,一块一根,当前那根亮着」. A tick per mounted block down the right
// edge of the feed; the one you are reading is lit. Click or drag it to move.
//
// ⭐ Why this one won (the proposal said it, he did not have to): it answers a second
// question for free — how many blocks does this project have, and which one am I on — which
// nothing on screen answered before.
//
// ⛔ NOT a floating window. Ocean's redline on this batch: 「不希望破坏安静的特性」.
//
// ⚠️⚠️ It must be mounted BESIDE the scroll container, never inside it (LogView does this).
// An absolutely positioned child of a scroll container is placed against the scrolled
// CONTENT, so an inside-mounted rail scrolls away with the feed — the first version did
// exactly that and Ocean's report was 「根本调不出来,只有划到最顶部才能看到」.

// ⭐ 2026-08-27（Ocean:「复用右侧的刻度栏，在查找时，找到的同一项目内的相同信息可以在右侧的
// block 预览中显示出来，点击 block 可以跳转」）—— 查找开着的时候，这一列刻度同时是命中图：
// 这个项目里对上的每一块，那根横线亮成 accent 色并且加长；悬浮上去，预览卡显示的是**对上的
// 那一行**（不是批注/正文开头）；点下去直接跳过去并接上块内查找的高亮。
// ⚠️ 只画**挂载着的**块（刻度本来就只认 DOM 里的 `data-block-id`）：更早的块要先点「查看更早
// 的」才滚得到，给一根跳不过去的刻度是骗人。跨项目那一份仍然在查找条的「全部」列表里。
// ⛔ 仍然不是浮窗，也没有新控件 —— 复用的就是这一列，安静的那条红线没动。

// The lens (Ocean 2026-08-25: 「当前块刻度最长间隔最大,然后依次递减」). A gaussian falloff
// over distance-in-blocks from the one you are reading. SIGMA is how many blocks either side
// stay visibly enlarged before the scale settles down to its resting size.
const SIGMA = 3.2;
const lensWeight = (distance: number): number => Math.exp(-(distance * distance) / (2 * SIGMA * SIGMA));

// Resting share of the rail's height each tick gets regardless of the lens, so a long
// project's far-away blocks stay a readable scale rather than collapsing onto one line.
const BASE_SHARE = 0.35;

// Ceiling on one tick's slice. Without it a five-block project spreads five hairlines over
// the full height of the pane, which reads as a broken rail rather than a short one — the
// column stays centred and compact instead, and only grows to fill as blocks accumulate.
const MAX_SLICE_PX = 26;

/** 悬浮预览卡最多带多少字过去。「少放点内容」（Ocean 2026-08-25）—— 它是一眼扫过去认出
 *  「哦是那一块」用的,不是拿来读的;真要读,点一下就到了。 */
const PREVIEW_CHARS = 150;

// ⭐⭐ 2026-08-27 第三轮 —— 命中预览列（Ocean 看过第二轮之后重定的）。他的四条：
//   1. 「上下滑动 + 鼠标靠近刻度时**都会**显示预览」；
//   2. 「预览需要复用**非搜索状态下的小 block**」—— 就是原来悬浮在一根刻度上出的那张卡，
//      同一个壳、同一套字号，⛔ 不另画一种卡片；
//   3. 「预览的文字需要**从搜索命中的那句话开始，必须能看到命中词**」（见 query.ts 的 hitLead）；
//   4. 「**去掉从大到小**，直接显示所有 block 的命中预览，但限定最多显示几块」；
//      「滑动时刻度要**标出当前的中心点**，中心点如果是命中块，预览块比其他更突出」；
//      「鼠标移出刻度就点不到了 —— 改成鼠标在 block 附近侧区域移动，预览不会消失」。
//
// ⚠️⚠️ **宽度那条红线没有变**：刻度本身仍然是 16px，预览列只在「滑动中 / 鼠标在附近」这两个
// 时刻出现，一走就收。⛔ 仍然不是浮窗，它是刻度自己的子节点。
//
// ⭐ 第二轮那套「以当前块为中心向外递减」的尺寸已经删掉了：所有卡片一样大，
// 「哪一张是当前这一块」改由**描边和底色**说（`isHere`），⛔ 不再由大小说 —— 大小既要表达
// 距离又要保证读得清，两件事挤在一个变量上，结果是远处那几张小到看不清字。

/** 最多同时排几张。
 *
 *  ⭐ 6 是量出来的，不是猜的：一张卡两行 12px 的字加内边距 ≈ 46px，六张加间距 ≈ 300px，
 *  在 1000px 高的窗口里占三成 —— 还能一眼扫完，再多就变成一堵墙（Ocean 要的是「最安静」的
 *  那个数）。⚠️ 命中多于六个时，这六张是**以当前那一块为中心**截出来的一段，滑动时跟着走。 */
const MAX_PREVIEW_CARDS = 6;

/** 小 block 预览这一列有多宽。⚠️ 只在展开的那一刻占着。 */
const PREVIEW_COL_W = 196;

/** 滑动停下之后，预览再留多久。⚠️ 太短会在手指还在滚的间隙里闪；太长就成了常驻，
 *  而常驻正是宽度红线不允许的那种。 */
const SCROLL_LINGER_MS = 1400;

/** 每一张小 block 里带几个字。⚠️ 从命中词往前一点开始算（hitLead），⛔ 不是从行首。 */
const MINI_CHARS = 56;

/** 预览卡竖着大概占多高的一半 —— 它按刻度的中线居中,所以要拿这个把上下两头夹住,
 *  不然停在最上面那根上时,卡片一半会飘到项目标题栏上去。 */
const PREVIEW_HALF_PX = 52;

interface Props {
  scrollRef: RefObject<HTMLDivElement | null>;
  // Bumped by LogView whenever the feed's contents change, so offsets are re-measured.
  revision: number;
  /** 悬浮预览要拿这一格的文字 —— 刻度本身只认 DOM 里的 id。 */
  threadId: string;
}

interface Entry {
  id: string;
  /** Offset of this block's top inside the scroll container's content box. */
  top: number;
}

export default function ScaleRail({ scrollRef, revision, threadId }: Props) {
  const t = useT();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [current, setCurrent] = useState(0);
  const [dragging, setDragging] = useState(false);
  /** 刻度条自己有多高。⭐ 每一根的高度是**算出来的像素**,不再交给 flex 分 —— 见 slices。 */
  const [railH, setRailH] = useState(0);
  /** 鼠标停在第几根上。null = 没停在任何一根上。 */
  const [hovered, setHovered] = useState<number | null>(null);
  /** 鼠标有没有进到这一栏（含预览列和它左边那条缓冲带）里。 */
  const [railHovered, setRailHovered] = useState(false);
  /** 刚刚在滑动。⭐ Ocean 第三轮第 1 条：上下滑动的时候预览也要出来。 */
  const [scrolling, setScrolling] = useState(false);
  const scrollLingerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const entriesRef = useRef<Entry[]>([]);
  entriesRef.current = entries;
  const railRef = useRef<HTMLDivElement>(null);

  const blocks = useBlocksStore((s) => s.byThread[threadId]);

  // 查找开着的时候（= 块内查找条正显示），这个项目里对上的块。⚠️ 用 `navResults`：它在全局
  // 搜索面板关掉之后仍然留着，正是查找条上下翻用的那一份。
  const navActive = useSearchStore((st) => st.activeNavigationBlockId !== null);
  const navResults = useSearchStore((st) => st.navResults);
  const matches = useMemo(() => {
    const map = new Map<string, SearchHit>();
    if (!navActive) return map;
    for (const hit of navResults) {
      if (hit.threadId === threadId) map.set(hit.blockId, hit);
    }
    return map;
  }, [navActive, navResults, threadId]);

  // ⭐ Measure ONCE per layout change, not per scroll frame. The first version called
  // getBoundingClientRect on every mounted block on every frame — up to 200 forced layouts
  // per tick, which is what Ocean felt as 「动效卡顿,不丝滑」. Scrolling now only compares
  // numbers against these cached offsets.
  const measure = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const base = container.getBoundingClientRect().top - container.scrollTop;
    const next: Entry[] = [];
    for (const el of container.querySelectorAll<HTMLElement>('[data-block-id]')) {
      const id = el.dataset.blockId;
      if (id) next.push({ id, top: el.getBoundingClientRect().top - base });
    }
    setEntries((prev) =>
      prev.length === next.length && prev.every((e, i) => e.id === next[i]!.id && e.top === next[i]!.top)
        ? prev
        : next,
    );
    // 刻度条和滚动容器是同一个高度（LogView 里它们是一对兄弟,都铺满那个 relative 盒子）。
    setRailH(container.clientHeight);
  }, [scrollRef]);

  // Re-measure when the feed's contents or geometry change: blocks arriving, a block
  // expanding or collapsing, 「查看更早的」, a window resize. One observer on the container
  // and one on its content — ⛔ not one per block, which was its own per-frame cost.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(container);
    for (const child of container.children) ro.observe(child);
    return () => ro.disconnect();
  }, [scrollRef, measure, revision]);

  // Scrolling is pure arithmetic against the cached offsets — no DOM reads, and state is
  // only written when the lit tick actually changes, so a long smooth scroll re-renders the
  // rail a few dozen times instead of once per frame.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    let frame = 0;
    const read = (): void => {
      frame = 0;
      const list = entriesRef.current;
      if (list.length === 0) return;
      // The block the reader is looking at: the last one that starts at or above the fold.
      const fold = container.scrollTop + 8;
      let idx = 0;
      for (let i = 0; i < list.length; i++) {
        if (list[i]!.top <= fold) idx = i;
        else break;
      }
      setCurrent((prev) => (prev === idx ? prev : idx));
    };
    const onScroll = (): void => {
      // ⭐ 滑动的时候把预览点亮，停下 SCROLL_LINGER_MS 之后自己收回去。
      setScrolling(true);
      if (scrollLingerRef.current) clearTimeout(scrollLingerRef.current);
      scrollLingerRef.current = setTimeout(() => setScrolling(false), SCROLL_LINGER_MS);
      if (frame) return;
      frame = requestAnimationFrame(read);
    };
    read();
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
      if (scrollLingerRef.current) clearTimeout(scrollLingerRef.current);
    };
  }, [scrollRef, entries.length]);

  // ⭐⭐ 2026-08-25（Ocean:「侧边的刻度只能显示 4 到 (n-4) 个 block,边缘没了」）——
  // 每一根的高度**在这儿算死**,不再由 flexGrow 去分。
  //
  // ⚠️ 原来那一版是 `flexGrow: BASE_SHARE + w` 配 `maxHeight: 26px`。CSS 的伸缩算法在
  // 「一批项目顶到 max、剩下的分不够」时,会把**没顶到的那些冻结在自己的基准尺寸上**
  // （这里是那根 1px 的线）——于是总高一超,`justify-center` 把超出的部分从**两头**挤出去,
  // 头尾各几根就被裁掉了。他数出来的正是这个:中间那一段在,两边没了。
  //
  // 现在的办法：一个统一的缩放系数 —— 高度既不许超过刻度条（`railH / 总权重`）,也不许有
  // 哪一根超过上限（`MAX_SLICE_PX / 最大权重`），取两者里小的那个。⇒ 总高恒 ≤ 刻度条,
  // 一根都挤不出去,而短项目仍然是居中的一小簇（那时候是上限在起作用）。
  const slices = useMemo(() => {
    const n = entries.length;
    if (n === 0 || railH <= 0) return [] as number[];
    const weights = entries.map((_, i) => BASE_SHARE + lensWeight(Math.abs(i - current)));
    const sum = weights.reduce((a, b) => a + b, 0);
    const peak = Math.max(...weights);
    const scale = Math.min(railH / sum, MAX_SLICE_PX / peak);
    return weights.map((w) => w * scale);
  }, [entries, current, railH]);

  /** 第一根的上沿离刻度条顶上多远（短项目居中的那个留白）。指针换算和预览卡都按它来。 */
  const padTop = useMemo(() => {
    const total = slices.reduce((a, b) => a + b, 0);
    return Math.max(0, (railH - total) / 2);
  }, [slices, railH]);

  const goTo = useCallback(
    (idx: number, smooth: boolean) => {
      const id = entriesRef.current[idx]?.id;
      if (!id) return;
      setCurrent(idx);
      useActiveBlockStore.getState().setActive(id);
      // 'auto' while dragging: queued smooth scrolls fight each other and the feed lags a
      // long way behind the finger.
      scrollBlockIntoView(scrollRef.current, id, smooth ? 'smooth' : 'auto');
    },
    [scrollRef],
  );

  /** 拖动时:指针在哪一根上。⭐ 走 `indexAtOffset`,⛔ 不是按比例 —— 透镜让每根不等高,
   *  按比例算出来的那一块和指针底下那一根不是同一块。 */
  const indexAtPointer = useCallback(
    (clientY: number): number => {
      const rect = railRef.current?.getBoundingClientRect();
      if (!rect) return -1;
      return indexAtOffset(slices, clientY - rect.top - padTop);
    },
    [slices, padTop],
  );

  /** 点一根刻度。命中的那一根走查找的跳转（接上块内高亮 + ▲▼ 的位置），别的照旧。
   *  ⛔ 拖动时不走这里 —— 拖过一片命中会把查找位置连着改十几次。 */
  const pick = useCallback(
    (idx: number) => {
      const id = entriesRef.current[idx]?.id;
      if (id && matches.has(id)) {
        setCurrent(idx);
        useActiveBlockStore.getState().setActive(id);
        // ⚠️ 这里**不**自己滚：jumpToResult 会把这一块设成查找目标，BlockFeed 跟着把它滚到
        // 视野中间。两边都滚的话，会先跳到顶上再弹到中间。
        useSearchStore.getState().jumpToResult(id);
        return;
      }
      goTo(idx, true);
    },
    [matches, goTo],
  );

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent): void => {
      const idx = indexAtPointer(e.clientY);
      if (idx >= 0) goTo(idx, false);
    };
    const onUp = (): void => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, indexAtPointer, goTo]);

  // ⭐ 预览列要排哪几张：这个项目里**所有**命中的块，取以当前那一块为中心的一段，
  // 最多 MAX_PREVIEW_CARDS 张（Ocean 第三轮第 4 条）。
  //
  // ⚠️ 数的是**命中**，⛔ 不是块：中间隔着二十块没命中的，两个命中仍然是相邻的两张卡。
  // 这正是这一列存在的理由 —— 把散在长项目各处的命中收到一屏里。
  // ⚠️ 命中不超过六个时**一张不少地全排出来**（他要的「直接显示所有 blocks 的命中预览」）；
  // 超过了才截，而截出来的那一段永远**含着中心**，所以滑动时窗口跟着人走。
  const miniList = useMemo(() => {
    if (matches.size === 0) return [] as { idx: number; hit: SearchHit }[];
    const hitIdxs: number[] = [];
    for (let i = 0; i < entries.length; i++) {
      if (matches.has(entries[i]!.id)) hitIdxs.push(i);
    }
    if (hitIdxs.length === 0) return [];
    // 当前块在命中序列里的位置（命中了就是它自己，没命中就是它该插进去的地方）。
    let centre = hitIdxs.findIndex((i) => i >= current);
    if (centre < 0) centre = hitIdxs.length - 1;
    // 以 centre 为中心截 MAX_PREVIEW_CARDS 个，两头不够就往回补 —— ⛔ 别让最后几个命中
    // 永远排不出来（那样滑到底部时这一列会只剩两张）。
    const half = Math.floor((MAX_PREVIEW_CARDS - 1) / 2);
    let from = Math.max(0, centre - half);
    const to = Math.min(hitIdxs.length, from + MAX_PREVIEW_CARDS);
    from = Math.max(0, to - MAX_PREVIEW_CARDS);
    return hitIdxs.slice(from, to).map((idx) => ({ idx, hit: matches.get(entries[idx]!.id)! }));
  }, [matches, entries, current]);

  /** 预览列这会儿该不该出来。⭐ 两个入口（Ocean 第三轮第 1 条）：**鼠标靠近**这一栏，
   *  或者**正在上下滑动**。⚠️ 后面两个条件缺一不可：不是在拖刻度（拖的时候人看的是正文），
   *  而且这个项目里真的有命中 —— 没命中还滑出来一条空的，比不滑更让人困惑。 */
  const miniOpen = (railHovered || scrolling) && !dragging && miniList.length > 0;

  // A single block is not a scale — one tick tells the reader nothing they cannot already see.
  if (entries.length < 2) return null;

  // ⭐ 2026-08-25（Ocean）:「用户悬浮在每一个刻度上可以预览 block 的信息块(少放点内容,
  // 有批注用批注,没批注用正文前几句话)」. 批注优先是他定的,也是对的 —— 批注是这个人自己
  // 写下的「这一块是干什么的」,比正文开头更像一个标题（W7 在正文那边也是这么排的）。
  const preview = ((): { at: number; text: string; hit: SearchHit | null } | null => {
    // ⚠️ 小 block 那一列展开的时候就不画这张单卡了 —— 两个一起出会互相盖。
    if (miniOpen) return null;
    if (hovered === null || dragging) return null;
    const entry = entries[hovered];
    if (!entry) return null;
    const block = blocks?.find((b) => b.id === entry.id);
    // ⭐ 对上了的那一块，预览的是**对上的那一行**：此刻这个人问的是「哪一块里有这个词」，
    // 批注回答的是另一个问题（这一块整体是干什么的），在这时候反而不是他要的那句。
    const hit = matches.get(entry.id) ?? null;
    const note = block?.annotation?.trim();
    const body = hit
      ? hitLine(hit)
      : note && note.length > 0
        ? note
        : plainText(block?.content ?? '');
    const text = body.replace(/\s+/g, ' ').trim().slice(0, PREVIEW_CHARS);
    // 那一根的中线,刻度条自己的坐标系里。
    const at = padTop + slices.slice(0, hovered).reduce((a, b) => a + b, 0) + (slices[hovered] ?? 0) / 2;
    return { at, text, hit };
  })();

  return (
    <div
      ref={railRef}
      data-scale-rail
      onMouseEnter={() => setRailHovered(true)}
      onMouseLeave={() => {
        setHovered(null);
        setRailHovered(false);
      }}
      onMouseDown={(e) => {
        e.preventDefault();
        setDragging(true);
        const idx = indexAtPointer(e.clientY);
        if (idx >= 0) pick(idx);
      }}
      // ⚠️ 16px and not a pixel more. An earlier version wrapped this in a 28px hover zone so
      // the rail would brighten as the cursor approached — but that zone sits ON TOP of the
      // feed and swallows everything along its right edge: text selection, block hover, the
      // start of a drag-marquee. A control may take the width it actually occupies and no
      // more. 16px is about a macOS scrollbar, which is the gesture users already have.
      // ⚠️ ⛔ 没有 `py-*` 了：那 12px 上下留白,在长项目里正好吃掉头尾各几根的位置,
      // 看上去就是「边缘没了」。刻度现在铺满整条,短项目靠 `justify-center` 居中。
      className="group absolute bottom-0 right-0 top-0 z-10 flex w-4 cursor-pointer flex-col justify-center pr-1"
    >
      {entries.map((e, i) => {
        const w = lensWeight(Math.abs(i - current));
        const isCurrent = i === current;
        // 命中的那一根：⭐ 有一个**下限长度**。透镜会把远处的刻度收到 34%，命中却恰恰常常在
        // 远处 —— 按原来的长度画出来，「这个项目还有五处」就淹在那一列灰线里看不出来了。
        const isMatch = matches.has(e.id);
        const width = isMatch ? Math.max(34 + 66 * w, 72) : 34 + 66 * w;
        return (
          <div
            key={e.id}
            onMouseEnter={() => setHovered(i)}
            // ⭐ 高度是算好的像素（slices）。⛔ 别改回 flexGrow —— 见上面 slices 那一段:
            // 那正是头尾几根被挤出去的原因。
            style={{ height: slices[i] ?? 0 }}
            className="flex min-h-0 shrink-0 items-center justify-end"
          >
            {/* ⭐ 中心点的记号（Ocean 第三轮:「滑动时，刻度需要标出当前的中心点位置」）。
                ⚠️ 光靠颜色和长度已经分不出来了 —— 命中也是 accent 色、也加长。所以给当前
                那一根在**左端**点一个小圆点：它是这一列里唯一一个不是横线的东西。
                ⚠️ 只在预览开着（滑动中 / 鼠标靠近）时画，⛔ 平时不留一个常驻的点。 */}
            {isCurrent && miniOpen && (
              <span className="mr-auto h-[3px] w-[3px] flex-none rounded-full bg-accent" />
            )}
            <span
              // ⭐ 「刻度最长…依次递减」 —— and length tapers with the same weight.
              // ⚠️ `transition` names its properties: `transition-all` also animated colour
              // and background on 200 nodes at once, which is half of why this felt heavy.
              style={{ width: `${width}%`, transitionProperty: 'width, opacity' }}
              // ⭐ 2026-08-27（Ocean:「当前那一根要在刻度上标出来」）——当前那一根**加粗到 2px**。
              // ⚠️ 光靠颜色分不出来了：命中也是 accent 色（那是这一批刚加的），所以在长度和
              // 颜色之外还得有第三样东西说「你在这儿」。
              className={`duration-150 ease-out ${isCurrent ? 'h-[2px]' : 'h-px'} ${
                isCurrent
                  ? 'bg-accent opacity-100'
                  : isMatch
                    ? // 命中但不是当前那一块：同一个 accent，淡一档 —— 当前那根仍然是最长
                      // 最实的一根，两者分得开。
                      `bg-accent ${i === hovered ? 'opacity-90' : 'opacity-60'}`
                    : i === hovered
                      ? 'bg-ink opacity-60'
                      : 'bg-ink opacity-[0.10] group-hover:opacity-45'
              }`}
            />
          </div>
        );
      })}

      {/* ⭐⭐ 命中预览列（2026-08-27 第三轮）。滑动时、或鼠标靠近时出现。
          ⚠️⚠️ **外面这一层是那条「缓冲带」**（Ocean:「鼠标移出刻度就无法点击」）：它从刻度的
          右边缘一直铺到卡片左边（`right-0` + `pr-5` + `pl-10`），而且是刻度这个节点的**子节点**
          —— 所以从刻度往左移向卡片的一路上，指针**始终在同一棵子树里**，`onMouseLeave` 不会触发，
          预览也就不会在半路上消失。⛔ 别把 `pl-10` 收掉，那正是「附近侧区域」这四个字。
          ⚠️ `onMouseDown` 要 `stopPropagation`：外面那一层的 mousedown 是「按住刻度拖动」，
          不拦住的话点一张卡会同时启动一次拖动，跳到指针底下那一根去。 */}
      {miniOpen && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          className="absolute right-0 top-1/2 z-20 flex max-h-full -translate-y-1/2 flex-col justify-center gap-1 overflow-hidden py-1 pl-10 pr-5"
        >
          {miniList.map(({ idx, hit }) => {
            const isHere = idx === current;
            // ⭐ 从命中词往前一点开始切，并且把命中词的位置带回来 —— 卡片上必须看得见它。
            const lead = hitLead(hit, MINI_CHARS);
            const text = lead.text.replace(/\s+/g, ' ');
            return (
              <button
                key={entries[idx]!.id}
                type="button"
                onClick={() => {
                  useActiveBlockStore.getState().setActive(entries[idx]!.id);
                  // ⚠️ 和点刻度同一条路：让 jumpToResult 去滚，⛔ 这里不自己滚。
                  useSearchStore.getState().jumpToResult(entries[idx]!.id);
                }}
                onMouseEnter={() => setHovered(idx)}
                style={{ width: PREVIEW_COL_W }}
                // ⭐ 壳子和下面那张悬浮预览卡是**同一套**（`rounded-md border-line bg-paper`
                // + 12px 正文）——Ocean 第三轮第 2 条「复用非搜索状态下的小 block」。
                // ⚠️ 当前那一块靠**描边和底色**突出，⛔ 不靠尺寸（尺寸全都一样大）。
                className={`block rounded-md border px-2 py-1.5 text-left font-ui text-[12px] leading-[1.45] transition-colors ${
                  isHere
                    ? 'border-accent bg-accent-soft text-ink shadow-[var(--shadow-card)]'
                    : 'border-line bg-paper text-ink-2 hover:border-accent'
                }`}
                title={text}
              >
                <span className="block truncate">
                  {lead.match ? (
                    <>
                      {text.slice(0, lead.match.start)}
                      <mark
                        className="rounded-sm px-0.5 text-ink"
                        style={{ backgroundColor: 'rgba(251, 191, 36, 0.45)' }}
                      >
                        {text.slice(lead.match.start, lead.match.end)}
                      </mark>
                      {text.slice(lead.match.end)}
                    </>
                  ) : (
                    text || t('（这一块没有文字）')
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* 预览卡。⛔ `pointer-events-none` —— 它飘在正文上面,不许吃掉任何一次点击或划词。
          ⚠️ 画在刻度条里面（刻度条是 absolute,自己就是定位基准）,所以位置只跟刻度有关,
          和滚到哪儿无关。 */}
      {preview && (
        <div
          style={{
            top:
              railH <= PREVIEW_HALF_PX * 2
                ? railH / 2
                : Math.min(Math.max(preview.at, PREVIEW_HALF_PX), railH - PREVIEW_HALF_PX),
          }}
          className="pointer-events-none absolute right-5 z-20 w-56 -translate-y-1/2 rounded-md border border-line bg-paper px-2.5 py-2 shadow-[var(--shadow-toast)]"
        >
          <div className="mb-1 flex items-center gap-1.5 font-ui text-[10px] text-muted">
            <span>{t('第 {n} / {total} 块', { n: (hovered ?? 0) + 1, total: entries.length })}</span>
            {preview.hit && (
              <span className="flex-none rounded-sm border border-line px-1 text-accent">
                {preview.hit.field === 'annotation' ? t('批注命中') : t('查找命中')}
              </span>
            )}
          </div>
          <div className="line-clamp-4 whitespace-pre-wrap break-words font-ui text-[12px] leading-[1.5] text-ink-2">
            {preview.text || t('（这一块没有文字）')}
          </div>
        </div>
      )}
    </div>
  );
}
