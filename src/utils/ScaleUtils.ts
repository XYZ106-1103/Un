/**
 * Pure screen-fitting math, kept free of Phaser/DOM so it can be unit tested.
 *
 * The goal is crisp pixels: one native game pixel should cover a whole number of
 * *device* pixels. On a 125% Windows display a 1536x864 CSS viewport is really
 * 1920x1080 device pixels, so the right answer is 4 device px per game px (3.2 CSS px),
 * not 3 CSS px (which would be 3.75 device px and produce uneven pixel columns).
 */

export type ScaleMode = 'auto' | 'pixel-perfect' | 'fit';

export const SCALE_MODES: readonly ScaleMode[] = ['auto', 'pixel-perfect', 'fit'];

export interface Viewport {
  /** Available width in CSS pixels. */
  width: number;
  /** Available height in CSS pixels. */
  height: number;
  /** window.devicePixelRatio */
  dpr: number;
}

export interface ScaleResult {
  /** CSS pixels per native game pixel (what Phaser's ScaleManager zoom expects). */
  zoom: number;
  /** Device pixels per native game pixel. */
  deviceScale: number;
  /** True when every game pixel maps to an identical whole number of device pixels. */
  integer: boolean;
  /** Canvas size and offset in CSS pixels, aligned to the device pixel grid. */
  cssWidth: number;
  cssHeight: number;
  left: number;
  top: number;
}

/**
 * In `auto` mode an integer scale is used whenever it fills at least this fraction of
 * the largest possible fractional scale; below that, wasting screen space is worse
 * than slightly uneven pixels.
 */
export const AUTO_INTEGER_THRESHOLD = 0.85;

export function computeScale(
  viewport: Viewport,
  baseWidth: number,
  baseHeight: number,
  mode: ScaleMode,
  autoThreshold: number = AUTO_INTEGER_THRESHOLD,
): ScaleResult {
  const dpr = viewport.dpr > 0 && Number.isFinite(viewport.dpr) ? viewport.dpr : 1;
  const deviceW = Math.max(1, Math.floor(viewport.width * dpr));
  const deviceH = Math.max(1, Math.floor(viewport.height * dpr));

  const fitScale = Math.min(deviceW / baseWidth, deviceH / baseHeight);
  const intScale = Math.floor(fitScale);

  let deviceScale: number;
  switch (mode) {
    case 'pixel-perfect':
      // Below 1x an integer scale cannot fit at all, so fall back to shrinking.
      deviceScale = intScale >= 1 ? intScale : fitScale;
      break;
    case 'fit':
      deviceScale = fitScale;
      break;
    case 'auto':
    default:
      deviceScale = intScale >= 1 && intScale / fitScale >= autoThreshold ? intScale : fitScale;
      break;
  }

  const integer = Number.isInteger(deviceScale);
  // Snap the canvas to whole device pixels so its edges never land mid-pixel.
  const deviceCanvasW = integer ? baseWidth * deviceScale : Math.floor(baseWidth * deviceScale);
  const deviceCanvasH = integer ? baseHeight * deviceScale : Math.floor(baseHeight * deviceScale);
  const deviceLeft = Math.floor((deviceW - deviceCanvasW) / 2);
  const deviceTop = Math.floor((deviceH - deviceCanvasH) / 2);

  return {
    zoom: deviceScale / dpr,
    deviceScale,
    integer,
    cssWidth: deviceCanvasW / dpr,
    cssHeight: deviceCanvasH / dpr,
    left: deviceLeft / dpr,
    top: deviceTop / dpr,
  };
}

export function isScaleMode(value: unknown): value is ScaleMode {
  return typeof value === 'string' && (SCALE_MODES as readonly string[]).includes(value);
}
