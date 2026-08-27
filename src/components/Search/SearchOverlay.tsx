import { Search as SearchIcon } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { isImeComposing } from '@/lib/utils/ime';
import type { SearchHit } from '@/lib/search/query';
import { useSearchStore } from '@/stores/searchStore';
import { useThreadsStore } from '@/stores/threadsStore';
import SearchResultItem from './SearchResultItem';
import { useT } from '@/lib/i18n';

// Global search overlay (PLAN_EN.md §9.10 / Phase 7). An in-window modal — clicking
// a result navigates the main window. 三个入口：窗口里的 ⌘F（2026-08-27，划了词就带着那个
// 词进来）、系统级的 ⌘⇧F（窗口没在前面时用的那个，设置里可改）、侧边栏那个放大镜。
export default function SearchOverlay() {
  const t = useT();
  const open = useSearchStore((s) => s.open);
  const query = useSearchStore((s) => s.query);
  const results = useSearchStore((s) => s.results);
  const loading = useSearchStore((s) => s.loading);
  const error = useSearchStore((s) => s.error);
  const setQuery = useSearchStore((s) => s.setQuery);
  const closeSearch = useSearchStore((s) => s.closeSearch);
  const highlight = useSearchStore((s) => s.highlight);
  const select = useThreadsStore((s) => s.select);

  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // ⭐ 2026-08-27：`select()` 不只是选中 —— ⌘F 是划了词之后按的，搜索框里已经有那个词了，
  // 不全选的话下一个字会**接在它后面**，用户得先删一遍。选中之后，接着打字就是换一个词，
  // 直接按 ↵ 就是查划中的这个。
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [open]);

  // A fresh result set resets the selection to the top.
  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  if (!open) return null;

  // Navigate to the result's thread, mark its block for scroll + flash, then close.
  const navigate = (hit: SearchHit) => {
    select(hit.threadId);
    highlight(hit.blockId);
    closeSearch();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // IME composition (e.g. typing English via pinyin) needs Enter / arrows
    // to commit or move through candidates. Hijacking those keystrokes as
    // navigation would jump to the first result before the user even saw the
    // candidate list.
    if (isImeComposing(e.nativeEvent)) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSearch();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = results[selectedIndex];
      if (hit) navigate(hit);
    }
  };

  const trimmed = query.trim();

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center bg-ink/30 px-8 pt-[12vh]"
      onClick={closeSearch}
    >
      <div
        className="flex max-h-[72vh] w-[620px] flex-col overflow-hidden rounded-lg border border-line-strong bg-paper"
        style={{ boxShadow: 'var(--shadow-toast)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-none items-center gap-2 border-b border-line px-4 py-3">
          <SearchIcon size={15} className="flex-none text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('搜索所有工作区与项目的内容…')}
            className="flex-1 bg-transparent font-ui text-[14px] text-ink outline-none placeholder:text-muted"
            spellCheck={false}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {error ? (
            <p className="px-3 py-8 text-center text-xs" style={{ color: 'var(--urgent)' }}>
              {t('搜索出错：{msg}', { msg: error })}
            </p>
          ) : !trimmed ? (
            <p className="px-3 py-8 text-center text-xs italic text-muted">
              {t('输入关键词，搜索任意项目里的内容与批注')}
            </p>
          ) : results.length === 0 && !loading ? (
            <p className="px-3 py-8 text-center text-xs italic text-muted">
              {t('没有找到 —— 换个关键词试试？')}
            </p>
          ) : (
            <div className="space-y-1">
              {results.map((hit, i) => (
                <SearchResultItem
                  key={hit.blockId}
                  hit={hit}
                  selected={i === selectedIndex}
                  onSelect={() => setSelectedIndex(i)}
                  onActivate={() => navigate(hit)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-none items-center justify-between border-t border-line bg-paper-2/40 px-4 py-2 text-[10px] text-muted">
          <span>{trimmed && results.length > 0 ? t('{n} 条结果', { n: results.length }) : t('全文搜索 · 纯本地')}</span>
          <span>{t('↑↓ 选择 · ↵ 跳转 · esc 关闭')}</span>
        </div>
      </div>
    </div>
  );
}
