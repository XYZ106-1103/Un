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
const MAGENTA_LIGHT = '#ffb3ff';

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

/** Direction order of the player sheet: down, left, right, up (4 frames each). */
const FACING: readonly [number, number][] = [
  [0, 1],
  [-1, 0],
  [1, 0],
  [0, -1],
];

function drawPlayerFrame(ctx: CanvasRenderingContext2D, ox: number, w: number, h: number, frame: number): void {
  const dir = FACING[Math.floor(frame / 4)] ?? [0, 1];
  const step = frame % 4;
  const bob = step === 1 || step === 3 ? -1 : 0;
  const bodyW = 10;
  const bodyH = 18;
  const bx = ox + Math.floor((w - bodyW) / 2);
  const by = h - bodyH - 1 + bob;

  ctx.fillStyle = MAGENTA_DARK;
  ctx.fillRect(bx - 1, by - 1, bodyW + 2, bodyH + 2 - bob);
  ctx.fillStyle = MAGENTA;
  ctx.fillRect(bx, by, bodyW, bodyH);
  // Head band, so the silhouette reads as "character" not "box".
  ctx.fillStyle = MAGENTA_LIGHT;
  ctx.fillRect(bx, by + 6, bodyW, 1);
  // Facing marker: two "eyes" pushed toward the facing direction.
  ctx.fillStyle = '#ffffff';
  const cx = bx + bodyW / 2 + dir[0] * 2;
  const cy = by + 3 + dir[1];
  if (dir[1] !== -1) {
    ctx.fillRect(Math.floor(cx - 2), cy, 1, 2);
    ctx.fillRect(Math.floor(cx + 1), cy, 1, 2);
  }
  // Alternating feet on walk frames.
  ctx.fillStyle = MAGENTA_DARK;
  if (step === 1) ctx.fillRect(bx + 1, h - 1, 3, 1);
  if (step === 3) ctx.fillRect(bx + bodyW - 4, h - 1, 3, 1);
}

function drawDevTile(ctx: CanvasRenderingContext2D, ox: number, size: number, frame: number): void {
  const base = ['#24202e', '#2c2738', '#4a4458', '#24202e'][frame] ?? '#24202e';
  ctx.fillStyle = base;
  ctx.fillRect(ox, 0, size, size);
  if (frame === 0 || frame === 1) {
    ctx.fillStyle = '#34304a';
    ctx.fillRect(ox, 0, size, 1);
    ctx.fillRect(ox, 0, 1, size);
  } else if (frame === 2) {
    ctx.fillStyle = '#5d5670';
    ctx.fillRect(ox, 0, size, 2);
    ctx.fillStyle = '#1b1824';
    ctx.fillRect(ox, size - 2, size, 2);
  } else {
    drawMissingBox(ctx, ox + 4, 4, size - 8, size - 8);
  }
  // Magenta corner pixel marks every dev tile as placeholder art.
  ctx.fillStyle = MAGENTA;
  ctx.fillRect(ox + size - 2, 1, 1, 1);
}

function createSpritesheetPlaceholder(textures: Phaser.Textures.TextureManager, entry: SpritesheetEntry): void {
  const [w, h] = entry.size;
  const { canvas, ctx } = makeCanvas(w * entry.frames, h);
  for (let i = 0; i < entry.frames; i++) {
    const ox = i * w;
    if (entry.key === 'char.player') drawPlayerFrame(ctx, ox, w, h, i);
    else if (entry.key === 'tiles.dev') drawDevTile(ctx, ox, w, i);
    else drawMissingBox(ctx, ox, 0, w, h);
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
