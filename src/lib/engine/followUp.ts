// DESIGN_FOLLOW_UP §2.4 / §4 M3 — "nothing new, nothing said".
//
// M2 shipped the follow-up run with the silence RULE written into the prompt ("if there is
// nothing new, propose nothing") and no DATA behind it: the model was told not to repeat
// itself while being shown nothing about what it had said last time. §2.4 is the whole
// reason this file exists — the thing to copy from monitoring tools (and the one thing
// none of the three deep-research projects has) is store a snapshot, compare, and stay
// quiet when nothing moved.
//
// Two halves, and each does the part it can:
//   * the PROMPT gets the list, so a repeat is not fetched, not written, not paid for;
//   * this GATE runs afterwards in Spool, because a prompt is a request and §1.1 needs a
//     guarantee. A feature that hands the user three familiar items every week is one the
//     user turns off — and takes their trust in "Spool will not fill my library with
//     junk" with them.
//
// Everything here is pure. The store shape is deliberately small and inspectable: this
// text lands in a column the user can read, and an opaque blob in their own database
// would be one more thing they cannot check.

/** One thing an earlier follow-up already put in front of the user. */
export interface SeenItem {
  /** Normalized URL. Empty when the proposal carried none (which §2.5-2 forbids, but a
   *  fingerprint-only entry is still better bookkeeping than dropping the row). */
  u: string;
  /** Fingerprint of the conclusion sentence — catches the same news reported from a
   *  second URL, which a URL check alone cannot. */
  f: string;
  /** When it was proposed, ms epoch. Drives expiry. */
  at: number;
}

export interface FollowUpState {
  v: 1;
  /** When the last follow-up ran. Not used for gating — it is what makes the column
   *  readable, and M4's timer will want it. */
  lastRunAt: number;
  seen: SeenItem[];
}

/** How many entries the column keeps. A follow-up proposes at most 5 (§6-3), so this is
 *  ~40 runs of history — far past the point where a page that has genuinely changed
 *  deserves to come back. */
const SEEN_CAP = 200;

/** After this, an entry stops suppressing. A policy page really can be rewritten, and a
 *  gate with no expiry would eventually make the whole feature silent forever. */
const SEEN_TTL_MS = 90 * 86_400_000;

export const emptyFollowUpState = (): FollowUpState => ({ v: 1, lastRunAt: 0, seen: [] });

/** Parse the stored column. Anything unreadable — corrupt JSON, a shape from a future
 *  version, hand-edited nonsense — degrades to "nothing seen yet". That direction is
 *  deliberate: the failure is one repeated proposal the user clicks away, whereas throwing
 *  would fail a run that has already been paid for. */
export const parseFollowUpState = (raw: string | null): FollowUpState => {
  if (!raw) return emptyFollowUpState();
  try {
    const v = JSON.parse(raw) as Partial<FollowUpState>;
    if (!v || v.v !== 1 || !Array.isArray(v.seen)) return emptyFollowUpState();
    const seen = v.seen.filter(
      (s): s is SeenItem =>
        !!s && typeof s.u === 'string' && typeof s.f === 'string' && typeof s.at === 'number',
    );
    return { v: 1, lastRunAt: typeof v.lastRunAt === 'number' ? v.lastRunAt : 0, seen };
  } catch {
    return emptyFollowUpState();
  }
};

export const serializeFollowUpState = (s: FollowUpState): string => JSON.stringify(s);

// Two URLs that differ only by scheme, a `www.`, a trailing slash, a fragment or a
// tracking parameter are the same page. Everything else in the query string is kept —
// `?id=123` is frequently the whole address.
const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|ref$|ref_src$|mc_cid$|mc_eid$)/i;

// ⚠️ The full-width half is not decoration. The model writes Chinese around its links —
// 「…发布）」, 「…见 https://x/y，另见…」 — and `）` `，` `。` are ordinary URL characters as far
// as the grabber is concerned, so without this a link followed by Chinese punctuation
// normalizes to a DIFFERENT string than the same link followed by a space, and the gate
// silently stops matching it. Observed in the real 2026-08-07 runs.
const TRAILING_PUNCT = /[.,;:!?)\]}>"'、，。；：！？）】》」』…]+$/;

export const normalizeUrl = (raw: string): string => {
  const trimmed = raw.trim().replace(TRAILING_PUNCT, '');
  try {
    const u = new URL(trimmed);
    u.hash = '';
    u.protocol = 'https:';
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
    for (const k of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.test(k)) u.searchParams.delete(k);
    }
    const path = u.pathname.replace(/\/+$/, '');
    return `${u.hostname}${path}${u.search}`;
  } catch {
    return trimmed.toLowerCase();
  }
};

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;

/** Every URL a proposal's text carries, normalized and de-duplicated. §2.5-2 makes a URL
 *  mandatory on every proposal, so in practice this is rarely empty — and when it is, that
 *  is itself the signal that something was invented. */
export const urlsIn = (text: string): string[] => {
  const out = new Set<string>();
  for (const m of text.match(URL_RE) ?? []) out.add(normalizeUrl(m));
  return [...out];
};

// FNV-1a, 32-bit. Not for security — for a short stable token that says "this sentence
// again". A hash rather than the sentence itself because the column would otherwise grow
// by a paragraph per proposal, in a database the user carries around.
const hash32 = (s: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
};

