/**
 * Builds textures for manifest entries that have no image file yet.
 *
 * - `pixels` entries are real (tiny) art authored inline in the manifest: they are
 *   rasterised exactly as written.
 * - `placeholder` images/spritesheets get a deliberately obvious stand-in (magenta,
 *   crossed-out boxes) so nobody mistakes them for finished art.
 */

import type Phaser from 'phaser';
import { PALETTE, toCss } from '@/game/Constants';
import type { AssetEntry, ImageEntry, PixelArtEntry, PixelsEntry, SpritesheetEntry } from './AssetManifest';
import { resolvePixelArt } from './PixelArt';

const MAGENTA = toCss(PALETTE.placeholder);
const MAGENTA_DARK = '#5a0f5a';

function makeCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('PlaceholderFactory: 2D canvas unavailable');
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

export function createPixelsTexture(textures: Phaser.Textures.TextureManager, entry: PixelsEntry): void {
  const height = entry.rows.length;
  const width = entry.rows[0]?.length ?? 0;
  const { canvas, ctx } = makeCanvas(width, height);
  entry.rows.forEach((row, y) => {
    [...row].forEach((symbol, x) => {
      const colorName = entry.palette[symbol];
      if (symbol === '.' || !colorName) return;
      ctx.fillStyle = toCss(PALETTE[colorName]);
      ctx.fillRect(x, y, 1, 1);
    });
  });
  textures.addCanvas(entry.key, canvas);
}

/**
 * Rasterises a pixel-art document into one canvas texture with named frames laid out
 * in a row. Frame names are the document's frame keys.
 */
export function createPixelArtTexture(textures: Phaser.Textures.TextureManager, entry: PixelArtEntry): void {
  const [w, h] = entry.doc.size;
  const frames = resolvePixelArt(entry.doc, entry.source);
  const { canvas, ctx } = makeCanvas(w * frames.length, h);
  const image = ctx.createImageData(w * frames.length, h);
  frames.forEach((frame, index) => {
    frame.pixels.forEach((color, i) => {
      if (color === null) return;
      const x = index * w + (i % w);
      const y = Math.floor(i / w);
      const o = (y * w * frames.length + x) * 4;
      image.data[o] = (color >> 16) & 0xff;
      image.data[o + 1] = (color >> 8) & 0xff;
      image.data[o + 2] = color & 0xff;
      image.data[o + 3] = 255;
    });
  });
  ctx.putImageData(image, 0, 0);
  const texture = textures.addCanvas(entry.key, canvas);
  if (!texture) return;
  frames.forEach((frame, index) => texture.add(frame.name, 0, index * w, 0, w, h));
}

/** Registers a document's animations as `<assetKey>:<animation>`. */
export function createPixelArtAnimations(anims: Phaser.Animations.AnimationManager, entry: PixelArtEntry): void {
  for (const [name, def] of Object.entries(entry.doc.animations ?? {})) {
    const key = `${entry.key}:${name}`;
    if (anims.exists(key)) continue;
    anims.create({
      key,
      frames: def.frames.map((frame) => ({ key: entry.key, frame })),
      frameRate: def.rate,
      repeat: def.repeat ?? -1,
    });
  }
}

/** Crossed-out magenta box: the universal "art missing here" sign. */
function drawMissingBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = MAGENTA_DARK;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = MAGENTA;
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x, y, 1, h);
  ctx.fillRect(x + w - 1, y, 1, h);
  const steps = Math.max(w, h);
  for (let i = 0; i < steps; i++) {
    const px = Math.floor((i / steps) * w);
    const py = Math.floor((i / steps) * h);
    ctx.fillRect(x + px, y + py, 1, 1);
    ctx.fillRect(x + w - 1 - px, y + py, 1, 1);
  }
}

function createImagePlaceholder(textures: Phaser.Textures.TextureManager, entry: ImageEntry): void {
  const [w, h] = entry.size;
  const { canvas, ctx } = makeCanvas(w, h);
  drawMissingBox(ctx, 0, 0, w, h);
  textures.addCanvas(entry.key, canvas);
}

function createSpritesheetPlaceholder(textures: Phaser.Textures.TextureManager, entry: SpritesheetEntry): void {
  const [w, h] = entry.size;
  const { canvas, ctx } = makeCanvas(w * entry.frames, h);
  for (let i = 0; i < entry.frames; i++) {
    const ox = i * w;
    drawMissingBox(ctx, ox, 0, w, h);
  }
  const texture = textures.addCanvas(entry.key, canvas);
  if (!texture) return;
  for (let i = 0; i < entry.frames; i++) texture.add(i, 0, i * w, 0, w, h);
}

/** Generates textures for every entry not already provided by a loaded file. */
export function buildGeneratedTextures(textures: Phaser.Textures.TextureManager, entries: readonly AssetEntry[]): void {
  for (const entry of entries) {
    if (textures.exists(entry.key)) continue;
    if (entry.kind === 'pixels') createPixelsTexture(textures, entry);
    else if (entry.kind === 'pixelart') createPixelArtTexture(textures, entry);
    else if (entry.kind === 'image') createImagePlaceholder(textures, entry);
    else createSpritesheetPlaceholder(textures, entry);
  }
}
