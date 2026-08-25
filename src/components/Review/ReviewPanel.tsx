import { Check, FileText, Globe, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useT } from '@/lib/i18n';
import type { FileAccessRequest } from '@/lib/db/fileAccess';
import { passageSource, type ProposalBatch } from '@/lib/db/proposals';
import type { FollowUpProposal } from '@/lib/db/followUpItems';
import { useProposalsStore } from '@/stores/proposalsStore';
import { useThreadsStore } from '@/stores/threadsStore';

// DESIGN_MCP_WRITE_ROLE §4.3 — the review screen.
//
// One screen, and the two big buttons are the default: approve the batch or throw it out.
// Per-item checkboxes exist and are deliberately secondary. The reasoning is §4.3's: what
// the user is judging is "was this passage split up correctly", and a split that is wrong
// is usually wrong as a whole — picking three of eight costs more than telling the AI to
// try again. Building the per-item path as the primary one would also rebuild the exact
// thing §3.3 rejected: a per-block approval habit, which stops being a decision around the
// fiftieth click.
//
// No modal popped this open. §4.2 has the AI queueing a batch while the user may be
// asleep, and `capture-note-first`'s rule is that the main window never jumps to the
// front — so the way in is a quiet badge in the sidebar, and this appears only when the
// user asks for it.

const dayCount = (fromMs: number, toMs: number): number =>
  Math.max(0, Math.ceil((toMs - fromMs) / 86_400_000));

