/* Renders docs/metrics/downloads.csv into a self-contained local dashboard.
 *
 *     node scripts/metrics-snapshot.mjs && node scripts/metrics-dashboard.mjs
 *     open docs/metrics/dashboard.html
 *
 * Audience is one person (Ocean, 2026-08-20: 「看板给谁看？我自己看」), so this is a
 * file on disk, not a hosted page — nothing here is deployed and nothing phones
 * home. The page reads its numbers from data baked in at build time.
 *
 * The question it answers is 「每天新增多少」, so the daily delta is the chart and the
 * cumulative total is the hero figure. Deltas need two snapshots; with one day of
 * data the chart says so instead of drawing an empty axis.
 */
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/* Same store metrics-snapshot.mjs writes to — resolved here rather than imported,
   because that file is a script with side effects, not a module to load. */
const STORE =
  process.env.SPOOL_METRICS_DIR || join(homedir(), 'Library', 'Application Support', 'spool-metrics');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CSV = join(STORE, 'downloads.csv');
const MIRROR = join(ROOT, 'docs', 'metrics');
const OUT = join(MIRROR, 'dashboard.html');

if (!existsSync(CSV)) throw new Error(`no data yet — run scripts/metrics-snapshot.mjs first (${CSV})`);

const rows = readFileSync(CSV, 'utf8')
  .split('\n')
  .slice(1)
  .filter(Boolean)
  .map((l) => {
    const [date, tag, asset, count] = l.split(',');
    return { date, tag, asset, count: Number(count) };
  });

/* Windows assets are the only ones whose name says so; everything else is the Mac
   dmg under one of its two names. Keeping this here rather than in the CSV means a
   renamed asset is a one-line fix, not a rewrite of the stored history. */
const platformOf = (asset) => (/windows|\.exe$/i.test(asset) ? 'Windows' : 'macOS');

const dates = [...new Set(rows.map((r) => r.date))].sort();
const onDate = (d) => rows.filter((r) => r.date === d);
const sum = (list) => list.reduce((n, r) => n + r.count, 0);

const series = dates.map((date) => {
  const day = onDate(date);
  return {
    date,
    total: sum(day),
    macOS: sum(day.filter((r) => platformOf(r.asset) === 'macOS')),
    Windows: sum(day.filter((r) => platformOf(r.asset) === 'Windows')),
  };
});

/* Delta carries the gap it covers: a day the snapshot did not run merges into the
   next reading, and saying "+3 over 2 days" is honest where "+3" would not be. */
const deltas = series.slice(1).map((point, i) => {
  const previous = series[i];
  const spanDays = Math.round(
    (Date.parse(`${point.date}T00:00:00Z`) - Date.parse(`${previous.date}T00:00:00Z`)) / 86400000,
  );
  return { date: point.date, value: point.total - previous.total, spanDays };
});

const latest = series[series.length - 1];
const newest = deltas[deltas.length - 1] ?? null;

/* Per-release rollup, newest release first (the CSV keeps GitHub's order). */
const tags = [...new Set(onDate(latest.date).map((r) => r.tag))];
const byTag = tags.map((tag) => {
  const assets = onDate(latest.date).filter((r) => r.tag === tag);
  return {
    tag,
    total: sum(assets),
    macOS: sum(assets.filter((r) => platformOf(r.asset) === 'macOS')),
    Windows: sum(assets.filter((r) => platformOf(r.asset) === 'Windows')),
    assets: assets.map((a) => ({ name: a.asset, count: a.count })),
  };
});

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

/* --- The daily-new chart -----------------------------------------------------
   One series, so no legend: the title names it. Columns are thin marks with 4px
   rounded tops anchored to the baseline, a 2px gap between neighbours, and every
   column carries its own value label — four bars do not need a hover layer to be
   readable, and a local file with labels on beats one that hides its numbers. */
