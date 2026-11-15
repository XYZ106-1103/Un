/**
 * Focus management for stacked panels: only the top panel receives input.
 * Panels are Phaser containers implementing `handle(input)`.
 */

import Phaser from 'phaser';
import { DEPTH, PALETTE } from '@/game/Constants';
import type { InputSystem } from '@/systems/InputSystem';
import { drawPanel } from './Panel';
import { PixelText } from './PixelText';

export interface Focusable {
  handle(input: InputSystem): void;
  onFocus?(): void;
  onBlur?(): void;
}

export class UIStack {
  private readonly stack: Focusable[] = [];

  get top(): Focusable | undefined {
    return this.stack[this.stack.length - 1];
  }

  get size(): number {
    return this.stack.length;
  }

  push(panel: Focusable): void {
    this.top?.onBlur?.();
    this.stack.push(panel);
    panel.onFocus?.();
  }

  remove(panel: Focusable): void {
    const i = this.stack.indexOf(panel);
    if (i < 0) return;
    const wasTop = i === this.stack.length - 1;
    this.stack.splice(i, 1);
    if (wasTop) this.top?.onFocus?.();
  }

  handle(input: InputSystem): void {
    this.top?.handle(input);
  }

  clear(): void {
    this.stack.length = 0;
  }
}

/** Base class for framed panels: background, optional title, close callback. */
export class Panel extends Phaser.GameObjects.Container implements Focusable {
  protected readonly bg: Phaser.GameObjects.Graphics;
  protected closeHandler: (() => void) | null = null;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    readonly pw: number,
    readonly ph: number,
    title?: string,
  ) {
    super(scene, Math.round(x), Math.round(y));
    this.bg = scene.add.graphics();
    drawPanel(this.bg, 0, 0, pw, ph);
    this.add(this.bg);
    if (title) {
      this.add(new PixelText(scene, pw / 2, 7, title, { font: 'bold', color: PALETTE.tag, originX: 0.5 }));
    }
    this.setDepth(DEPTH.ui + 10);
    this.setScrollFactor(0, 0, true);
    scene.add.existing(this);
    // Entrance: drop in 4px with a quick fade (whole-pixel steps, no scaling blur).
    const targetY = this.y;
    this.y = targetY - 4;
    this.alpha = 0;
    scene.tweens.add({ targets: this, alpha: 1, duration: 110 });
    scene.tweens.addCounter({ from: 4, to: 0, duration: 110, onUpdate: (tw) => (this.y = targetY - Math.round(tw.getValue() ?? 0)) });
  }

  onClose(fn: () => void): this {
    this.closeHandler = fn;
    return this;
  }

  close(): void {
    const fn = this.closeHandler;
    this.closeHandler = null;
    this.destroy();
    fn?.();
  }

  handle(_input: InputSystem): void {}

  /** Children added after construction need the screen-space scroll factor too. */
  override add(child: Phaser.GameObjects.GameObject | Phaser.GameObjects.GameObject[]): this {
    super.add(child);
    const list = Array.isArray(child) ? child : [child];
    for (const c of list) (c as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor?.(0, 0);
    return this;
  }
}
