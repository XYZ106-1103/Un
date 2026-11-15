/**
 * Bullet hell runtime: a pooled set of bullet sprites plus emitters that spawn them
 * according to pattern data (src/data/enemies/*.json → patternDefs).
 *
 * Emitter types:
 *   linear  — straight shots from an edge/point          (직선형)
 *   ring    — a closing circle with gaps to slip through  (원형)
 *   radial  — a burst flying outward from a point         (방사형)
 *   spiral  — radial bursts that rotate every volley      (회전형)
 *   fall    — drops from the top that accelerate          (낙하형)
 *   homing  — bullets that steer toward the soul          (추적형)
 *   stream  — rapid aimed fire                            (연속 발사형)
 *   sequence— children played one after another           (복합 / 페이즈)
 * Several emitters in one pattern run in parallel (composite). Phase changes come from
 * enemies choosing patterns by condition (e.g. `var:hp% < 50`).
 *
 * Bullets are recycled: nothing is allocated per shot once the pool is warm.
 */

import Phaser from 'phaser';
import type { BulletSpec, EmitterDef, Origin, PatternDef } from './content/types';
import type { Rect } from './VirtualControls';

const DEG = Math.PI / 180;

export interface Bullet {
  sprite: Phaser.GameObjects.Image;
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  accel: number;
  turn: number;
  spin: number;
  radius: number;
  damage: number | undefined;
  age: number;
  life: number;
  owner: number;
}

export interface BulletContext {
  box: Rect;
  soul: { x: number; y: number };
  enemy: { x: number; y: number };
  rng: () => number;
}

interface EmitterRun {
  def: EmitterDef;
  owner: number;
  start: number;
  end: number;
  next: number;
  fired: number;
  angle: number;
  /** For sequences: the currently running child. */
  child: EmitterRun | null;
  childIndex: number;
}

