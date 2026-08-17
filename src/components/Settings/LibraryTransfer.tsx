import { open, save } from '@tauri-apps/plugin-dialog';
import { useState } from 'react';
import { CURRENT_SCHEMA_VERSION } from '@/lib/db/client';
import { ImportError, exportLibraryTo, importLibraryFrom, type ImportOutcome } from '@/lib/db/transfer';
import { t as tt, useT } from '@/lib/i18n';

// 换机器：导出 / 导入整个库 (DESIGN_LIBRARY_TRANSFER).
//
// Import MERGES (§0) — nothing already on this machine is overwritten, so this panel never
// asks "are you sure": the file picker is the deliberate act, and what arrived is reported
// afterwards in numbers the user can check.

const humanSize = (bytes: number): string =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const defaultName = (): string => {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  return `spool-库-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.db`;
};

// The raw error goes to the console; the user gets a sentence in their own language. An
// unrecognised failure says what is true and what the user most needs to know — that the
// library on this machine was not touched (every insert is additive and id-keyed, so a
// merge that died halfway is finished by importing the same file again).
const explain = (e: unknown): string => {
  console.error('[library-transfer]', e);
  if (e instanceof ImportError) {
    if (e.code === 'same-library') return tt('这就是这台机器上正在用的那个库');
    if (e.code === 'not-a-library') return tt('这个文件不是 Spool 的库');
    return tt('这份库来自更新的 Spool(v{theirs}),这台机器上的只认到 v{ours},请先更新 Spool', {
      theirs: e.version,
      ours: CURRENT_SCHEMA_VERSION,
    });
  }
  return tt('没做成,这台机器上的库没有被改动');
};

export default function LibraryTransfer() {
  const t = useT();
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);
  const [exported, setExported] = useState<string | null>(null);
  const [imported, setImported] = useState<ImportOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async (): Promise<void> => {
    setError(null);
    setExported(null);
    const dest = await save({ defaultPath: defaultName(), filters: [{ name: 'Spool', extensions: ['db'] }] });
    if (!dest) return;
    setBusy('export');
    try {
      setExported(humanSize(await exportLibraryTo(dest)));
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(null);
    }
  };

  const handleImport = async (): Promise<void> => {
    setError(null);
    setImported(null);
    const picked = await open({ multiple: false, filters: [{ name: 'Spool', extensions: ['db'] }] });
    if (typeof picked !== 'string') return;
    setBusy('import');
    try {
      setImported(await importLibraryFrom(picked));
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(null);
    }
  };

  const added = imported?.added;
  // Every count can be zero (re-importing a file that is already here), and a row of
  // zeroes reads like a failure. That case gets its own sentence instead.
  const broughtSomething = added ? added.workspaces + added.threads + added.blocks > 0 : false;

  return (
    <div>
      <div className="flex items-center justify-between gap-4 py-2.5">
        <div className="min-w-0">
          <div className="text-sm text-ink">{t('导出整个库')}</div>
          <div className="mt-0.5 text-xs text-muted">
            {t('存成一个文件,换机器的时候用它把东西带过去')}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleExport()}
          disabled={busy !== null}
          className="flex-none rounded-md border border-line bg-paper px-3 py-1.5 text-xs text-ink transition-colors hover:border-line-strong disabled:opacity-50"
        >
          {busy === 'export' ? t('导出中…') : t('导出')}
        </button>
      </div>

      <div className="flex items-center justify-between gap-4 py-2.5">
        <div className="min-w-0">
          <div className="text-sm text-ink">{t('导入一个库')}</div>
          <div className="mt-0.5 text-xs text-muted">
            {t('把另一台机器导出的文件合并进来,这台机器上现有的东西一条都不会被改')}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleImport()}
          disabled={busy !== null}
          className="flex-none rounded-md border border-line bg-paper px-3 py-1.5 text-xs text-ink transition-colors hover:border-line-strong disabled:opacity-50"
        >
          {busy === 'import' ? t('导入中…') : t('导入')}
        </button>
      </div>

      {exported && (
        <div className="pb-2.5 text-xs text-muted">{t('已导出,{size}', { size: exported })}</div>
      )}

      {imported && added && (
        <div className="pb-2.5 text-xs text-muted">
          {broughtSomething ? (
            <div className="text-ink">
              {t('带进来 {workspaces} 个工作区、{threads} 个项目、{blocks} 条信息', {
                workspaces: added.workspaces,
                threads: added.threads,
                blocks: added.blocks,
              })}
            </div>
          ) : (
            <div className="text-ink">{t('这个文件里的东西,这台机器上已经都有了')}</div>
          )}
          {imported.skipped > 0 && (
            <div className="mt-0.5">
              {t('有 {n} 条这台机器上已经有了,跳过了', { n: imported.skipped })}
            </div>
          )}
          {/* §3.4 — the paths came from another machine. Said once, plainly, because the
              alternative is the user finding out weeks later by clicking a file. */}
          {imported.missingFiles > 0 && (
            <div className="mt-0.5">
              {t('有 {n} 个文件在这台机器上找不到 —— 文字都还在,只是点开会失败', {
                n: imported.missingFiles,
              })}
            </div>
          )}
          {broughtSomething && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-1.5 rounded-md border border-line bg-paper px-2.5 py-1 text-xs text-ink transition-colors hover:border-line-strong"
            >
              {t('重新载入,看带进来的东西')}
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="pb-2.5 text-xs" style={{ color: 'var(--urgent)' }}>
          {error}
        </div>
      )}
    </div>
  );
}
