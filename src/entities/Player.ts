/**
 * The overworld player: 4-direction movement with per-axis collision (slides along
 * walls), walking/running animation and a feet-sized hitbox.
 *
 * Art convention (src/data/art/player.json): frames `<facing>-0..2`, animations
 * `walk-<facing>` and `idle-<facing>`.
 */

import type Phaser from 'phaser';
import { DEPTH } from '@/game/Constants';
import type { Facing } from '@/systems/content/types';
import type { Rect } from '@/systems/VirtualControls';

export const PLAYER_HITBOX = { w: 10, h: 6 };
const WALK_SPEED = 70;
const RUN_SPEED = 112;
/** Max pixels the player is nudged sideways around a corner. */
const CORNER_SLACK = 7;

export class Player {
  readonly sprite: Phaser.GameObjects.Sprite;
  facing: Facing;
  private moving = false;
  private running = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    facing: Facing,
    private readonly texture = 'char.player',
  ) {
    this.facing = facing;
    this.sprite = scene.add.sprite(x, y, texture, `${facing}-0`).setOrigin(0.5, 1);
    this.updateDepth();
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  /** Feet hitbox at a given feet position. */
  hitbox(x = this.sprite.x, y = this.sprite.y): Rect {
    return { x: x - PLAYER_HITBOX.w / 2, y: y - PLAYER_HITBOX.h, w: PLAYER_HITBOX.w, h: PLAYER_HITBOX.h };
  }

  /** Point just in front of the player, used to find what they're facing. */
  probe(distance = 14): { x: number; y: number } {
    const d: Record<Facing, [number, number]> = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };
    const [dx, dy] = d[this.facing];
    return { x: this.sprite.x + dx * distance, y: this.sprite.y - 3 + dy * distance };
  }

  /**
   * Moves by the input axis. `blocked(rect)` reports collisions. Returns distance moved.
   */
  move(axis: { x: number; y: number }, running: boolean, delta: number, blocked: (r: Rect) => boolean): number {
    const speed = (running ? RUN_SPEED : WALK_SPEED) * (delta / 1000);
    const dx = axis.x * speed;
    const dy = axis.y * speed;
    if (dx === 0 && dy === 0) {
      this.setMoving(false, running);
      return 0;
    }
    // Facing follows the dominant axis, but keeps the current facing on exact diagonals.
    if (Math.abs(axis.x) > Math.abs(axis.y) + 0.01) this.facing = axis.x < 0 ? 'left' : 'right';
    else if (Math.abs(axis.y) > Math.abs(axis.x) + 0.01) this.facing = axis.y < 0 ? 'up' : 'down';
    else if ((this.facing === 'left' || this.facing === 'right') !== (axis.x !== 0)) {
      this.facing = axis.y < 0 ? 'up' : 'down';
    }

    const startX = this.sprite.x;
    const startY = this.sprite.y;
    let x = startX;
    let y = startY;
    if (dx !== 0) {
      if (!blocked(this.hitbox(x + dx, y))) x += dx;
      else if (dy === 0) y += this.cornerNudge(x, y, dx, 0, speed, blocked);
    }
    if (dy !== 0) {
      if (!blocked(this.hitbox(x, y + dy))) y += dy;
      else if (dx === 0) x += this.cornerNudge(x, y, 0, dy, speed, blocked);
    }
    this.sprite.setPosition(x, y);
    const moved = Math.hypot(x - startX, y - startY);
    this.setMoving(moved > 0.01 || dx !== 0 || dy !== 0, running);
    this.updateDepth();
    return moved;
  }

  /**
   * When walking straight into a corner that is only a few pixels off, slide around it
   * (so 1-tile doorways don't demand pixel-perfect alignment). Returns the perpendicular
   * offset to apply this frame.
   */
  private cornerNudge(x: number, y: number, dx: number, dy: number, speed: number, blocked: (r: Rect) => boolean): number {
    for (let off = 1; off <= CORNER_SLACK; off++) {
      for (const sign of [-1, 1]) {
        const ox = dy !== 0 ? off * sign : 0;
        const oy = dx !== 0 ? off * sign : 0;
        const pathClear = !blocked(this.hitbox(x + ox, y + oy));
        if (pathClear && !blocked(this.hitbox(x + ox + dx, y + oy + dy))) {
          return Math.min(speed, off) * sign;
        }
      }
    }
    return 0;
  }

  face(facing: Facing): void {
    this.facing = facing;
    this.setMoving(false, false, true);
  }

  stop(): void {
    this.setMoving(false, false);
  }

  setPosition(x: number, y: number): void {
    this.sprite.setPosition(x, y);
    this.updateDepth();
  }

  private setMoving(moving: boolean, running: boolean, force = false): void {
    const anims = this.sprite.anims;
    const key = `${this.texture}:${moving ? 'walk' : 'idle'}-${this.facing}`;
    if (!force && moving === this.moving && running === this.running && anims.currentAnim?.key === key) return;
    this.moving = moving;
    this.running = running;
    if (this.sprite.scene.anims.exists(key)) {
      this.sprite.play(key, true);
      this.sprite.anims.timeScale = running ? 1.6 : 1;
    } else {
      this.sprite.setFrame(`${this.facing}-0`);
    }
  }

  private updateDepth(): void {
    this.sprite.setDepth(DEPTH.world + this.sprite.y / 10);
  }
}