/** Fingerprint of a proposal's claim.
 *
 *  URLs come out first — the same conclusion cited from a mirror must fingerprint the
 *  same — then punctuation and case and whitespace, which vary between two runs writing
 *  the same sentence. What survives is the words. This will not catch a genuine paraphrase
 *  (the same limitation the 去重 detector has, measured 2026-08-07), and it is not meant
 *  to: the prompt half handles rewording, and this half only has to be certain about the
 *  cases it does fire on — a false positive here silently withholds real news. */
export const fingerprint = (text: string): string =>
  hash32(
    text
      .replace(URL_RE, ' ')
      .toLowerCase()
      .replace(/[\s\p{P}\p{S}]+/gu, ' ')
      .trim(),
  );

/** §8.7 — what two lines of a follow-up list have to share to count as the same line.
 *
 *  ⚠️ Deliberately NOT `fingerprint` above, even though both answer "have I seen this text
 *  already". The MCP server computes this one too (mcp.rs `follow_up_fingerprint`), because
 *  it is what rejects a model that proposes the same line in every conversation — and the
 *  two implementations have to agree exactly or the check silently stops firing. `fingerprint`
 *  cannot be mirrored exactly: it leans on `\p{P}\p{S}`, and no Rust char class reproduces
 *  those two categories. Lowercase + collapsed whitespace can be, in three lines on each
 *  side — and it is already what the Rust near-duplicate detector normalises with
 *  (`trigram_set`).
 *
 *  It catches a line proposed again word for word, which is what a model repeating itself
 *  across conversations actually does; a genuine rewording gets through, the same boundary
 *  §4.2 measured for the dedupe gate, and with the same answer — better to let a duplicate
 *  through than to swallow a real one. */
export const followUpFingerprint = (text: string): string =>
  text.toLowerCase().split(/\s+/).filter(Boolean).join(' ');

export interface Candidate {
  id: string;
  content: string;
  annotation: string | null;
}

export interface SiftResult<T extends Candidate> {
  fresh: T[];
  /** Already proposed by an earlier run — dropped without a trace, exactly like a
   *  rejection (DESIGN_MCP_WRITE_ROLE §4.3: a rejection log is a landfill). */
  repeats: T[];
}

/** Split this run's proposals into what the user has not seen and what they have. */
export const siftProposals = <T extends Candidate>(
  items: readonly T[],
  state: FollowUpState,
  now: number,
): SiftResult<T> => {
  const live = state.seen.filter((s) => now - s.at < SEEN_TTL_MS);
  const seenUrls = new Set(live.map((s) => s.u).filter(Boolean));
  const seenPrints = new Set(live.map((s) => s.f));
  const fresh: T[] = [];
  const repeats: T[] = [];
  // Within one run too: a model that proposes the same page twice in one batch is the
  // same repetition, and the user should not see it twice either.
  const thisRunUrls = new Set<string>();
  const thisRunPrints = new Set<string>();
  for (const it of items) {
    const text = `${it.content}\n${it.annotation ?? ''}`;
    const urls = urlsIn(text);
    const fp = fingerprint(text);
    const known =
      urls.some((u) => seenUrls.has(u) || thisRunUrls.has(u)) ||
      seenPrints.has(fp) ||
      thisRunPrints.has(fp);
    if (known) {
      repeats.push(it);
      continue;
    }
    for (const u of urls) thisRunUrls.add(u);
    thisRunPrints.add(fp);
    fresh.push(it);
  }
  return { fresh, repeats };
};

/** Fold this run into the state: what survived is now "seen", and so is the run itself.
 *
 *  Only the fresh items are recorded — a repeat is already in there, and re-stamping it
 *  would let a page the model keeps re-finding stay suppressed forever, defeating the TTL.
 *  Expired entries are dropped on the same pass, so the column is pruned by use. */
export const rememberProposals = (
  state: FollowUpState,
  items: readonly Candidate[],
  now: number,
): FollowUpState => {
  const kept = state.seen.filter((s) => now - s.at < SEEN_TTL_MS);
  const added: SeenItem[] = [];
  for (const it of items) {
    const text = `${it.content}\n${it.annotation ?? ''}`;
    const urls = urlsIn(text);
    const f = fingerprint(text);
    if (urls.length === 0) {
      added.push({ u: '', f, at: now });
      continue;
    }
    for (const u of urls) added.push({ u, f, at: now });
  }
  // Newest last, oldest dropped first — a cap that trimmed the new entries would make the
  // gate stop working on exactly the runs it exists for.
  const seen = [...kept, ...added].slice(-SEEN_CAP);
  return { v: 1, lastRunAt: now, seen };
};

/** The compact list handed to the follow-up prompt so a repeat is never fetched at all.
 *  URLs only: the model can act on "do not bring these back", and cannot on a hash. */
export const seenUrlsForPrompt = (state: FollowUpState, now: number, cap = 40): string[] => {
  const live = state.seen.filter((s) => now - s.at < SEEN_TTL_MS && s.u);
  const out: string[] = [];
  const dedup = new Set<string>();
  // Newest first: if the list has to be cut, keep what the last run just said.
  for (let i = live.length - 1; i >= 0 && out.length < cap; i--) {
    const u = live[i]!.u;
    if (dedup.has(u)) continue;
    dedup.add(u);
    out.push(u);
  }
  return out;
};
