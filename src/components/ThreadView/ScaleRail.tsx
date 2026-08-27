import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { plainText } from '@/lib/blocks/contentRuns';
import { indexAtOffset, scrollBlockIntoView } from '@/lib/blocks/viewportAnchor';
import { hitLine, type SearchHit } from '@/lib/search/query';
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

// ⭐⭐ 2026-08-27 第二轮（Ocean:「常驻的小 block 预览：以当前 block 为基准，把同一项目里命中
// 的块以小 block 形式排出来，只排当前上下各 5 个命中，尺寸以当前所在的 block 为中心向外递减」）。
//
// ⚠️⚠️ **宽度是红线，所以它做成了「鼠标靠过去才展开」**（Ocean 2026-08-27 在三个方案里选的
// 这一条）。刻度本身仍然是 16px —— 上面那句「一个控件只许占它实际占的宽度」一个字没改。
// 小 block 预览必然更宽，而这一列右边就是正文的右边缘：常驻一条宽的，等于把正文右边缘的
// 划词和点击永久吃掉。⇒ 只在鼠标进到刻度上的时候展开，鼠标一走就收回去。
// ⛔ 仍然不是浮窗：它是刻度自己的子节点，跟着刻度走。
const PREVIEW_EACH_SIDE = 5;

/** 小 block 预览这一列有多宽。⚠️ 只在展开的那一刻占着。 */
const PREVIEW_COL_W = 196;

/** 离中心每远一格缩多少。⭐「尺寸以当前所在的 block 为中心向外递减」就是这两行。 */
const PREVIEW_STEP = 0.085;
const PREVIEW_MIN_SCALE = 0.62;

/** 每一张小 block 里带几个字。⚠️ 比悬浮卡少 —— 它更小，而且一次要排十一张。 */
const MINI_CHARS = 60;

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
  /** 鼠标有没有进到这一栏里 —— 小 block 预览靠它展开。 */
  const [railHovered, setRailHovered] = useState(false);
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
      if (frame) return;
      frame = requestAnimationFrame(read);
    };
    read();
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
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

  // ⭐ 小 block 预览要排哪几张：以**当前那一块**为基准，同一项目里命中的块，上下各取 5 个。
  //
  // ⚠️ 「上下各 5 个命中」数的是**命中**，⛔ 不是块：中间隔着二十块没命中的，也还是相邻的
  // 两个命中。这正是这一列存在的理由 —— 把散在长项目各处的命中收到一屏里。
  // ⚠️ 当前那一块**自己命中了**就当中心；没命中就取它在命中序列里应当插入的位置，
  // 于是上面几个是「往回找」、下面几个是「往下找」，方向仍然对得上。
  const miniList = useMemo(() => {
    if (matches.size === 0) return [] as { idx: number; hit: SearchHit; distance: number }[];
    const hitIdxs: number[] = [];
    for (let i = 0; i < entries.length; i++) {
      if (matches.has(entries[i]!.id)) hitIdxs.push(i);
    }
    if (hitIdxs.length === 0) return [];
    // 当前块在命中序列里的位置（命中了就是它自己，没命中就是它该插进去的地方）。
    let centre = hitIdxs.findIndex((i) => i >= current);
    if (centre < 0) centre = hitIdxs.length - 1;
    const from = Math.max(0, centre - PREVIEW_EACH_SIDE);
    const to = Math.min(hitIdxs.length, centre + PREVIEW_EACH_SIDE + 1);
    return hitIdxs.slice(from, to).map((idx) => {
      const rank = hitIdxs.indexOf(idx);
      return {
        idx,
        hit: matches.get(entries[idx]!.id)!,
        // 离中心几格 —— 尺寸就是按它递减的。
        distance: Math.abs(rank - centre),
      };
    });
  }, [matches, entries, current]);

  /** 小 block 预览这会儿该不该出来。⚠️ 三个条件缺一不可：鼠标在这一栏里、查找开着、
   *  而且**这个项目里真的有命中** —— 没命中还滑出来一条空的，比不滑更让人困惑。 */
  const miniOpen = railHovered && !dragging && miniList.length > 0;

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

      {/* ⭐⭐ 小 block 预览列（2026-08-27 第二轮）。鼠标进这一栏才展开，出去就没。
          ⚠️ `right-5` = 贴着刻度往左排，⛔ 不越到刻度右边去（那儿是窗口边缘）。
          ⚠️ `onMouseDown` 要 `stopPropagation`：外面那一层的 mousedown 是「按住刻度拖动」，
          不拦住的话点一张小 block 会同时启动一次拖动，跳到指针底下那一根去。 */}
      {miniOpen && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          style={{ width: PREVIEW_COL_W }}
          className="absolute right-5 top-1/2 z-20 flex max-h-full -translate-y-1/2 flex-col justify-center gap-1 overflow-hidden"
        >
          {miniList.map(({ idx, hit, distance }) => {
            // ⭐「尺寸以当前所在的 block 为中心向外递减」。
            const scale = Math.max(PREVIEW_MIN_SCALE, 1 - distance * PREVIEW_STEP);
            const isHere = idx === current;
            const text = hitLine(hit).replace(/\s+/g, ' ').trim().slice(0, MINI_CHARS);
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
                style={{
                  width: `${scale * 100}%`,
                  fontSize: `${11 * scale}px`,
                  marginLeft: 'auto',
                }}
                className={`block truncate rounded border px-1.5 py-1 text-left font-ui leading-[1.45] transition-colors ${
                  isHere
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-line bg-paper text-ink-2 hover:border-accent hover:text-accent'
                }`}
                title={text}
              >
                {text || t('（这一块没有文字）')}
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
