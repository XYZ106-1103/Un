/** Small, dependency-free math helpers shared by every system. */

export const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Moves `current` toward `target` by at most `maxDelta` without overshooting. */
export const approach = (current: number, target: number, maxDelta: number): number => {
  if (current < target) return Math.min(current + maxDelta, target);
  if (current > target) return Math.max(current - maxDelta, target);
  return target;
};

/** Wraps an integer index into [0, length). Handles negatives (menu cursors). */
export const wrapIndex = (index: number, length: number): number =>
  length <= 0 ? 0 : ((index % length) + length) % length;

export const degToRad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Deterministic PRNG (mulberry32). Battle patterns use seeded randomness so a
 * pattern can be replayed exactly for testing and tuning.
 */
export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(minInclusive: number, maxInclusive: number): number {
    return Math.floor(this.range(minInclusive, maxInclusive + 1));
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('SeededRandom.pick: empty array');
    return items[Math.floor(this.next() * items.length)] as T;
  }
}
