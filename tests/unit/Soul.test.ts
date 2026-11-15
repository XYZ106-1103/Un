import { describe, expect, it } from 'vitest';
import { SPIN, spinDrift } from '@/entities/Soul';

const SOUL_SPEED = 96;

describe('spin soul rule (Tumble)', () => {
  it('swirls around the centre: the push is perpendicular to the radius (plus a small outward part)', () => {
    const t = SPIN.rampMs + 100;
    const d = spinDrift(140, 100, 100, 100, 40, t); // right of centre
    expect(Math.abs(d.vy)).toBeGreaterThan(Math.abs(d.vx) * 2);
    expect(d.vx).toBeGreaterThan(0); // slight outward pull
  });

  it('reverses direction every cycle, easing in from zero', () => {
    const at = (t: number) => spinDrift(140, 100, 100, 100, 40, t).vy;
    expect(Math.sign(at(SPIN.rampMs + 10))).toBe(-Math.sign(at(SPIN.reverseMs + SPIN.rampMs + 10)));
    expect(Math.abs(at(SPIN.reverseMs))).toBeLessThan(0.01); // calm at the moment of reversal
  });

  it('is weak near the centre and never as fast as the soul, so it can always be steered against', () => {
    const t = SPIN.rampMs + 1;
    const near = spinDrift(104, 100, 100, 100, 40, t);
    const edge = spinDrift(140, 100, 100, 100, 40, t);
    expect(Math.hypot(near.vx, near.vy)).toBeLessThan(Math.hypot(edge.vx, edge.vy));
    for (let a = 0; a < Math.PI * 2; a += 0.4) {
      const d = spinDrift(100 + Math.cos(a) * 80, 100 + Math.sin(a) * 80, 100, 100, 40, t);
      expect(Math.hypot(d.vx, d.vy)).toBeLessThan(SOUL_SPEED * 0.75);
    }
    expect(spinDrift(100, 100, 100, 100, 40, t)).toEqual({ vx: 0, vy: 0 });
  });
});
