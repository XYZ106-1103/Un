/**
 * The player's soul in battle: the claim tag. Moves inside the battle box, has a small
 * forgiving hitbox at its centre and blinks while invulnerable after a hit.
 * Holding cancel moves slowly for precise dodging.
 */

import type Phaser from 'phaser';
import { DEPTH, PALETTE } from '@/game/Constants';
import type { Rect } from '@/systems/VirtualControls';
import { pixelLine } from '@/utils/AnimationUtils';

/** Pendulum tuning for the tethered mode. */
const TETHER = { gravity: 520, push: 9, damping: 0.6, minLength: 18, reel: 50, maxAngle: 1.35 };

const SPEED = 96;
const SLOW = 48;
export const SOUL_RADIUS = 2;
const INVULNERABLE_MS = 900;

export class Soul {
  readonly sprite: Phaser.GameObjects.Image;
  private readonly string: Phaser.GameObjects.Graphics;
  x = 0;
  y = 0;
  private invulnerable = 0;
  /** 'tether': hangs from a pin and swings (left/right push, up/down reel). */
  mode: 'free' | 'tether' = 'free';
  private pin = { x: 0, y: 0 };
  private length = 40;
  private angle = 0;
  private omega = 0;

  constructor(scene: Phaser.Scene) {
    this.sprite = scene.add.image(0, 0, 'soul.tag').setOrigin(0.5).setDepth(DEPTH.ui + 5).setVisible(false);
    this.string = scene.add.graphics().setDepth(DEPTH.ui + 4);
  }

  /** Switches to the pendulum rule, pinned at the top centre of the box. */
  tether(box: Rect): void {
    this.mode = 'tether';
    this.pin = { x: box.x + box.w / 2, y: box.y + 2 };
    this.length = Math.min(box.h - 10, Math.max(TETHER.minLength, this.y - this.pin.y));
    this.angle = 0;
    this.omega = 0;
  }

  free(): void {
    this.mode = 'free';
    this.string.clear();
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
    this.string.clear();
  }

  update(delta: number, axis: { x: number; y: number }, slow: boolean, box: Rect, reduceFlashing: boolean): void {
    const hw = 5;
    const hh = 3;
    if (this.mode === 'tether') {
      const dt = delta / 1000;
      const maxLength = box.h - hh - 4;
      this.length = Math.min(maxLength, Math.max(TETHER.minLength, this.length + axis.y * TETHER.reel * dt));
      const alpha = (-TETHER.gravity / this.length) * Math.sin(this.angle) + axis.x * TETHER.push;
      this.omega = (this.omega + alpha * dt) * Math.pow(TETHER.damping, dt);
      this.angle += this.omega * dt;
      if (Math.abs(this.angle) > TETHER.maxAngle) {
        this.angle = Math.sign(this.angle) * TETHER.maxAngle;
        this.omega *= -0.3;
      }
      this.x = Math.min(Math.max(this.pin.x + Math.sin(this.angle) * this.length, box.x + hw + 1), box.x + box.w - hw - 1);
      this.y = Math.min(Math.max(this.pin.y + Math.cos(this.angle) * this.length, box.y + hh + 1), box.y + box.h - hh - 1);
      this.string.clear().fillStyle(PALETTE.mist);
      pixelLine(this.string, this.pin.x, this.pin.y, this.x - 3, this.y - 1);
      this.string.fillStyle(PALETTE.paper).fillRect(this.pin.x - 1, this.pin.y - 1, 3, 3);
    } else {
      const speed = (slow ? SLOW : SPEED) * (delta / 1000);
      this.x = Math.min(Math.max(this.x + axis.x * speed, box.x + hw + 1), box.x + box.w - hw - 1);
      this.y = Math.min(Math.max(this.y + axis.y * speed, box.y + hh + 1), box.y + box.h - hh - 1);
    }
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