function chart(points) {
  if (points.length === 0) {
    return `<p class="empty">Only one snapshot so far (${esc(latest.date)}). The first daily number
      appears after tomorrow's run — a total needs two readings before it can say what changed.</p>`;
  }
  const peak = Math.max(...points.map((p) => Math.abs(p.value)), 1);
  const W = 34;
  const GAP = 2;
  const H = 150;
  const width = points.length * (W + GAP) - GAP;
  const bars = points
    .map((p, i) => {
      const h = Math.max((Math.abs(p.value) / peak) * (H - 26), p.value === 0 ? 0 : 3);
      const x = i * (W + GAP);
      const y = H - h;
      const label = p.spanDays > 1 ? `+${p.value} / ${p.spanDays}d` : `${p.value > 0 ? '+' : ''}${p.value}`;
      return `<rect x="${x}" y="${y.toFixed(1)}" width="${W}" height="${h.toFixed(1)}" rx="4" class="bar"/>
        <text x="${x + W / 2}" y="${(y - 7).toFixed(1)}" class="bar-label">${esc(label)}</text>`;
    })
    .join('\n      ');
  const ticks = points
    .map((p, i) => `<text x="${i * (W + GAP) + W / 2}" y="16" class="tick">${esc(p.date.slice(5))}</text>`)
    .join('\n      ');
  return `<svg viewBox="0 0 ${width} ${H + 22}" width="${width}" height="${H + 22}" role="img"
    aria-label="New downloads per snapshot: ${points.map((p) => `${p.date} plus ${p.value}`).join(', ')}">
      <g>${bars}</g>
      <line x1="0" y1="${H}" x2="${width}" y2="${H}" class="axis"/>
      <g transform="translate(0 ${H})">${ticks}</g>
    </svg>`;
}

const tile = (label, value, note) =>
  `<div class="tile"><div class="tile-l">${esc(label)}</div><div class="tile-v">${esc(value)}</div>
    <div class="tile-n">${esc(note)}</div></div>`;

