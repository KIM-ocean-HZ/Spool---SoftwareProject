import { describe, expect, it } from 'vitest';
import {
  emptyFollowUpState,
  fingerprint,
  normalizeUrl,
  parseFollowUpState,
  rememberProposals,
  seenUrlsForPrompt,
  serializeFollowUpState,
  siftProposals,
  urlsIn,
  type Candidate,
} from './followUp';

const NOW = 1_754_000_000_000;
const DAY = 86_400_000;

const item = (id: string, content: string, annotation: string | null = null): Candidate => ({
  id,
  content,
  annotation,
});

describe('normalizeUrl', () => {
  it('treats the same page written five ways as one page', () => {
    const canonical = 'cmu.edu/msc/admissions';
    for (const raw of [
      'https://www.cmu.edu/msc/admissions',
      'http://cmu.edu/msc/admissions/',
      'https://CMU.edu/msc/admissions#deadlines',
      'https://cmu.edu/msc/admissions?utm_source=newsletter',
      'https://www.cmu.edu/msc/admissions).',
    ]) {
      expect(normalizeUrl(raw)).toBe(canonical);
    }
  });

  // The model writes Chinese around its links, so this is the common case, not an edge:
  // 「（…发布）」 and 「，另见」 sit flush against the URL and are perfectly legal URL characters.
  it('strips full-width punctuation the model leaves stuck to a link', () => {
    const canonical = 'cmu.edu/a';
    for (const raw of [
      'https://cmu.edu/a）',
      'https://cmu.edu/a，',
      'https://cmu.edu/a。',
      'https://cmu.edu/a」',
      'https://cmu.edu/a…',
    ]) {
      expect(normalizeUrl(raw)).toBe(canonical);
    }
  });

  it('keeps query parameters that address content', () => {
    // ?id=123 is frequently the whole address — dropping it would collapse different
    // pages into one and silence real news.
    expect(normalizeUrl('https://forum.example.com/t?id=123')).toBe('forum.example.com/t?id=123');
  });
});

describe('urlsIn', () => {
  it('pulls every URL out of a proposal body, de-duplicated', () => {
    const text = 'CMU 把截止改到 3/15。来源 https://cmu.edu/a (抓取 2026-08-07),另见 http://www.cmu.edu/a/';
    expect(urlsIn(text)).toEqual(['cmu.edu/a']);
  });

  it('returns nothing for a sourceless claim', () => {
    // §2.5-2 forbids proposing without a URL; when one shows up anyway the fingerprint is
    // all the bookkeeping there is.
    expect(urlsIn('我记得他们改过截止日期')).toEqual([]);
  });
});

describe('fingerprint', () => {
  it('ignores the URL, the punctuation and the casing', () => {
    expect(fingerprint('Deadline moved to March 15. https://cmu.edu/a')).toBe(
      fingerprint('deadline moved to march 15  —  https://elsewhere.example/mirror'),
    );
  });

  it('separates two different claims', () => {
    expect(fingerprint('截止改到 3 月 15 日')).not.toBe(fingerprint('截止改到 4 月 15 日'));
  });
});

describe('parseFollowUpState', () => {
  it('reads back what it wrote', () => {
    const s = rememberProposals(emptyFollowUpState(), [item('p1', 'x https://a.example/1')], NOW);
    expect(parseFollowUpState(serializeFollowUpState(s))).toEqual(s);
  });

  // ⚠️ The direction matters: this column is hand-editable and the run that reads it has
  // already been paid for. Degrading to "nothing seen" costs one repeated proposal the user
  // clicks away; throwing would waste the run.
  it('degrades to empty on anything unreadable', () => {
    for (const raw of [null, '', 'not json', '{"v":9}', '{"v":1}', '[]']) {
      expect(parseFollowUpState(raw)).toEqual(emptyFollowUpState());
    }
  });
});

