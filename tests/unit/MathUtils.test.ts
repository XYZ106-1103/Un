import { describe, expect, it } from 'vitest';
import { approach, clamp, SeededRandom, wrapIndex } from '@/utils/MathUtils';
import { bayerThreshold, gradientStopIndex } from '@/utils/DitherUtils';

describe('MathUtils', () => {
  it('clamp / approach / wrapIndex', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(approach(0, 10, 3)).toBe(3);
    expect(approach(9, 10, 3)).toBe(10);
    expect(approach(10, 0, 4)).toBe(6);
    expect(wrapIndex(-1, 4)).toBe(3);
    expect(wrapIndex(5, 4)).toBe(1);
    expect(wrapIndex(2, 0)).toBe(0);
  });

  it('SeededRandom is deterministic and in range', () => {
    const a = new SeededRandom(42);
    const b = new SeededRandom(42);
    const seqA = Array.from({ length: 50 }, () => a.next());
    const seqB = Array.from({ length: 50 }, () => b.next());
    expect(seqA).toEqual(seqB);
    expect(seqA.every((v) => v >= 0 && v < 1)).toBe(true);
    const r = new SeededRandom(7);
    for (let i = 0; i < 200; i++) {
      const n = r.int(1, 6);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(6);
    }
    expect(() => r.pick([])).toThrow();
  });
});

describe('DitherUtils', () => {
  it('bayer thresholds cover (0,1) with 16 distinct levels', () => {
    const values = new Set<number>();
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) values.add(bayerThreshold(x, y));
    expect(values.size).toBe(16);
    expect(Math.min(...values)).toBeGreaterThan(0);
    expect(Math.max(...values)).toBeLessThan(1);
    expect(bayerThreshold(-1, -1)).toBe(bayerThreshold(3, 3));
  });

  it('gradient starts on the first stop, ends on the last, and mixes in between', () => {
    const h = 100;
    expect(gradientStopIndex(0, 0, h, 3)).toBe(0);
    expect(gradientStopIndex(3, h - 1, h, 3)).toBe(2);
    const mid = new Set<number>();
    for (let x = 0; x < 4; x++) for (let y = 24; y < 28; y++) mid.add(gradientStopIndex(x, y, h, 3));
    expect([...mid].sort()).toEqual([0, 1]);
  });
});