const html = `<!doctype html>
<html lang="en" class="viz-root">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Spool downloads</title>
<style>
  :root {
    color-scheme: light;
    --surface-1: #fcfcfb;
    --surface-2: #f3f3f0;
    --line: #e0dfd9;
    --text-primary: #0b0b0b;
    --text-secondary: #52514e;
    --text-muted: #78766f;
    --series-1: #2a78d6;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      color-scheme: dark;
      --surface-1: #1a1a19;
      --surface-2: #232322;
      --line: #35352f;
      --text-primary: #ffffff;
      --text-secondary: #c3c2b7;
      --text-muted: #96958b;
      --series-1: #3987e5;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 2.5rem 1.5rem 4rem;
    background: var(--surface-1); color: var(--text-primary);
    font: 15px/1.55 ui-sans-serif, -apple-system, "SF Pro Text", system-ui, sans-serif;
  }
  .wrap { max-width: 820px; margin: 0 auto; }
  h1 { font-size: 1.15rem; font-weight: 600; margin: 0 0 .2rem; letter-spacing: -.01em; }
  .sub { color: var(--text-muted); font-size: .82rem; margin: 0 0 2.2rem; }
  .hero { font-size: 3.4rem; font-weight: 600; line-height: 1; letter-spacing: -.03em; }
  .hero-l { color: var(--text-secondary); font-size: .82rem; text-transform: uppercase;
            letter-spacing: .08em; margin-bottom: .5rem; }
  .hero-n { color: var(--text-muted); font-size: .82rem; margin-top: .55rem; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
           gap: .75rem; margin: 2.2rem 0; }
  .tile { background: var(--surface-2); border: 1px solid var(--line); border-radius: 10px; padding: .9rem 1rem; }
  .tile-l { color: var(--text-secondary); font-size: .76rem; text-transform: uppercase; letter-spacing: .06em; }
  .tile-v { font-size: 1.7rem; font-weight: 600; letter-spacing: -.02em; margin: .15rem 0 .1rem; }
  .tile-n { color: var(--text-muted); font-size: .76rem; }
  h2 { font-size: .82rem; font-weight: 600; text-transform: uppercase; letter-spacing: .07em;
       color: var(--text-secondary); margin: 2.4rem 0 1rem; }
  .plot { overflow-x: auto; }
  svg { display: block; }
  .bar { fill: var(--series-1); }
  .bar-label { fill: var(--text-primary); font-size: 11px; font-weight: 600; text-anchor: middle; }
  .tick { fill: var(--text-muted); font-size: 10px; text-anchor: middle; }
  .axis { stroke: var(--line); stroke-width: 1; }
  .empty { color: var(--text-muted); font-size: .88rem; background: var(--surface-2);
           border: 1px solid var(--line); border-radius: 10px; padding: 1rem 1.1rem; margin: 0; }
  .tbl { width: 100%; overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: .86rem; }
  th, td { text-align: right; padding: .5rem .7rem; border-bottom: 1px solid var(--line); }
  th:first-child, td:first-child { text-align: left; }
  th { color: var(--text-secondary); font-weight: 600; font-size: .76rem;
       text-transform: uppercase; letter-spacing: .05em; }
  td.name { color: var(--text-secondary); font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size: .78rem; padding-left: 1.6rem; }
  tr.rel td { font-weight: 600; }
  .note { color: var(--text-muted); font-size: .8rem; border-top: 1px solid var(--line);
          margin-top: 3rem; padding-top: 1rem; }
  .note code { font-size: .95em; }
</style>
</head>
<body>
<div class="wrap">

  <h1>Spool downloads</h1>
  <p class="sub">GitHub release assets · snapshot taken ${esc(latest.date)} · ${series.length} day${series.length === 1 ? '' : 's'} of history</p>

  <div class="hero-l">Downloads to date</div>
  <div class="hero">${latest.total}</div>
  <div class="hero-n">Every asset on every release, added up.</div>

  <div class="tiles">
    ${tile('New', newest ? `${newest.value >= 0 ? '+' : ''}${newest.value}` : '—',
           newest ? (newest.spanDays > 1 ? `over ${newest.spanDays} days to ${newest.date}` : `on ${newest.date}`) : 'needs a second snapshot')}
    ${tile('macOS', latest.macOS, `${latest.total ? Math.round((latest.macOS / latest.total) * 100) : 0}% of all downloads`)}
    ${tile('Windows', latest.Windows, `${latest.total ? Math.round((latest.Windows / latest.total) * 100) : 0}% of all downloads`)}
    ${tile('Releases', byTag.length, `newest is ${byTag[0]?.tag ?? '—'}`)}
  </div>

  <h2>New downloads per day</h2>
  <div class="plot">${chart(deltas)}</div>

  <h2>By release</h2>
  <div class="tbl">
  <table>
    <thead><tr><th>Release</th><th>macOS</th><th>Windows</th><th>Total</th></tr></thead>
    <tbody>
    ${byTag
      .map(
        (t) => `<tr class="rel"><td>${esc(t.tag)}</td><td>${t.macOS}</td><td>${t.Windows}</td><td>${t.total}</td></tr>
      ${t.assets.map((a) => `<tr><td class="name">${esc(a.name)}</td><td></td><td></td><td>${a.count}</td></tr>`).join('\n      ')}`,
      )
      .join('\n    ')}
    </tbody>
  </table>
  </div>

  <p class="note">
    One download = one asset fetch, summed across every asset of every release. Each release
    ships the same bytes twice — under a versioned name and under the fixed name the website
    buttons point at — but a person fetching the app hits only one of those URLs, so adding
    them counts fetches without counting anyone twice.
    <br><br>
    GitHub reports a running total and keeps no history, so the daily numbers above exist only
    because <code>scripts/metrics-snapshot.mjs</code> saved a reading each day. A day it did not
    run is folded into the next bar and labelled with the span it covers.
    Regenerate with <code>node scripts/metrics-snapshot.mjs &amp;&amp; node scripts/metrics-dashboard.mjs</code>.
  </p>

</div>
</body>
</html>
`;

mkdirSync(MIRROR, { recursive: true });
writeFileSync(OUT, html);

/* One-way mirror of the store into the repo, so the series has a copy in git that
   can be committed. Only ever store → repo: the daily writer cannot reach ~/Desktop
   (see metrics-snapshot.mjs), so the store is always the newer of the two and a
   two-way sync would have nothing to resolve in the other direction. */
copyFileSync(CSV, join(MIRROR, 'downloads.csv'));

console.log(`${OUT} — ${latest.total} downloads across ${series.length} snapshot(s)`);