describe('siftProposals (§2.4 — the gate)', () => {
  it('lets genuinely new findings through', () => {
    const state = rememberProposals(emptyFollowUpState(), [item('a', 'old https://x.example/1')], NOW);
    const { fresh, repeats } = siftProposals([item('b', 'new https://x.example/2')], state, NOW);
    expect(fresh.map((f) => f.id)).toEqual(['b']);
    expect(repeats).toEqual([]);
  });

  it('drops a page an earlier run already proposed', () => {
    const state = rememberProposals(
      emptyFollowUpState(),
      [item('a', '截止改到 3/15 https://cmu.edu/a')],
      NOW,
    );
    // Same page, different sentence: the URL alone catches it.
    const { fresh, repeats } = siftProposals(
      [item('b', '他们更新了招生页 https://www.cmu.edu/a/')],
      state,
      NOW + DAY,
    );
    expect(fresh).toEqual([]);
    expect(repeats.map((r) => r.id)).toEqual(['b']);
  });

  it('drops the same claim arriving from a second URL', () => {
    const state = rememberProposals(
      emptyFollowUpState(),
      [item('a', 'Deadline moved to March 15 https://cmu.edu/a')],
      NOW,
    );
    const { repeats } = siftProposals(
      [item('b', 'deadline moved to March 15! https://mirror.example/b')],
      state,
      NOW,
    );
    expect(repeats.map((r) => r.id)).toEqual(['b']);
  });

  it('de-duplicates inside a single run too', () => {
    const { fresh, repeats } = siftProposals(
      [item('a', 'x https://a.example/1'), item('b', 'y https://a.example/1')],
      emptyFollowUpState(),
      NOW,
    );
    expect(fresh.map((f) => f.id)).toEqual(['a']);
    expect(repeats.map((r) => r.id)).toEqual(['b']);
  });

  // A policy page really does get rewritten. A gate with no expiry would eventually make
  // the whole feature permanently silent about the pages that matter most.
  it('lets a page back through after 90 days', () => {
    const state = rememberProposals(emptyFollowUpState(), [item('a', 'x https://cmu.edu/a')], NOW);
    expect(siftProposals([item('b', 'y https://cmu.edu/a')], state, NOW + 89 * DAY).fresh).toEqual(
      [],
    );
    expect(
      siftProposals([item('b', 'y https://cmu.edu/a')], state, NOW + 91 * DAY).fresh.map((f) => f.id),
    ).toEqual(['b']);
  });

  it('reads the annotation as part of the proposal', () => {
    const state = rememberProposals(
      emptyFollowUpState(),
      [item('a', '结论', '为什么相关 — https://cmu.edu/a')],
      NOW,
    );
    expect(siftProposals([item('b', '别的结论', '来源 https://cmu.edu/a')], state, NOW).fresh).toEqual(
      [],
    );
  });
});

describe('rememberProposals', () => {
  it('only records what got through', () => {
    // Re-stamping a repeat would keep resetting its clock, and a page the model finds
    // every week would stay suppressed forever — defeating the TTL above.
    const first = rememberProposals(emptyFollowUpState(), [item('a', 'x https://cmu.edu/a')], NOW);
    const { repeats } = siftProposals([item('b', 'y https://cmu.edu/a')], first, NOW + 80 * DAY);
    const second = rememberProposals(first, [], NOW + 80 * DAY);
    expect(repeats).toHaveLength(1);
    expect(second.seen.map((s) => s.at)).toEqual([NOW]);
    expect(second.lastRunAt).toBe(NOW + 80 * DAY);
  });

  it('records the run even when it found nothing', () => {
    const s = rememberProposals(emptyFollowUpState(), [], NOW);
    expect(s.lastRunAt).toBe(NOW);
    expect(s.seen).toEqual([]);
  });

  it('caps the history and drops the oldest first', () => {
    let s = emptyFollowUpState();
    for (let i = 0; i < 260; i++) {
      s = rememberProposals(s, [item(`p${i}`, `x https://e.example/${i}`)], NOW + i);
    }
    expect(s.seen).toHaveLength(200);
    // The newest entry must survive — a cap that trimmed new entries would break the gate
    // on exactly the run it exists for.
    expect(s.seen[s.seen.length - 1]!.u).toBe('e.example/259');
  });

  it('keeps a fingerprint for a proposal that carried no URL', () => {
    const s = rememberProposals(emptyFollowUpState(), [item('a', '没有来源的结论')], NOW);
    expect(s.seen).toEqual([{ u: '', f: fingerprint('没有来源的结论\n'), at: NOW }]);
  });
});

describe('seenUrlsForPrompt', () => {
  it('hands the model newest-first URLs only, de-duplicated and capped', () => {
    let s = emptyFollowUpState();
    for (let i = 0; i < 50; i++) {
      s = rememberProposals(s, [item(`p${i}`, `x https://e.example/${i}`)], NOW + i);
    }
    s = rememberProposals(s, [item('dup', 'y https://e.example/49')], NOW + 100);
    const urls = seenUrlsForPrompt(s, NOW + 200);
    expect(urls).toHaveLength(40);
    expect(urls[0]).toBe('e.example/49');
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('leaves out entries with no URL — a hash is nothing the model can act on', () => {
    const s = rememberProposals(emptyFollowUpState(), [item('a', '没有来源的结论')], NOW);
    expect(seenUrlsForPrompt(s, NOW)).toEqual([]);
  });
});
