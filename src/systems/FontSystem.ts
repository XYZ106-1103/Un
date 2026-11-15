/**
 * Runtime bitmap fonts built from the Galmuri pixel fonts.
 *
 * Why: canvas `fillText` anti-aliases, so ordinary Phaser Text at 480x270 grows grey
 * fringe pixels that turn into smudges when the canvas is scaled up. Shipping a
 * pre-baked bitmap font for Korean is impractical (11,172 Hangul syllables per font),
 * so each glyph is rasterised once, the first time it is needed, alpha-thresholded to
 * hard 1-bit pixels, and packed into a shared atlas registered as a Phaser bitmap font.
 *
 * Glyphs are white; colour comes from tinting, so one atlas serves every text colour.
 * Larger text is drawn by integer-scaling the font (2x, 3x), never by rasterising at a
 * non-native size, which keeps the pixel grid intact.
 */

import type Phaser from 'phaser';
import { FONTS, type FontId } from '@/game/Constants';

type CharData = Phaser.Types.GameObjects.BitmapText.BitmapFontCharacterData & { xAdvance: number };
type FontData = Omit<Phaser.Types.GameObjects.BitmapText.BitmapFontData, 'chars'> & {
  chars: Record<number, CharData>;
};

interface GlyphSlot {
  code: number;
  x: number;
  y: number;
  advance: number;
}

/** Printable ASCII plus punctuation the script uses constantly. */
const BASE_CHARSET =
  Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('') +
  '…·「」『』“”‘’—–～！？。、♪★☆♥←↑→↓';

const INITIAL_ATLAS_SIZE = 256;
const MAX_ATLAS_SIZE = 2048;
/** Alpha at or above this (0-255) becomes a solid pixel; below it, transparent. */
const ALPHA_THRESHOLD = 110;

class PixelFont {
  readonly data: FontData;
  private readonly slots = new Map<number, GlyphSlot>();
  private readonly texture: Phaser.Textures.CanvasTexture;
  private readonly scratch: CanvasRenderingContext2D;
  private readonly lineHeight: number;
  private readonly cssFont: string;
  private cursorX = 0;
  private cursorY = 0;

  constructor(
    textures: Phaser.Textures.TextureManager,
    cache: Phaser.Cache.BaseCache,
    private readonly spec: (typeof FONTS)[FontId],
  ) {
    this.lineHeight = spec.ascent + spec.descent;
    this.cssFont = `${spec.size}px "${spec.family}"`;

    const texture = textures.createCanvas(spec.key, INITIAL_ATLAS_SIZE, INITIAL_ATLAS_SIZE);
    if (!texture) throw new Error(`FontSystem: could not create atlas "${spec.key}"`);
    this.texture = texture;
    this.texture.context.imageSmoothingEnabled = false;

    const scratchCanvas = document.createElement('canvas');
    scratchCanvas.width = spec.size * 3;
    scratchCanvas.height = this.lineHeight;
    const scratch = scratchCanvas.getContext('2d', { willReadFrequently: true });
    if (!scratch) throw new Error('FontSystem: 2D canvas unavailable');
    this.scratch = scratch;

    this.data = { font: spec.key, size: spec.size, lineHeight: this.lineHeight, retroFont: false, chars: {} };
    cache.add(spec.key, { data: this.data, texture: spec.key, frame: null });
  }

  get glyphCount(): number {
    return this.slots.size;
  }

  get atlasSize(): number {
    return this.texture.width;
  }

  /** Rasterises any glyphs of `text` not yet in the atlas. Returns how many were added. */
  ensure(text: string): number {
    let added = 0;
    for (const ch of text) {
      const code = ch.codePointAt(0);
      if (code === undefined || code === 10 || code === 13 || this.slots.has(code)) continue;
      // BitmapText indexes glyphs by UTF-16 code unit; astral characters (emoji) are unsupported.
      if (code > 0xffff) continue;
      this.place(code);
      added++;
    }
    if (added > 0) this.texture.refresh();
    return added;
  }

  private place(code: number): void {
    const advance = this.measure(code);
    const rowHeight = this.lineHeight + 1;
    if (this.cursorX + advance + 1 > this.texture.width) {
      this.cursorX = 0;
      this.cursorY += rowHeight;
    }
    if (this.cursorY + rowHeight > this.texture.height) {
      this.grow();
      if (this.cursorX + advance + 1 > this.texture.width) {
        this.cursorX = 0;
        this.cursorY += rowHeight;
      }
    }
    const slot: GlyphSlot = { code, x: this.cursorX, y: this.cursorY, advance };
    this.cursorX += advance + 1;
    this.slots.set(code, slot);
    this.draw(slot);
    this.writeCharData(slot);
  }

  private measure(code: number): number {
    const ctx = this.scratch;
    ctx.font = this.cssFont;
    return Math.max(1, Math.round(ctx.measureText(String.fromCharCode(code)).width));
  }

  private draw(slot: GlyphSlot): void {
    if (slot.code === 32) return; // space: advance only, nothing to draw
    const ctx = this.scratch;
    const w = Math.min(slot.advance, ctx.canvas.width);
    const h = this.lineHeight;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.font = this.cssFont;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String.fromCharCode(slot.code), 0, this.spec.ascent);