export class BulletSystem {
  private readonly pool: Bullet[] = [];
  /** Inactive bullets ready for reuse (O(1) spawn). */
  private readonly free: Bullet[] = [];
  private runs: EmitterRun[] = [];
  private elapsed = 0;
  private duration = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Container,
    private readonly texture = 'bullets',
  ) {}

  get running(): boolean {
    return this.elapsed < this.duration;
  }

  get activeCount(): number {
    let n = 0;
    for (const b of this.pool) if (b.active) n++;
    return n;
  }

  get poolSize(): number {
    return this.pool.length;
  }

  /** Starts patterns (played together); `owner` identifies the enemy for damage. */
  start(patterns: { pattern: PatternDef; owner: number }[]): void {
    this.clear();
    this.elapsed = 0;
    this.duration = Math.max(0, ...patterns.map((p) => p.pattern.duration));
    this.runs = patterns.flatMap(({ pattern, owner }) => pattern.emitters.map((def) => this.makeRun(def, owner, 0, pattern.duration)));
  }

  stop(): void {
    this.duration = 0;
    this.runs = [];
  }

  clear(): void {
    for (const b of this.pool) this.kill(b);
    this.runs = [];
  }

  /** Advances emitters and bullets. Returns the first bullet touching the soul, if any. */
  update(delta: number, ctx: BulletContext, soulRadius: number): Bullet | null {
    const dt = delta / 1000;
    this.elapsed += delta;
    if (this.elapsed < this.duration) for (const run of this.runs) this.tick(run, ctx);

    let hit: Bullet | null = null;
    const margin = 48;
    const { box } = ctx;
    for (const b of this.pool) {
      if (!b.active) continue;
      b.age += delta;
      if (b.turn !== 0) {
        // Steer toward the soul, limited to `turn` deg/s.
        const want = Math.atan2(ctx.soul.y - b.y, ctx.soul.x - b.x);
        const have = Math.atan2(b.vy, b.vx);
        let diff = want - have;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const maxTurn = b.turn * DEG * dt;
        const angle = have + Phaser.Math.Clamp(diff, -maxTurn, maxTurn);
        const speed = Math.hypot(b.vx, b.vy);
        b.vx = Math.cos(angle) * speed;
        b.vy = Math.sin(angle) * speed;
      }
      if (b.accel !== 0) {
        const speed = Math.hypot(b.vx, b.vy) || 1;
        const ns = Math.max(0, speed + b.accel * dt);
        b.vx = (b.vx / speed) * ns;
        b.vy = (b.vy / speed) * ns;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.sprite.setPosition(Math.round(b.x), Math.round(b.y));
      if (b.spin !== 0) b.sprite.rotation += b.spin * DEG * dt;
      const outside = b.x < box.x - margin || b.x > box.x + box.w + margin || b.y < box.y - margin || b.y > box.y + box.h + margin;
      if (b.age > b.life || (outside && b.age > 400)) {
        this.kill(b);
        continue;
      }
      if (!hit) {
        const dx = b.x - ctx.soul.x;
        const dy = b.y - ctx.soul.y;
        const r = b.radius + soulRadius;
        if (dx * dx + dy * dy < r * r) hit = b;
      }
    }
    return hit;
  }

  kill(b: Bullet): void {
    if (!b.active) return;
    b.active = false;
    b.sprite.setVisible(false).setActive(false);
    this.free.push(b);
  }

  private makeRun(def: EmitterDef, owner: number, offset: number, patternEnd: number): EmitterRun {
    const start = offset + (def.start ?? 0);
    return {
      def,
      owner,
      start,
      end: def.end !== undefined ? offset + def.end : patternEnd,
      next: start,
      fired: 0,
      angle: def.angle ?? 0,
      child: null,
      childIndex: -1,
    };
  }

  private tick(run: EmitterRun, ctx: BulletContext): void {
    const def = run.def;
    if (this.elapsed < run.start || this.elapsed > run.end) return;
    if (def.type === 'sequence') {
      const children = def.children ?? [];
      const step = def.step ?? 1500;
      const index = Math.min(children.length - 1, Math.floor((this.elapsed - run.start) / step));
      if (index !== run.childIndex && children[index]) {
        run.childIndex = index;
        const childStart = run.start + index * step;
        run.child = this.makeRun(children[index] as EmitterDef, run.owner, childStart, Math.min(run.end, childStart + step));
      }
      if (run.child) this.tick(run.child, ctx);
      return;
    }
    const interval = def.interval ?? 600;
    while (this.elapsed >= run.next && (def.count === undefined || run.fired < def.count)) {
      this.volley(run, ctx);
      run.fired++;
      run.next += interval;
    }
  }

  private origin(from: Origin | undefined, ctx: BulletContext, fallback: Origin): { x: number; y: number; inward: number } {
    const { box, rng } = ctx;
    const o = from ?? fallback;
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    if (Array.isArray(o)) return { x: box.x + o[0] * box.w, y: box.y + o[1] * box.h, inward: Math.atan2(cy - (box.y + o[1] * box.h), cx - (box.x + o[0] * box.w)) };
    switch (o) {
      case 'left':
        return { x: box.x - 6, y: box.y + 4 + rng() * (box.h - 8), inward: 0 };
      case 'right':
        return { x: box.x + box.w + 6, y: box.y + 4 + rng() * (box.h - 8), inward: Math.PI };
      case 'top':
        return { x: box.x + 4 + rng() * (box.w - 8), y: box.y - 6, inward: Math.PI / 2 };
      case 'bottom':
        return { x: box.x + 4 + rng() * (box.w - 8), y: box.y + box.h + 6, inward: -Math.PI / 2 };
      case 'edges': {
        const sides: Origin[] = ['left', 'right', 'top', 'bottom'];
        return this.origin(sides[Math.floor(rng() * 4)], ctx, 'left');
      }
      case 'enemy':
        return { x: ctx.enemy.x, y: ctx.enemy.y, inward: Math.atan2(cy - ctx.enemy.y, cx - ctx.enemy.x) };
      case 'center':
      default:
        return { x: cx, y: cy, inward: Math.PI / 2 };
    }
  }

  private volley(run: EmitterRun, ctx: BulletContext): void {
    const def = run.def;
    const spec = def.bullet;
    if (!spec) return;
    const amount = def.amount ?? 1;
    const aimAt = (x: number, y: number) => Math.atan2(ctx.soul.y - y, ctx.soul.x - x);

    switch (def.type) {
      case 'linear': {
        const o = this.origin(def.from, ctx, 'left');
        const base = def.aim ? aimAt(o.x, o.y) : def.angle !== undefined ? def.angle * DEG : o.inward;
        const spread = (def.spread ?? 0) * DEG;
        for (let i = 0; i < amount; i++) {
          const a = amount > 1 ? base - spread / 2 + (spread * i) / (amount - 1) : base;
          this.spawn(spec, o.x, o.y, a, run.owner);
        }
        return;
      }
      case 'ring': {
        // Bullets start on a circle around the soul and close in; `gap` slots stay empty.
        const radius = Math.max(ctx.box.w, ctx.box.h) * 0.75;
        const gap = def.gap ?? 2;
        const skip = Math.floor(ctx.rng() * amount);
        for (let i = 0; i < amount; i++) {
          if ((i - skip + amount) % amount < gap) continue;
          const a = (i / amount) * Math.PI * 2 + run.angle * DEG;
          this.spawn(spec, ctx.soul.x + Math.cos(a) * radius, ctx.soul.y + Math.sin(a) * radius, a + Math.PI, run.owner);
        }
        run.angle += 360 / amount / 2;
        return;
      }
      case 'radial':
      case 'spiral': {
        const o = this.origin(def.from, ctx, 'center');
        for (let i = 0; i < amount; i++) {
          this.spawn(spec, o.x, o.y, run.angle * DEG + (i / amount) * Math.PI * 2, run.owner);
        }
        if (def.type === 'spiral') run.angle += ((def.rotate ?? 90) * (def.interval ?? 600)) / 1000;
        return;
      }
      case 'fall': {
        for (let i = 0; i < amount; i++) {
          const o = this.origin('top', ctx, 'top');
          this.spawn(spec, o.x, o.y, Math.PI / 2, run.owner);
        }
        return;
      }
      case 'homing': {
        const o = this.origin(def.from, ctx, 'edges');
        for (let i = 0; i < amount; i++) this.spawn(spec, o.x, o.y, aimAt(o.x, o.y), run.owner, def.turn ?? 90);
        return;
      }
      case 'stream': {
        const o = this.origin(def.from, ctx, 'enemy');
        const spread = (def.spread ?? 0) * DEG;
        const a = aimAt(o.x, o.y) + (ctx.rng() - 0.5) * spread;
        this.spawn(spec, o.x, o.y, a, run.owner);
        return;
      }
      default:
        return;
    }
  }

  private spawn(spec: BulletSpec, x: number, y: number, angle: number, owner: number, turn = 0): void {
    let b = this.free.pop();
    if (!b) {
      const sprite = this.scene.add.image(0, 0, this.texture, spec.frame);
      this.layer.add(sprite);
      b = { sprite, active: false, x: 0, y: 0, vx: 0, vy: 0, accel: 0, turn: 0, spin: 0, radius: 2, damage: undefined, age: 0, life: 0, owner: 0 };
      this.pool.push(b);
    }
    b.active = true;
    b.x = x;
    b.y = y;
    b.vx = Math.cos(angle) * spec.speed;
    b.vy = Math.sin(angle) * spec.speed;
    b.accel = spec.accel ?? 0;
    b.turn = turn;
    b.spin = spec.spin ?? 0;
    b.radius = spec.radius;
    b.damage = spec.damage;
    b.age = 0;
    b.life = spec.lifetime ?? 6000;
    b.owner = owner;
    b.sprite
      .setFrame(spec.frame)
      .setPosition(Math.round(x), Math.round(y))
      .setRotation(0)
      .setVisible(true)
      .setActive(true);
  }
}
