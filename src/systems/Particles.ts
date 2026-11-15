/**
 * Tiny pooled pixel particles (1-2 px squares) drawn with one Graphics per scene.
 * Used sparingly: save sparkles, mercy glitter, hit sparks, item pickups.
 * Positions are rounded, so particles stay on the pixel grid.
 */

import type Phaser from 'phaser';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: number;
  size: number;
  gravity: number;
}

export interface BurstOptions {
  count?: number;
  colors: number[];
  speed?: number;
  life?: number;
  gravity?: number;
  size?: 1 | 2;
  /** Emission cone in degrees around `angle` (360 = all directions). */
  spread?: number;
  angle?: number;
}

const MAX = 256;

export class Particles {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly pool: Particle[] = [];
  private live = 0;

  constructor(scene: Phaser.Scene, depth: number, scrollFactor = 1) {
    this.g = scene.add.graphics().setDepth(depth).setScrollFactor(scrollFactor);
    for (let i = 0; i < MAX; i++) {
      this.pool.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, color: 0, size: 1, gravity: 0 });
    }
  }

  burst(x: number, y: number, o: BurstOptions): void {
    const count = o.count ?? 12;
    const spread = ((o.spread ?? 360) * Math.PI) / 180;
    const base = ((o.angle ?? -90) * Math.PI) / 180;
    for (let i = 0; i < count && this.live < MAX; i++) {
      const p = this.pool[this.live++] as Particle;
      const a = base + (Math.random() - 0.5) * spread;
      const speed = (o.speed ?? 50) * (0.4 + Math.random() * 0.8);
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * speed;
      p.vy = Math.sin(a) * speed;
      p.max = (o.life ?? 600) * (0.6 + Math.random() * 0.6);
      p.life = p.max;
      p.color = o.colors[Math.floor(Math.random() * o.colors.length)] ?? 0xffffff;
      p.size = o.size ?? 1;
      p.gravity = o.gravity ?? 60;
    }
  }

  update(delta: number): void {
    const dt = delta / 1000;
    this.g.clear();
    for (let i = 0; i < this.live; i++) {
      const p = this.pool[i] as Particle;
      p.life -= delta;
      if (p.life <= 0) {
        // Swap-remove: keep live particles packed at the front of the pool.
        this.live--;
        this.pool[i] = this.pool[this.live] as Particle;
        this.pool[this.live] = p;
        i--;
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // Fade by thinning out: older particles blink instead of going translucent.
      if (p.life < p.max * 0.3 && Math.floor(p.life / 60) % 2 === 0) continue;
      this.g.fillStyle(p.color).fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
  }

  get count(): number {
    return this.live;
  }
}
