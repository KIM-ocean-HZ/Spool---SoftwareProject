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
});