    const image = ctx.getImageData(0, 0, w, h);
    const px = image.data;
    for (let i = 0; i < px.length; i += 4) {
      const solid = (px[i + 3] ?? 0) >= ALPHA_THRESHOLD;
      px[i] = 255;
      px[i + 1] = 255;
      px[i + 2] = 255;
      px[i + 3] = solid ? 255 : 0;
    }
    this.texture.context.putImageData(image, slot.x, slot.y);
  }

  private writeCharData(slot: GlyphSlot): void {
    const size = this.texture.width;
    const sizeY = this.texture.height;
    const h = this.lineHeight;
    const next: CharData = {
      x: slot.x,
      y: slot.y,
      width: slot.advance,
      height: h,
      centerX: Math.floor(slot.advance / 2),
      centerY: Math.floor(h / 2),
      xOffset: 0,
      yOffset: 0,
      xAdvance: slot.advance,
      u0: slot.x / size,
      v0: slot.y / sizeY,
      u1: (slot.x + slot.advance) / size,
      v1: (slot.y + h) / sizeY,
      data: {},
      kerning: {},
    };
    // Update in place: existing BitmapTexts cache references to these glyph objects, so
    // replacing them after the atlas grows would leave those texts sampling stale UVs.
    const existing = this.data.chars[slot.code];
    if (existing) Object.assign(existing, next);
    else this.data.chars[slot.code] = next;
  }

  /** Doubles the atlas and repacks every glyph (UVs depend on atlas size). */
  private grow(): void {
    const next = this.texture.width * 2;
    if (next > MAX_ATLAS_SIZE) throw new Error(`FontSystem: atlas "${this.spec.key}" is full`);
    this.texture.setSize(next, next);
    this.texture.context.imageSmoothingEnabled = false;
    this.texture.context.clearRect(0, 0, next, next);
    this.cursorX = 0;
    this.cursorY = 0;
    const rowHeight = this.lineHeight + 1;
    for (const slot of this.slots.values()) {
      if (this.cursorX + slot.advance + 1 > next) {
        this.cursorX = 0;
        this.cursorY += rowHeight;
      }
      slot.x = this.cursorX;
      slot.y = this.cursorY;
      this.cursorX += slot.advance + 1;
      this.draw(slot);
      this.writeCharData(slot);
    }
  }
}

export class FontSystem {
  private readonly fonts = new Map<string, PixelFont>();

  constructor(textures: Phaser.Textures.TextureManager, cache: Phaser.Cache.BaseCache) {
    for (const spec of Object.values(FONTS)) {
      const font = new PixelFont(textures, cache, spec);
      font.ensure(BASE_CHARSET);
      this.fonts.set(spec.key, font);
    }
  }

  /** Makes sure every character of `text` can be drawn with the given font key. */
  ensureByKey(fontKey: string, text: string | readonly string[]): void {
    const font = this.fonts.get(fontKey);
    if (!font) return;
    font.ensure(typeof text === 'string' ? text : text.join('\n'));
  }

  ensure(font: FontId, text: string): void {
    this.ensureByKey(FONTS[font].key, text);
  }

  /** Pre-rasterises a whole script (e.g. every line of a chapter) during loading. */
  preload(text: string): void {
    for (const font of this.fonts.values()) font.ensure(text);
  }

  /** Width in native pixels of `text` drawn with `font` at scale 1. */
  measure(font: FontId, text: string): number {
    const pf = this.fonts.get(FONTS[font].key);
    if (!pf) return 0;
    pf.ensure(text);
    let width = 0;
    for (const ch of text) width += pf.data.chars[ch.codePointAt(0) ?? 0]?.xAdvance ?? 0;
    return width;
  }

  stats(): { key: string; glyphs: number; atlas: number }[] {
    return [...this.fonts.entries()].map(([key, f]) => ({ key, glyphs: f.glyphCount, atlas: f.atlasSize }));
  }
}

/** Waits for the pixel web fonts; resolves false (with a warning) if any failed. */
export async function loadWebFonts(timeoutMs = 8000): Promise<boolean> {
  if (typeof document === 'undefined' || !('fonts' in document)) return false;
  const loads = Object.values(FONTS).map((f) => document.fonts.load(`${f.size}px "${f.family}"`, '가A'));
  const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), timeoutMs));
  try {
    const result = await Promise.race([Promise.all(loads), timeout]);
    if (result === 'timeout') {
      console.warn('[FontSystem] web fonts timed out; text will use a fallback font');
      return false;
    }
    // load() resolves with an empty list when no @font-face matches the family.
    const specs = Object.values(FONTS);
    const missing = specs.filter((_, i) => (result[i]?.length ?? 0) === 0);
    if (missing.length > 0) {
      console.warn('[FontSystem] fonts unavailable:', missing.map((f) => f.family).join(', '));
      return false;
    }
    return true;
  } catch (error) {
    console.warn('[FontSystem] font loading failed', error);
    return false;
  }
}
