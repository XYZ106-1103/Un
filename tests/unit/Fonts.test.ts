import { describe, expect, it } from 'vitest';
import coverage from '@/assets/fonts/coverage.json';
import { content } from '@/systems/content/ContentDB';
import ko from '@/data/strings/ko.json';
import en from '@/data/strings/en.json';

type Ranges = [number, number][];

const covers = (ranges: Ranges, code: number): boolean => {
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = ranges[mid] as [number, number];
    if (code < r[0]) hi = mid - 1;
    else if (code > r[1]) lo = mid + 1;
    else return true;
  }
  return false;
};

/** Characters a font must be able to draw (control characters and newlines excluded). */
const charsOf = (text: string): Set<string> => new Set([...text].filter((c) => (c.codePointAt(0) ?? 0) >= 32));

const missing = (font: keyof typeof coverage, chars: Set<string>): string[] =>
  [...chars].filter((c) => !covers(coverage[font] as Ranges, c.codePointAt(0) ?? 0));

/** Every source file as text (Vite raw imports, so no Node APIs are needed). */
const sources = import.meta.glob<string>('/src/**/*.ts', { query: '?raw', import: 'default', eager: true });

describe('font glyph coverage', () => {
  const contentChars = charsOf(content.allText() + JSON.stringify(ko) + JSON.stringify(en));

  it('the body and small fonts draw every character in the content and strings', () => {
    expect(missing('Galmuri11', contentChars)).toEqual([]);
    expect(missing('Galmuri9', contentChars)).toEqual([]);
  });

  it('the bold font draws every character in the content and strings', () => {
    expect(missing('Galmuri11-Bold', contentChars)).toEqual([]);
  });

  it('every non-ASCII character in UI code is drawable', () => {
    const code = Object.values(sources).join('');
    expect(code.length).toBeGreaterThan(100_000);
    const nonAscii = new Set([...charsOf(code)].filter((c) => (c.codePointAt(0) ?? 0) > 126));
    expect(missing('Galmuri11', nonAscii)).toEqual([]);
  });

  it('keeps every precomposed Hangul syllable (names come from the OS IME)', () => {
    for (const font of ['Galmuri11', 'Galmuri11-Bold', 'Galmuri9'] as const) {
      expect(covers(coverage[font] as Ranges, 0xac00)).toBe(true);
      expect(covers(coverage[font] as Ranges, 0xd7a3)).toBe(true);
      const hangul = (coverage[font] as Ranges).filter(([a, b]) => a <= 0xd7a3 && b >= 0xac00);
      expect(hangul).toEqual([[0xac00, 0xd7a3]]);
    }
  });
});
