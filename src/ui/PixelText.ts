/**
 * Crisp pixel text. Use this for every piece of in-game text instead of Phaser.Text.
 *
 * Wraps BitmapText over the runtime pixel fonts (see systems/FontSystem.ts): glyphs are
 * rasterised on demand, colour is a tint, and size is an integer multiple of the font's
 * native size so letters stay on the pixel grid.
 */

import Phaser from 'phaser';
import { FONTS, PALETTE, type FontId } from '@/game/Constants';
import { getServices } from '@/game/Services';

export interface PixelTextOptions {
  font?: FontId;
  /** 0xRRGGBB, defaults to PALETTE.white. */
  color?: number;
  /** Integer multiplier of the font's native size. */
  scale?: 1 | 2 | 3 | 4;
  align?: 'left' | 'center' | 'right';
  /** Word-wrap width in native pixels. */
  maxWidth?: number;
  lineSpacing?: number;
  originX?: number;
  originY?: number;
}

const ALIGN = { left: 0, center: 1, right: 2 } as const;

export class PixelText extends Phaser.GameObjects.BitmapText {
  constructor(scene: Phaser.Scene, x: number, y: number, text: string, options: PixelTextOptions = {}) {
    const spec = FONTS[options.font ?? 'body'];
    getServices(scene.game).fonts.ensureByKey(spec.key, text);
    super(scene, Math.round(x), Math.round(y), spec.key, text, spec.size * (options.scale ?? 1), ALIGN[options.align ?? 'left']);
    this.setTint(options.color ?? PALETTE.white);
    if (options.maxWidth) this.setMaxWidth(options.maxWidth);
    if (options.lineSpacing) this.setLineSpacing(options.lineSpacing);
    this.setOrigin(options.originX ?? 0, options.originY ?? 0);
    scene.add.existing(this);
  }

  /** Called by the BitmapText constructor too, so it may not rely on subclass fields. */
  override setText(value: string | string[]): this {
    getServices(this.scene.game).fonts.ensureByKey(this.font, value);
    return super.setText(value);
  }

  setColor(color: number): this {
    return this.setTint(color);
  }
}

/** Adds a 1px drop shadow by placing a dark copy behind the text. Returns the shadow. */
export function addPixelShadow(text: PixelText, color: number = PALETTE.ink, offset = 1): PixelText {
  const scale = Math.round(text.fontSize / FONTS[fontIdOf(text)].size) as 1 | 2 | 3 | 4;
  const shadow = new PixelText(text.scene, text.x + offset * scale, text.y + offset * scale, text.text, {
    font: fontIdOf(text),
    color,
    scale,
    align: text.align === 1 ? 'center' : text.align === 2 ? 'right' : 'left',
    originX: text.originX,
    originY: text.originY,
  });
  if (text.maxWidth) shadow.setMaxWidth(text.maxWidth);
  shadow.setDepth(text.depth - 1);
  return shadow;
}

function fontIdOf(text: PixelText): FontId {
  const entry = (Object.entries(FONTS) as [FontId, (typeof FONTS)[FontId]][]).find(([, f]) => f.key === text.font);
  return entry ? entry[0] : 'body';
}
