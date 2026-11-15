import { describe, expect, it } from 'vitest';
import { computeScale } from '@/utils/ScaleUtils';

const W = 480;
const H = 270;

describe('computeScale', () => {
  it('uses an exact integer scale on a 1080p screen', () => {
    const r = computeScale({ width: 1920, height: 1080, dpr: 1 }, W, H, 'auto');
    expect(r).toMatchObject({ deviceScale: 4, zoom: 4, integer: true, cssWidth: 1920, cssHeight: 1080, left: 0, top: 0 });
  });

  it('scales in device pixels on a 125% display (3.2 CSS px = 4 device px)', () => {
    const r = computeScale({ width: 1536, height: 864, dpr: 1.25 }, W, H, 'auto');
    expect(r.deviceScale).toBe(4);
    expect(r.integer).toBe(true);
    expect(r.zoom).toBeCloseTo(3.2);
    expect(r.cssWidth).toBeCloseTo(1536);
  });

  it('auto mode prefers fractional scaling when integer would waste too much space', () => {
    const r = computeScale({ width: 1366, height: 768, dpr: 1 }, W, H, 'auto');
    expect(r.integer).toBe(false);
    expect(r.deviceScale).toBeCloseTo(768 / 270);
  });

  it('pixel-perfect mode always picks an integer scale when one fits', () => {
    const r = computeScale({ width: 1366, height: 768, dpr: 1 }, W, H, 'pixel-perfect');
    expect(r.deviceScale).toBe(2);
    expect(r.left).toBe(Math.floor((1366 - 960) / 2));
    expect(r.top).toBe(Math.floor((768 - 540) / 2));
  });

  it('fit mode always fills the limiting dimension', () => {
    const r = computeScale({ width: 1920, height: 1200, dpr: 1 }, W, H, 'fit');
    expect(r.cssWidth).toBe(1920);
    expect(r.cssHeight).toBe(1080);
    expect(r.top).toBe(60);
  });

  it('high-DPR phones in landscape get integer scaling for free', () => {
    const r = computeScale({ width: 844, height: 390, dpr: 3 }, W, H, 'auto');
    expect(r.deviceScale).toBe(4);
    expect(r.integer).toBe(true);
  });

  it('shrinks below 1x instead of overflowing tiny viewports, even in pixel-perfect mode', () => {
    const r = computeScale({ width: 320, height: 180, dpr: 1 }, W, H, 'pixel-perfect');
    expect(r.deviceScale).toBeLessThan(1);
    expect(r.cssWidth).toBeLessThanOrEqual(320);
  });

  it('keeps the canvas aligned to whole device pixels', () => {
    for (const dpr of [1, 1.25, 1.5, 1.75, 2, 2.625, 3]) {
      for (const mode of ['auto', 'pixel-perfect', 'fit'] as const) {
        const r = computeScale({ width: 1013, height: 641, dpr }, W, H, mode);
        expect(Number.isInteger(Math.round(r.left * dpr * 1e6) / 1e6)).toBe(true);
        expect(Number.isInteger(Math.round(r.cssWidth * dpr * 1e6) / 1e6)).toBe(true);
        expect(r.cssWidth).toBeLessThanOrEqual(1013 + 1e-9);
        expect(r.cssHeight).toBeLessThanOrEqual(641 + 1e-9);
      }
    }
  });

  it('survives a bogus devicePixelRatio', () => {
    const r = computeScale({ width: 960, height: 540, dpr: 0 }, W, H, 'auto');
    expect(r.deviceScale).toBe(2);
  });
});
