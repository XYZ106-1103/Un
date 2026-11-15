/**
 * Ordered (Bayer) dithering: smooth gradients that only ever use palette colours, so
 * backdrops stay on the pixel grid instead of introducing blended in-between shades.
 */

/** 4x4 Bayer matrix, values 0..15. */
const BAYER_4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
] as const;

/** Threshold in (0, 1) for pixel (x, y). */
export function bayerThreshold(x: number, y: number): number {
  const row = BAYER_4[((y % 4) + 4) % 4] as readonly number[];
  return ((row[((x % 4) + 4) % 4] as number) + 0.5) / 16;
}

/**
 * Which colour stop pixel (x, y) uses for a vertical gradient through `stopCount`
 * evenly spaced stops over `height` rows.
 */
export function gradientStopIndex(x: number, y: number, height: number, stopCount: number): number {
  if (stopCount <= 1 || height <= 1) return 0;
  const t = Math.min(Math.max(y / (height - 1), 0), 1) * (stopCount - 1);
  const lower = Math.min(Math.floor(t), stopCount - 2);
  const fraction = t - lower;
  return fraction > bayerThreshold(x, y) ? lower + 1 : lower;
}

/** Paints a dithered vertical gradient of 0xRRGGBB `stops` into a 2D context. */
export function paintDitheredGradient(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  stops: readonly number[],
): void {
  const image = ctx.createImageData(width, height);
  const px = image.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const color = stops[gradientStopIndex(x, y, height, stops.length)] ?? 0;
      const i = (y * width + x) * 4;
      px[i] = (color >> 16) & 0xff;
      px[i + 1] = (color >> 8) & 0xff;
      px[i + 2] = color & 0xff;
      px[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
}
