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
