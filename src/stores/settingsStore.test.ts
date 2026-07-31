import { describe, expect, it } from 'vitest';
import { languageForLocale } from './settingsStore';

// 2026-07-31 (HANDOFF §2.3): a machine that has never picked a language follows its
// system locale, and English is what everything else falls back to.
describe('languageForLocale', () => {
  it('maps every Chinese locale to zh', () => {
    for (const locale of ['zh', 'zh-CN', 'zh-Hant-TW', 'ZH-hk']) {
      expect(languageForLocale(locale)).toBe('zh');
    }
  });

  it('maps everything else — including a missing locale — to en', () => {
    for (const locale of ['en-US', 'en', 'ja-JP', 'de', '', undefined]) {
      expect(languageForLocale(locale)).toBe('en');
    }
  });
});