export default function ReviewPanel() {
  const t = useT();
  const open = useProposalsStore((s) => s.panelOpen);
  const batches = useProposalsStore((s) => s.batches);
  const fileRequests = useProposalsStore((s) => s.fileRequests);
  const followUpProposals = useProposalsStore((s) => s.followUpProposals);
  const expiredBatches = useProposalsStore((s) => s.expiredBatches);
  const busy = useProposalsStore((s) => s.busy);
  const close = useProposalsStore((s) => s.close);
  const approve = useProposalsStore((s) => s.approve);
  const reject = useProposalsStore((s) => s.reject);
  const approveFiles = useProposalsStore((s) => s.approveFiles);
  const rejectFiles = useProposalsStore((s) => s.rejectFiles);
  const approveFollowUp = useProposalsStore((s) => s.approveFollowUp);
  const dismissFollowUp = useProposalsStore((s) => s.dismissFollowUp);
  const clearExpired = useProposalsStore((s) => s.clearExpired);
  // Subscribe to the stored map, then flatten here. NOT useThreadsStore(selectAllThreadsFlat):
  // that selector builds a fresh array on every call, so zustand's useSyncExternalStore sees
  // a new snapshot each render and re-renders forever — React #185, which took the whole
  // window down on 2026-08-05 because this component is mounted at the app root and its hooks
  // run even while the screen is closed.
  const threadsByWs = useThreadsStore((s) => s.threadsByWorkspace);
  const threads = useMemo(() => Object.values(threadsByWs).flat(), [threadsByWs]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, close]);

  if (!open) return null;

  // Titles, never ids — the naming rule the MCP surfaces follow holds inside the app too.
  const titleOf = (threadId: string): string =>
    threads.find((th) => th.id === threadId)?.title || t('（无标题）');

  const now = Date.now();

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center bg-ink/30 px-8 pt-[10vh]"
      onClick={close}
    >
      <div
        className="flex max-h-[78vh] w-[560px] flex-col overflow-hidden rounded-lg border border-line-strong bg-paper"
        style={{ boxShadow: 'var(--shadow-toast)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-none items-center justify-between border-b border-line px-5 py-3">
          <div className="min-w-0">
            <h2 className="font-serif text-xl text-ink">{t('AI 提的，等你过目')}</h2>
            <p className="mt-0.5 text-xs text-muted">
              {t('这些还没进你的库。你点头才存，点「都不要」就当没发生过。')}
            </p>
          </div>
          <button
            onClick={close}
            className="flex-none rounded p-1 text-muted hover:bg-paper-2 hover:text-ink"
            aria-label={t('关闭')}
          >
            <X size={15} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {batches === null ? (
            <p className="py-8 text-center text-xs text-muted">{t('加载中…')}</p>
          ) : batches.length + (fileRequests?.length ?? 0) + (followUpProposals?.length ?? 0) ===
            0 ? (
            <p className="py-8 text-center text-xs text-muted">{t('没有待你过目的。')}</p>
          ) : (
            <>
              {/* DESIGN_PROJECT_FILES §3.4 — first, because it is the only kind that grants a
                  standing permission rather than storing one thing once. */}
              {(fileRequests ?? []).map((r) => (
                <FileRequestCard
                  key={r.requestId}
                  request={r}
                  title={titleOf(r.threadId)}
                  daysLeft={dayCount(now, r.expiresAt)}
                  busy={busy}
                  onApprove={() => void approveFiles(r.requestId)}
                  onReject={() => void rejectFiles(r.requestId)}
                />
              ))}
              {(followUpProposals ?? []).map((p) => (
                <FollowUpLineCard
                  key={p.id}
                  proposal={p}
                  busy={busy}
                  onApprove={() => void approveFollowUp(p.id)}
                  onDismiss={() => void dismissFollowUp(p.id)}
                />
              ))}
              {batches.map((batch) => (
                <BatchCard
                  key={batch.id}
                  batch={batch}
                  titleOf={titleOf}
                  daysLeft={dayCount(now, batch.expiresAt)}
                  busy={busy}
                  onApprove={() => void approve(batch.id)}
                  onReject={() => void reject(batch.id)}
                  onApproveSome={(ids) => void approve(batch.id, ids)}
                />
              ))}
            </>
          )}

          {/* §4.2-3: an expired batch is void, not pending. It gets one line — enough to
              explain why the badge went down without the user doing anything, and no
              affordance that suggests it could still be approved. */}
          {expiredBatches > 0 && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-line bg-paper-2/40 px-3 py-2">
              <span className="text-xs text-muted">
                {t('{n} 批已过期（超过 7 天没处理），已经作废。', { n: expiredBatches })}
              </span>
              <button
                type="button"
                onClick={() => void clearExpired()}
                className="flex-none rounded border border-line bg-paper px-2 py-0.5 text-[11px] text-muted transition-colors hover:border-accent hover:text-accent"
              >
                {t('清掉')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * DESIGN_PROJECT_FILES §3.4 — «Codex 想读 2 个文件，理由：核对 CMU 的课程表».
 *
 * Three things are on this card because the user cannot judge the request without them:
 * WHICH files (by name, never a path they have to decode), WHY, and — the part no design
 * doc asked for and a person absolutely needs — that the yes is STANDING. A grant that
 * silently outlives the conversation it was asked in is a permission the user did not
 * knowingly give, so the card says so and says where to take it back.
 *
 * No per-file checkboxes. The request is one question ("may you read these three to answer
 * that"), and splitting it would produce approvals nobody meant — the same reasoning §4.3
 * gives for keeping the batch, not the item, as the unit of a decision.
 */
function FileRequestCard({
  request,
  title,
  daysLeft,
  busy,
  onApprove,
  onReject,
}: {
  request: FileAccessRequest;
  title: string;
  daysLeft: number;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const t = useT();
  return (
    <div className="mb-3 rounded-md border border-line-strong bg-paper-2/30 p-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-xs text-ink-2">
          {t('{client} 想读〈{title}〉里的 {n} 个文件', {
            client: request.client || 'AI',
            title,
            n: request.files.length,
          })}
        </span>
        <span className="flex-none font-mono text-[10px] text-muted">
          {t('{n} 天后作废', { n: daysLeft })}
        </span>
      </div>

      <ul className="mt-2 space-y-1">
        {request.files.map((f) => (
          <li key={f.attachmentId} className="flex items-center gap-1.5">
            <FileText size={11} className="flex-none text-muted" />
            <span className="min-w-0 flex-1 truncate text-xs text-ink" title={f.target}>
              {f.label.trim() || f.target}
            </span>
            {/* How much text it would actually be handing over. The one number that makes
                "是不是太多了" answerable. */}
            {f.extractedChars !== null && (
              <span className="flex-none font-mono text-[10px] text-muted">
                {t('{n} 字', { n: f.extractedChars })}
              </span>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-2 rounded border border-line bg-paper px-2.5 py-2">
        <div className="text-[10px] uppercase tracking-wide text-muted">{t('它说要干什么')}</div>
        <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-ink-2">
          {request.why}
        </p>
      </div>

      <p className="mt-2 text-[10px] leading-relaxed text-muted">
        {t('答应了就是长期的：以后它随时能读这几个文件。要收回，去这个项目右边的「项目文件」里点掉那一行。')}
      </p>

      <div className="mt-2.5 flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onApprove}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-accent/60 bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent transition-colors enabled:hover:border-accent enabled:hover:bg-accent/15 disabled:opacity-40"
        >
          <Check size={12} />
          {t('可以读')}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onReject}
          title={t('直接扔掉，不留痕迹')}
          className="flex flex-none items-center gap-1.5 rounded-md border border-line bg-paper px-3 py-1.5 text-xs text-muted transition-colors enabled:hover:border-line-strong enabled:hover:text-ink disabled:opacity-40"
        >
          <Trash2 size={12} />
          {t('不给')}
        </button>
      </div>
    </div>
  );
}

/**
 * DESIGN_FOLLOW_UP §8.4 — one line an AI proposed for a project's follow-up list.
 *
 * ⚠️ This card IS the security control, not a nicety. A line here outlives the conversation
 * that produced it: the next conversation, with a different model, reads it as something the
 * user wants looked into and goes looking. A tool that filed one directly would let a page
 * an AI happened to read plant a standing search instruction in the user's library
 * (§2.5's injection risk with a privilege escalation on the end). Ocean 拍板 2026-08-16:
 * 要点一下.
 *
 * One line per card, rather than the whole-list rewrite this replaces: the user approves
 * what they read, and nothing they have not read can ride along with it.
 */
function FollowUpLineCard({
  proposal,
  busy,
  onApprove,
  onDismiss,
}: {
  proposal: FollowUpProposal;
  busy: boolean;
  onApprove: () => void;
  onDismiss: () => void;
}) {
  const t = useT();
  return (
    <div className="mb-3 rounded-md border border-line-strong bg-paper-2/30 p-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-center gap-1.5 truncate text-xs text-ink-2">
          <Globe size={12} className="flex-none text-muted" />
          {t('{client} 想给〈{title}〉加一条要跟进的', {
            client: proposal.proposedBy || 'AI',
            title: proposal.threadTitle || t('（无标题）'),
          })}
        </span>
      </div>

      <div className="mt-2 rounded border border-line bg-paper px-2.5 py-2">
        <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-ink">
          {proposal.text}
        </p>
        {/* §3.4 第 3 条 — the one thing the user actually judges: not "is this true" but
            "what has this got to do with me". */}
        {proposal.why && (
          <p className="mt-1.5 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-muted">
            {proposal.why}
          </p>
        )}
      </div>

      <p className="mt-2 text-[10px] leading-relaxed text-muted">
        {proposal.standing
          ? t('加进去之后是「永久跟进」，不会因为查到一次答案就消失。想改去项目里的「这个项目跟进什么」。')
          : t('加进去之后，AI 查到答案就会把它收起来——收起来还看得见，也能再打开。')}
      </p>

      <div className="mt-2.5 flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onApprove}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-accent/60 bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent transition-colors enabled:hover:border-accent enabled:hover:bg-accent/15 disabled:opacity-40"
        >
          <Check size={12} />
          {t('加进去')}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onDismiss}
          title={t('直接扔掉，不留痕迹')}
          className="flex flex-none items-center gap-1.5 rounded-md border border-line bg-paper px-3 py-1.5 text-xs text-muted transition-colors enabled:hover:border-line-strong enabled:hover:text-ink disabled:opacity-40"
        >
          <Trash2 size={12} />
          {t('不用')}
        </button>
      </div>
    </div>
  );
}
interface CardProps {
  batch: ProposalBatch;
  titleOf: (threadId: string) => string;
  daysLeft: number;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onApproveSome: (ids: string[]) => void;
}

function BatchCard({
  batch,
  titleOf,
  daysLeft,
  busy,
  onApprove,
  onReject,
  onApproveSome,
}: CardProps) {
  const t = useT();
  // Everything starts checked: the primary path is "all of it", and the checkboxes are
  // there to take something out, not to build the batch up one click at a time.
  const [picked, setPicked] = useSelection(batch);
  const partial = picked.size > 0 && picked.size < batch.items.length;
  // The button counts BLOCKS, not rows on this screen. §4.4 A stores the passage as a
  // block of its own, in a project that may not be any of the ones listed below — so a
  // button reading "store all 2" while three blocks land in three projects would be the
  // screen telling the user something untrue about the click they are about to make.
  const passageBlock = batch.sourceText && batch.sourceThreadId ? 1 : 0;

  return (
    <div className="mb-3 rounded-md border border-line-strong bg-paper-2/30 p-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-xs text-ink-2">
          {batch.note ?? t('{client} 提了 {n} 条', { client: batch.client, n: batch.items.length })}
        </span>
        <span className="flex-none font-mono text-[10px] text-muted">
          {t('{n} 天后作废', { n: daysLeft })}
        </span>
      </div>

      {/* §4.4 A. The passage is the longest thing that lands and the only one whose text
          the AI handed over verbatim, so it is shown whole and said plainly rather than
          folded away behind a "show original". §4.4-bis: the label it will carry is spelled
          out here — it is the answer to "whose words are these", which is the one question
          this block raises and the items below do not. */}
      {batch.sourceText && batch.sourceThreadId && (
        <div className="mt-2 rounded border border-line bg-paper px-2.5 py-2">
          <div className="flex items-baseline justify-between gap-2">
            <div className="min-w-0 text-[10px] uppercase tracking-wide text-muted">
              {t('原文 — 会存进〈{title}〉，来源标着「{source}」', {
                title: titleOf(batch.sourceThreadId),
                source: passageSource(batch.client),
              })}
            </div>
            {/* DESIGN_CONTEXT_HYGIENE §9.5: the passage is the one thing here that can be
                document-sized, and a project's pack budget is finite — 「把整场对话分流进来」
                is precisely the case where this number goes from 300 to 6,000. It is shown
                rather than capped: refusing a long passage would also refuse the legitimate
                case (a long article the user handed over), and the person who should decide
                whether it is worth the room is the one reading it. */}
            <span className="flex-none font-mono text-[10px] text-muted">
              {t('{n} 字', { n: [...batch.sourceText].length })}
            </span>
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-ink-2">
            {batch.sourceText}
          </p>
          <div className="mt-1 text-[10px] text-muted">
            {t('下面每条都会标注「出自这段」。这段本身也算一块。')}
          </div>
        </div>
      )}

      <ul className="mt-2 space-y-1.5">
        {batch.items.map((item) => {
          const on = picked.has(item.id);
          return (
            <li key={item.id}>
              <label className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 hover:bg-paper">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() =>
                    setPicked((prev) => {
                      const next = new Set(prev);
                      if (on) next.delete(item.id);
                      else next.add(item.id);
                      return next;
                    })
                  }
                  className="mt-0.5 flex-none accent-current"
                />
                <span className={`min-w-0 flex-1 ${on ? '' : 'opacity-40'}`}>
                  <span className="block text-[10px] text-accent">
                    {t('进〈{title}〉', { title: titleOf(item.threadId) })}
                    {/* v14 (§9.3 拍板甲): a correction does more than land a block — it hangs
                        a line under an existing one. Approving it without being told that
                        would be approving a change to a block the user is not looking at. */}
                    {item.refKind === 'corrects' && (
                      <span className="ml-1.5 rounded border border-line px-1 text-muted">
                        {t('更正已有的一块')}
                      </span>
                    )}
                  </span>
                  {/* ⭐ S6（2026-08-24，Ocean 选乙）—— **引文和更正正文并排摆。**
                      他指的那一条（真库 seq 25 → seq 21）：引文划的是「NEU co-op、UCSD co-op
                      与 GT MS-HCI 暑期窗口都不是……；不要把任何学校称为真正保底。」四个主张，
                      而这条更正实际只更正 GT MS-HCI 那一段。他的原话：「但是 NEU co-op、
                      UCSD co-op 并不是被更正内容」——**他是对的**，而在这一屏上他**看不到引文**，
                      所以判不了。批准之后那四个主张会被一起划掉，其中三个没人更正过。

                      ⛔ **不做机器判「这句里有几个主张」** —— 判不了，而且判错的方向是把对的挡掉。
                      摆出来，让人一眼看出跨度对不对，判断权留在人手里。

                      ⚠️ 引文能摆出来，是因为它进得了库就一定对得上目标块
                      （`api_engine.rs::gate_proposals` 逐字闸）。⛔ 那道闸的输入一个字符都不许动。 */}
                  {item.refKind === 'corrects' && item.correctedQuote ? (
                    <span className="mt-1 grid grid-cols-2 gap-2 rounded border border-line/70 bg-paper/60 p-1.5">
                      <span className="block min-w-0">
                        <span className="block text-[10px] uppercase tracking-wide text-muted">
                          {t('会在旧块里划出这一段')}
                        </span>
                        <span className="mt-0.5 block whitespace-pre-wrap break-words border-l-2 border-[var(--notice-warm-edge)] pl-1.5 text-[11px] leading-snug text-ink-2">
                          {item.correctedQuote}
                        </span>
                      </span>
                      <span className="block min-w-0">
                        <span className="block text-[10px] uppercase tracking-wide text-muted">
                          {t('这条更正说的是')}
                        </span>
                        <span className="mt-0.5 block whitespace-pre-wrap break-words text-[11px] leading-snug text-ink">
                          {item.content}
                        </span>
                      </span>
                      <span className="col-span-2 text-[10px] leading-snug text-muted">
                        {t('两边对着看：左边划出的那一段，是不是正好就是右边更正的那一点？划宽了，没被更正的话也会跟着标上。')}
                      </span>
                    </span>
                  ) : (
                    <span className="mt-0.5 block whitespace-pre-wrap break-words text-xs leading-relaxed text-ink">
                      {item.content}
                    </span>
                  )}
                  {item.annotation && (
                    <span className="mt-0.5 block whitespace-pre-wrap break-words text-[11px] italic leading-snug text-muted">
                      {item.annotation}
                    </span>
                  )}
                  {/* ⭐ Q1（2026-08-25）—— **引用的理由也要摆出来。** §2.Q1 那十处没列这一条，
                      但它和上面那句批注是同一类东西：AI 写的一句话，批准之后落在块上、进 pack、
                      被下一个模型读。⛔ 不摆 = 用户点「通过」的时候批准了一句自己没看见的话。 */}
                  {item.refNote && (
                    <span className="mt-0.5 flex items-baseline gap-1 text-[11px] leading-snug text-muted">
                      <span aria-hidden="true" className="flex-none opacity-60">
                        ↩
                      </span>
                      <span className="min-w-0 whitespace-pre-wrap break-words">
                        {item.refNote}
                      </span>
                    </span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="mt-2.5 flex items-center gap-2">
        <button
          type="button"
          disabled={busy || picked.size === 0}
          onClick={() => (partial ? onApproveSome([...picked]) : onApprove())}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-accent/60 bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent transition-colors enabled:hover:border-accent enabled:hover:bg-accent/15 disabled:opacity-40"
        >
          <Check size={12} />
          {partial
            ? t('存这 {n} 块', { n: picked.size + passageBlock })
            : t('都存进去（{n} 块）', { n: batch.items.length + passageBlock })}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onReject}
          title={t('直接扔掉，不留痕迹')}
          className="flex flex-none items-center gap-1.5 rounded-md border border-line bg-paper px-3 py-1.5 text-xs text-muted transition-colors enabled:hover:border-line-strong enabled:hover:text-ink disabled:opacity-40"
        >
          <Trash2 size={12} />
          {t('都不要')}
        </button>
      </div>
    </div>
  );
}

// Selection resets whenever the batch's items change identity — approving part of a batch
// deletes the whole batch, so a stale set can never be applied to different rows.
function useSelection(
  batch: ProposalBatch,
): [Set<string>, (fn: (prev: Set<string>) => Set<string>) => void] {
  const key = batch.items.map((i) => i.id).join(',');
  const [state, setState] = useState<{ key: string; picked: Set<string> }>(() => ({
    key,
    picked: new Set(batch.items.map((i) => i.id)),
  }));
  const picked =
    state.key === key ? state.picked : new Set(batch.items.map((i) => i.id));
  return [
    picked,
    (fn) => setState({ key, picked: fn(picked) }),
  ];
}
