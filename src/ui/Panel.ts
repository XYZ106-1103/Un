/**
 * The game's window frame: a dark label card with a paper-coloured border, clipped
 * corners and an inner rule. Drawn with whole-pixel rects so it stays crisp at any scale.
 */

import type Phaser from 'phaser';
import { PALETTE } from '@/game/Constants';

export interface PanelStyle {
  fill?: number;
  fillAlpha?: number;
  border?: number;
  inner?: number;
}

export function drawPanel(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  style: PanelStyle = {},
): void {
  x = Math.round(x);
  y = Math.round(y);
  w = Math.round(w);
  h = Math.round(h);
  const border = style.border ?? PALETTE.paper;
  const inner = style.inner ?? PALETTE.slate;
  g.fillStyle(style.fill ?? PALETTE.ink, style.fillAlpha ?? 1);
  g.fillRect(x + 1, y + 1, w - 2, h - 2);
  // Outer border with clipped corners.
  g.fillStyle(border);
  g.fillRect(x + 2, y, w - 4, 1);
  g.fillRect(x + 2, y + h - 1, w - 4, 1);
  g.fillRect(x, y + 2, 1, h - 4);
  g.fillRect(x + w - 1, y + 2, 1, h - 4);
  g.fillRect(x + 1, y + 1, 1, 1);
  g.fillRect(x + w - 2, y + 1, 1, 1);
  g.fillRect(x + 1, y + h - 2, 1, 1);
  g.fillRect(x + w - 2, y + h - 2, 1, 1);
  // Inner rule.
  g.fillStyle(inner);
  g.fillRect(x + 3, y + 2, w - 6, 1);
  g.fillRect(x + 3, y + h - 3, w - 6, 1);
  g.fillRect(x + 2, y + 3, 1, h - 6);
  g.fillRect(x + w - 3, y + 3, 1, h - 6);
}

/** Horizontal HP-style bar with a 1px frame. */
export function drawBar(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  ratio: number,
  color: number,
  back: number = PALETTE.rust,
): void {
  const r = Math.min(Math.max(ratio, 0), 1);
  g.fillStyle(PALETTE.ink);
  g.fillRect(x - 1, y - 1, w + 2, h + 2);
  g.fillStyle(back);
  g.fillRect(x, y, w, h);
  g.fillStyle(color);
  g.fillRect(x, y, Math.round(w * r), h);
}
