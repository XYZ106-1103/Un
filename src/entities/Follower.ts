/**
 * A companion who walks behind the player, retracing their steps (a breadcrumb trail),
 * so they go around corners instead of through walls. Not solid; can be talked to.
 */

import type Phaser from 'phaser';
import { DEPTH } from '@/game/Constants';
import type { CharacterDef, Facing } from '@/systems/content/types';
import type { Rect } from '@/systems/VirtualControls';

/** How many trail points behind the player the follower walks. */
const LAG = 14;
const MAX_TRAIL = 64;

export class Follower {
  readonly sprite: Phaser.GameObjects.Sprite;
  private readonly trail: { x: number; y: number; facing: Facing }[] = [];
  private readonly texture: string;
  private facing: Facing;
  private walking = false;

  constructor(
    scene: Phaser.Scene,
    readonly character: CharacterDef,
    x: number,
    y: number,
    facing: Facing,
  ) {
    this.texture = character.sprite ?? 'char.player';
    this.facing = facing;
    this.sprite = scene.add.sprite(x, y, this.texture).setOrigin(0.5, 1);
    this.animate(false);
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  talkArea(): Rect {
    return { x: this.sprite.x - 9, y: this.sprite.y - 18, w: 18, h: 20 };
  }

  /** Called whenever the player moved this frame. */
  record(x: number, y: number, facing: Facing): void {
    this.trail.push({ x, y, facing });
    if (this.trail.length > MAX_TRAIL) this.trail.shift();
  }

  update(playerMoved: boolean): void {
    if (playerMoved && this.trail.length > LAG) {
      const p = this.trail[this.trail.length - 1 - LAG];
      if (p) {
        this.sprite.setPosition(p.x, p.y);
        this.facing = p.facing;
      }
      this.animate(true);
    } else {
      this.animate(false);
    }
    this.sprite.setDepth(DEPTH.world + this.sprite.y / 10 - 0.01);
  }

  faceTowards(x: number, y: number): void {
    const dx = x - this.sprite.x;
    const dy = y - this.sprite.y;
    this.facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
    this.walking = !this.walking;
    this.animate(false);
  }

  private animate(walking: boolean): void {
    const key = `${this.texture}:${walking ? 'walk' : 'idle'}-${this.facing}`;
    if (walking === this.walking && this.sprite.anims.currentAnim?.key === key) return;
    this.walking = walking;
    if (this.sprite.scene.anims.exists(key)) this.sprite.play(key, true);
    else if (this.sprite.texture.has(`${this.facing}-0`)) this.sprite.setFrame(`${this.facing}-0`);
  }
}
