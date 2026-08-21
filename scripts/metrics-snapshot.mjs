/* Appends one day's GitHub release download counts to the metrics store.
 *
 * Why this exists: the GitHub API reports a *cumulative* download count per asset
 * and keeps no history. "How many downloads yesterday" can only ever be answered
 * by a series somebody started saving. Every day this does not run is a day that
 * can never be split out of the total afterwards — a gap merges into the next
 * reading rather than vanishing, but it cannot be recovered.
 *
 *     node scripts/metrics-snapshot.mjs
 *
 * Re-running on the same day replaces that day's rows instead of appending, so a
 * manual run plus the scheduled run cannot double up. Rows are only ever added at
 * the end for a new date, so the file stays append-only in practice and diffs read
 * as one new day at a time.
 *
 * ⚠️ WHERE THE DATA LIVES, and why it is not in this repo. The store is
 * ~/Library/Application Support/spool-metrics/. This checkout sits under ~/Desktop,
 * which is TCC-protected: a launchd agent that so much as reads a script from there
 * — or is given a WorkingDirectory there — blocks forever inside getcwd() waiting
 * for a consent prompt that no background session can answer. Measured 2026-08-20
 * with three launchd probes; see docs/METRICS.md. So the daily writer stays out of
 * ~/Desktop entirely. metrics-dashboard.mjs mirrors the file back into docs/metrics/
 * so there is still a copy in git to commit.
 *
 * Counting convention (Ocean, 2026-08-20): a "download" is the sum of every asset
 * on every release. Each release ships the same bytes under two names — the
 * versioned one (Spool_0.6.1_aarch64.dmg) and the fixed one the website buttons
 * point at (Spool-macOS-arm64.dmg) — but one person fetching the app hits exactly
 * one of those URLs, so adding them counts URL hits without counting a person
 * twice. Written down in docs/METRICS.md so the number always means one thing.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const STORE =
  process.env.SPOOL_METRICS_DIR || join(homedir(), 'Library', 'Application Support', 'spool-metrics');
const CSV = join(STORE, 'downloads.csv');
const REPO = 'KIM-ocean-HZ/spool';
const HEADER = 'date,tag,asset,count';

/* Local calendar date. The series is read by one person in one timezone, so a
   local day is the honest unit; UTC would move the boundary into his evening. */
function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* Plain unauthenticated HTTPS, deliberately not the `gh` CLI. The releases
   endpoint is public, so no token is needed — and `gh` keeps its token in the
   macOS keyring, which blocks on a keychain prompt when launchd runs the job
   without a session. That hang was the whole reason a scheduled snapshot would
   have quietly stopped producing days. Unauthenticated is 60 requests an hour;
   this asks for one a day. */
async function fetchAssets() {
  const out = [];
  for (let page = 1; ; page += 1) {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=100&page=${page}`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'spool-metrics-snapshot' },
    });
    if (!res.ok) throw new Error(`GitHub API ${res.status} ${res.statusText}`);
    const releases = await res.json();
    if (releases.length === 0) break;
    for (const release of releases) {
      for (const asset of release.assets) {
        out.push({ tag: release.tag_name, asset: asset.name, count: asset.download_count });
      }
    }
    if (releases.length < 100) break;
  }
  return out;
}

const date = today();
const rows = await fetchAssets();
if (rows.length === 0) throw new Error('GitHub returned no release assets — refusing to write an empty day');

mkdirSync(dirname(CSV), { recursive: true });
const existing = existsSync(CSV)
  ? readFileSync(CSV, 'utf8').split('\n').filter((l) => l && l !== HEADER)
  : [];

/* Drop any rows already recorded for today, so re-running is a replace. */
const kept = existing.filter((l) => !l.startsWith(`${date},`));
const added = rows.map((r) => `${date},${r.tag},${r.asset},${r.count}`);

writeFileSync(CSV, [HEADER, ...kept, ...added].join('\n') + '\n');

const total = rows.reduce((sum, r) => sum + r.count, 0);
const previousDate = kept.length ? kept[kept.length - 1].split(',')[0] : null;
const previousTotal = kept
  .filter((l) => l.startsWith(`${previousDate},`))
  .reduce((sum, l) => sum + Number(l.split(',')[3]), 0);

const delta = previousDate ? total - previousTotal : null;
console.log(
  `${date}: ${rows.length} assets, ${total} downloads total` +
  (delta === null ? ' (first snapshot — no delta yet)' : ` (${delta >= 0 ? '+' : ''}${delta} since ${previousDate})`),
);
