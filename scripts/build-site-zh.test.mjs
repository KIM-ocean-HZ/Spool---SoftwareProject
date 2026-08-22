/* The Chinese pages are generated and committed, so the only way they can go
   wrong is someone editing the English page or the Chinese copy and not
   re-running the build. Regenerate here and compare: a forgotten
   `node scripts/build-site-zh.mjs` fails the suite instead of quietly shipping
   a page that is half a version behind.
   (renderAll throws on its own if a data-i18n key has no Chinese line, so that
   case is covered by these tests running at all.) */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { PAGES, renderAll } from './build-site-zh.mjs';
import { HEAD, ZH } from './site-zh-strings.mjs';

function escapeAttribute(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

describe('site/zh is in sync with the English pages', () => {
  const { pages, unused } = renderAll();

  for (const page of PAGES) {
    it(`site/zh/${page} matches a fresh build`, () => {
      const committed = readFileSync(new URL(`../site/zh/${page}`, import.meta.url), 'utf8');
      expect(pages[page]).toBe(committed);
    });
  }

  /* 问卷星 / SurveyMars (WORKPLAN-2026-08-20 §6.4.2; forms live 2026-08-22).
     ⛔ What this guards is the ⛔ Ocean put on the whole change: **a hosted form and the
     sentence 「什么都不收集」 must never ship together.** The failure is not a crash and not
     a broken link — it is the site telling a plausible lie to exactly the people whose only
     reason to trust it is that it does not. It cannot be caught by reading a diff either,
     because the link and the claim live in different files and only one of them looks
     urgent. Both languages, because the two pages are edited through different paths: the
     English one by hand, the Chinese one through site-zh-strings.mjs. */
  it('never offers a hosted form beside a claim that nothing is collected', () => {
    /* ⚠️ Whitespace-collapsed before matching. The English page is hand-wrapped at ~100
       columns, so any sentence long enough to be worth asserting on is split across lines —
       a literal .toContain() would fail on the wrap rather than on the meaning, and the
       obvious "fix" is to weaken the assertion until it passes. */
    const flat = (h) => h.replace(/\s+/g, ' ');
    const english = flat(readFileSync(new URL('../site/index.html', import.meta.url), 'utf8'));
    const pairs = [
      ['site/index.html', english, 'surveymars.com', 'collects nothing itself', 'stored on their servers'],
      ['site/zh/index.html', flat(pages['index.html']), 'v.wjx.cn', '这个页面本身没有服务器，也不收集任何东西', '存在他们的服务器上'],
    ];
    for (const [name, html, host, hedged, whereItGoes] of pairs) {
      expect(html, `${name} lost its form link`).toContain(host);
      // The unqualified claim is gone…
      expect(html, `${name} still makes the bare no-collection claim`).not.toContain(
        'This page has no server and collects nothing. The',
      );
      expect(html, `${name} still makes the bare no-collection claim`).not.toContain(
        '这个页面没有服务器，什么都不收集。',
      );
      // …replaced by one that says what the page does and what the form does.
      expect(html, `${name} lost the hedged claim`).toContain(hedged);
      expect(html, `${name} does not say where the answers go`).toContain(whereItGoes);
    }
    // ⭐ And the route that needs no third party at all stays, on both pages — §6.4.2 落地
    // 第 3 件. A form service being down, blocked or unreadable must not cost the only way
    // a person can reach a human.
    expect(english).toContain('mailto:jinhz0531@gmail.com');
    expect(pages['index.html']).toContain('mailto:jinhz0531@gmail.com');
    // The privacy pages carry the same admission — 落地第 2 件: 别只改表单不改说明.
    const enPrivacy = readFileSync(new URL('../site/privacy.html', import.meta.url), 'utf8');
    expect(enPrivacy).toContain('SurveyMars');
    expect(pages['privacy.html']).toContain('问卷星');
  });

  it('has no Chinese strings left over from copy that was removed', () => {
    expect(unused).toEqual([]);
  });

  it('translates every meaningful homepage image description and accessible name', () => {
    const html = pages['index.html'];
    for (const [key, value] of Object.entries(ZH)) {
      if (key.startsWith('alt-')) {
        expect(html).toContain(` alt="${escapeAttribute(value)}"`);
      }
    }
    expect(html).toContain(` aria-label="${escapeAttribute(ZH['aria-brand-video'])}"`);
  });

  it('translates homepage metadata and non-body accessibility copy', () => {
    const html = pages['index.html'];
    const head = HEAD['index.html'];
    expect(html).toContain(`<title>${head.title}</title>`);
    expect(html).toContain(`<meta name="description" content="${escapeAttribute(head.description)}">`);
    expect(html).toContain(`<meta property="og:title" content="${escapeAttribute(head.ogTitle)}">`);
    expect(html).toContain(`<meta property="og:description" content="${escapeAttribute(head.ogDescription)}">`);
    expect(html).toContain(`<meta property="og:image:alt" content="${escapeAttribute(head.ogImageAlt)}">`);
    expect(html).toContain(ZH['demo-noscript']);
    expect(html).not.toContain('The demo needs JavaScript');
  });

  it('translates the story page, including its image descriptions', () => {
    const html = pages['story.html'];
    for (const [key, value] of Object.entries(ZH)) {
      if (key.startsWith('story-alt-')) {
        expect(html).toContain(` alt="${escapeAttribute(value)}"`);
      }
    }
    expect(html).toContain(`<title>${HEAD['story.html'].title}</title>`);
    expect(html).not.toContain('The making of Spool');
    expect(html).not.toContain('>Contents<');
  });

  it('translates the privacy footer outside the replaced policy body', () => {
    const html = pages['privacy.html'];
    expect(html).toContain(`>${ZH['foot-copy']}<`);
    expect(html).toContain(`>${ZH['foot-home']}<`);
    expect(html).toContain(`>${ZH['foot-story']}<`);
    expect(html).not.toContain('All rights reserved');
    expect(html).not.toContain('>Home<');
    expect(html).not.toContain('>Engineering story<');
  });

  it('escapes translated alt text as an HTML attribute', () => {
    const original = ZH['alt-logo'];
    try {
      ZH['alt-logo'] = '线轴 "Spool" & <线头>';
      expect(renderAll().pages['index.html']).toContain(
        'alt="线轴 &quot;Spool&quot; &amp; &lt;线头&gt;"',
      );
    } finally {
      ZH['alt-logo'] = original;
    }
  });

  it('escapes translated aria-label text as an HTML attribute', () => {
    const original = ZH['aria-brand-video'];
    try {
      ZH['aria-brand-video'] = '线轴 "Spool" & <动画>';
      expect(renderAll().pages['index.html']).toContain(
        'aria-label="线轴 &quot;Spool&quot; &amp; &lt;动画&gt;"',
      );
    } finally {
      ZH['aria-brand-video'] = original;
    }
  });

  it('escapes translated metadata as HTML attributes', () => {
    const original = HEAD['index.html'].description;
    try {
      HEAD['index.html'].description = '项目 "Spool" & <背景>';
      expect(renderAll().pages['index.html']).toContain(
        'meta name="description" content="项目 &quot;Spool&quot; &amp; &lt;背景&gt;"',
      );
    } finally {
      HEAD['index.html'].description = original;
    }
  });
});
