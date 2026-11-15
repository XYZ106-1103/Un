/**
 * The player's soul in battle: the claim tag. Moves inside the battle box, has a small
 * forgiving hitbox at its centre and blinks while invulnerable after a hit.
 * Holding cancel moves slowly for precise dodging.
 */

import type Phaser from 'phaser';
import { DEPTH } from '@/game/Constants';
import type { Rect } from '@/systems/VirtualControls';

const SPEED = 96;
const SLOW = 48;
export const SOUL_RADIUS = 2;
const INVULNERABLE_MS = 900;

export class Soul {
  readonly sprite: Phaser.GameObjects.Image;
  x = 0;
  y = 0;
  private invulnerable = 0;

  constructor(scene: Phaser.Scene) {
    this.sprite = scene.add.image(0, 0, 'soul.tag').setOrigin(0.5).setDepth(DEPTH.ui + 5).setVisible(false);
  }

  get isInvulnerable(): boolean {
    return this.invulnerable > 0;
  }

  place(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.sprite.setPosition(Math.round(x), Math.round(y)).setVisible(true).setAlpha(1);
  }

  hide(): void {
    this.sprite.setVisible(false);
  }

  update(delta: number, axis: { x: number; y: number }, slow: boolean, box: Rect, reduceFlashing: boolean): void {
    const speed = (slow ? SLOW : SPEED) * (delta / 1000);
    const hw = 5;
    const hh = 3;
    this.x = Math.min(Math.max(this.x + axis.x * speed, box.x + hw + 1), box.x + box.w - hw - 1);
    this.y = Math.min(Math.max(this.y + axis.y * speed, box.y + hh + 1), box.y + box.h - hh - 1);
    this.sprite.setPosition(Math.round(this.x), Math.round(this.y));
    if (this.invulnerable > 0) {
      this.invulnerable -= delta;
      // Blink (slower and dimmer with reduced flashing).
      const period = reduceFlashing ? 240 : 120;
      this.sprite.setAlpha(Math.floor(this.invulnerable / period) % 2 === 0 ? 1 : reduceFlashing ? 0.6 : 0.25);
      if (this.invulnerable <= 0) this.sprite.setAlpha(1);
    }
  }

  hurt(): void {
    this.invulnerable = INVULNERABLE_MS;
  }
}
