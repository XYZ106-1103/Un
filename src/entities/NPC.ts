/**
 * Overworld character: idle animation, simple behaviours (idle / turn / wander),
 * turns to face the player when spoken to, and blocks movement with a feet body.
 *
 * Art: `idle` animation (any facing) and optionally `<facing>-0` frames / `walk-<facing>`.
 */

import Phaser from 'phaser';
import { DEPTH, TILE_SIZE } from '@/game/Constants';
import type { CharacterDef, Facing, NpcDef } from '@/systems/content/types';
import type { Rect } from '@/systems/VirtualControls';

const BODY = { w: 12, h: 8 };
const FACINGS: Facing[] = ['down', 'left', 'right', 'up'];

export class NPC {
  readonly sprite: Phaser.GameObjects.Sprite;
  facing: Facing;
  hidden = false;
  private timer = 0;
  private walkTarget: { x: number; y: number } | null = null;
  private readonly home: { x: number; y: number };
  private readonly texture: string;

  constructor(
    scene: Phaser.Scene,
    readonly def: NpcDef,
    readonly character: CharacterDef,
  ) {
    this.texture = character.sprite ?? 'char.player';
    this.facing = def.facing ?? 'down';
    const x = def.x * TILE_SIZE + TILE_SIZE / 2;
    const y = def.y * TILE_SIZE + TILE_SIZE - 2;
    this.home = { x, y };
    this.sprite = scene.add.sprite(x, y, this.texture).setOrigin(0.5, 1);
    this.applyFacing(false);
    this.timer = Phaser.Math.Between(800, 2400);
    this.updateDepth();
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  body(): Rect {
    return { x: this.sprite.x - BODY.w / 2, y: this.sprite.y - BODY.h, w: BODY.w, h: BODY.h };
  }

  /** Slightly larger area that counts as "talking range" for the player's probe. */
  talkArea(): Rect {
    const b = this.body();
    return { x: b.x - 3, y: b.y - 10, w: b.w + 6, h: b.h + 13 };
  }

  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    this.sprite.setVisible(!hidden);
  }

  faceTowards(x: number, y: number): void {
    const dx = x - this.sprite.x;
    const dy = y - this.sprite.y;
    this.facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
    this.applyFacing(false);
  }

  face(facing: Facing): void {
    this.facing = facing;
    this.applyFacing(false);
  }

  /** Walks to a pixel position; resolves on arrival. Used by `npc.move` commands. */
  walkTo(x: number, y: number, speed = 50): Promise<void> {
    return new Promise((resolve) => {
      const dist = Math.hypot(x - this.sprite.x, y - this.sprite.y);
      this.faceTowards(x, y);
      this.applyFacing(true);
      this.sprite.scene.tweens.add({
        targets: this.sprite,
        x,
        y,
        duration: (dist / speed) * 1000,
        onUpdate: () => this.updateDepth(),
        onComplete: () => {
          this.applyFacing(false);
          resolve();
        },
      });
    });
  }

  update(delta: number, blocked: (r: Rect, self: NPC) => boolean, frozen: boolean): void {
    if (this.hidden || frozen) return;
    const behavior = this.def.behavior ?? 'idle';
    if (behavior === 'idle') return;
    if (this.walkTarget) {
      const step = (28 * delta) / 1000;
      const dx = Math.sign(this.walkTarget.x - this.sprite.x) * Math.min(step, Math.abs(this.walkTarget.x - this.sprite.x));
      const dy = Math.sign(this.walkTarget.y - this.sprite.y) * Math.min(step, Math.abs(this.walkTarget.y - this.sprite.y));
      const nx = this.sprite.x + dx;
      const ny = this.sprite.y + dy;
      const rect = { x: nx - BODY.w / 2, y: ny - BODY.h, w: BODY.w, h: BODY.h };
      if (blocked(rect, this)) {
        this.walkTarget = null;
        this.applyFacing(false);
      } else {
        this.sprite.setPosition(nx, ny);
        this.updateDepth();
        if (dx === 0 && dy === 0) {
          this.walkTarget = null;
          this.applyFacing(false);
        }
      }
      return;
    }
    this.timer -= delta;
    if (this.timer > 0) return;
    this.timer = Phaser.Math.Between(1200, 3200);
    if (behavior === 'turn') {
      this.face(Phaser.Utils.Array.GetRandom(FACINGS));
    } else if (behavior === 'wander') {
      const dir = Phaser.Utils.Array.GetRandom(FACINGS);
      const d: Record<Facing, [number, number]> = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };
      const [ox, oy] = d[dir];
      const tx = this.sprite.x + ox * TILE_SIZE;
      const ty = this.sprite.y + oy * TILE_SIZE;
      // Stay within two tiles of home.
      if (Math.abs(tx - this.home.x) <= TILE_SIZE * 2 && Math.abs(ty - this.home.y) <= TILE_SIZE * 2) {
        this.facing = dir;
        this.walkTarget = { x: tx, y: ty };
        this.applyFacing(true);
      }
    }
  }

  private applyFacing(walking: boolean): void {
    const anims = this.sprite.scene.anims;
    const walkKey = `${this.texture}:walk-${this.facing}`;
    const idleFacing = `${this.texture}:idle-${this.facing}`;
    const idle = `${this.texture}:idle`;
    const key = walking && anims.exists(walkKey) ? walkKey : anims.exists(idleFacing) ? idleFacing : anims.exists(idle) ? idle : null;
    if (key) this.sprite.play(key, true);
    else if (this.sprite.texture.has(`${this.facing}-0`)) this.sprite.setFrame(`${this.facing}-0`);
  }

  private updateDepth(): void {
    this.sprite.setDepth(DEPTH.world + this.sprite.y / 10);
  }
}
