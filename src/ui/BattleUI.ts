/**
 * Battle screen widgets. Each exposes `update(delta)`/`handle(input)` and promise-based
 * results so BattleScene can be written as a readable async sequence.
 */

import Phaser from 'phaser';
import { BASE_WIDTH, DEPTH, PALETTE } from '@/game/Constants';
import type { GameState } from '@/game/GameState';
import { getServices } from '@/game/Services';
import type { InputSystem } from '@/systems/InputSystem';
import { t } from '@/systems/LocaleSystem';
import { parseRichText } from '@/systems/text/RichText';
import { wrapRichText } from '@/systems/text/TextWrap';
import type { Rect } from '@/systems/VirtualControls';
import { drawBar, drawPanel } from './Panel';
import { PixelText } from './PixelText';

// ── Box ───────────────────────────────────────────────────────────────────────

export class BattleBox {
  readonly g: Phaser.GameObjects.Graphics;
  rect: Rect;

  constructor(
    private readonly scene: Phaser.Scene,
    rect: Rect,
  ) {
    this.rect = { ...rect };
    this.g = scene.add.graphics().setDepth(DEPTH.ui);
    this.draw();
  }

  resize(target: Rect, duration = 250): Promise<void> {
    const from = { ...this.rect };
    return new Promise((resolve) => {
      this.scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration,
        ease: 'Cubic.easeInOut',
        onUpdate: (tw) => {
          const k = tw.getValue() ?? 1;
          this.rect = {
            x: Math.round(from.x + (target.x - from.x) * k),
            y: Math.round(from.y + (target.y - from.y) * k),
            w: Math.round(from.w + (target.w - from.w) * k),
            h: Math.round(from.h + (target.h - from.h) * k),
          };
          this.draw();
        },
        onComplete: () => {
          this.rect = { ...target };
          this.draw();
          resolve();
        },
      });
    });
  }

  private draw(): void {
    const { x, y, w, h } = this.rect;
    this.g.clear();
    this.g.fillStyle(PALETTE.ink);
    this.g.fillRect(x, y, w, h);
    this.g.fillStyle(PALETTE.paper);
    this.g.fillRect(x - 2, y - 2, w + 4, 2);
    this.g.fillRect(x - 2, y + h, w + 4, 2);
    this.g.fillRect(x - 2, y, 2, h);
    this.g.fillRect(x + w, y, 2, h);
  }
}

// ── Typed text inside the box ─────────────────────────────────────────────────

export class BoxText {
  private readonly text: PixelText;
  private full = '';
  private shown = 0;
  private budget = 0;
  private resolve: (() => void) | null = null;
  private waitForInput = true;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly box: BattleBox,
  ) {
    this.text = new PixelText(scene, 0, 0, '', { color: PALETTE.white, lineSpacing: 3 }).setDepth(DEPTH.ui + 1);
  }

  get done(): boolean {
    return this.shown >= this.full.length;
  }

  /** Types a page; resolves on confirm (or immediately when `wait` is false and typing ends). */
  show(page: string, vars: Record<string, string | number>, wait = true): Promise<void> {
    const { fonts } = getServices(this.scene.game);
    const rich = parseRichText(page, vars);
    const wrapped = wrapRichText(rich.chars, this.box.rect.w - 28, (ch) => fonts.measure('body', ch));
    this.full = wrapped.chars.map((c) => c.ch).join('');
    fonts.ensure('body', this.full);
    this.shown = 0;
    this.budget = 0;
    this.waitForInput = wait;
    this.text.setPosition(this.box.rect.x + 14, this.box.rect.y + 10).setText('').setVisible(true);
    if (getServices(this.scene.game).settings.get('textSpeed') === 'instant') this.shown = this.full.length;
    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  async showAll(pages: string[], vars: Record<string, string | number>): Promise<void> {
    for (const p of pages) await this.show(p, vars);
  }

  clear(): void {
    this.text.setText('').setVisible(false);
    this.full = '';
    this.shown = 0;
  }

  update(delta: number): void {
    if (this.shown < this.full.length) {
      const cps = { slow: 22, normal: 45, fast: 90, instant: 9999 }[getServices(this.scene.game).settings.get('textSpeed')];
      this.budget += (delta / 1000) * cps;
      let changed = false;
      while (this.budget >= 1 && this.shown < this.full.length) {
        this.budget -= 1;
        const ch = this.full[this.shown] ?? '';
        this.shown++;
        changed = true;
        if (ch.trim() && this.shown % 2 === 0) {
          getServices(this.scene.game).audio.playVoice({ wave: 'triangle', pitch: 300, variance: 15, volume: 0.1, every: 2 });
        }
      }
      if (changed) this.text.setText(this.full.slice(0, this.shown));
      if (this.done && !this.waitForInput) this.finish();
    }
  }

  handle(input: InputSystem): void {
    if (!this.resolve) return;
    const pressed = input.justPressed('confirm') || input.tapped();
    if (!this.done) {
      if (pressed || input.justPressed('cancel')) {
        this.shown = this.full.length;
        this.text.setText(this.full);
        if (!this.waitForInput) this.finish();
      }
      return;
    }
    if (pressed) this.finish();
  }

  private finish(): void {
    const fn = this.resolve;
    this.resolve = null;
    fn?.();
  }
}

// ── Command buttons (claim-tag shaped) ────────────────────────────────────────

const COMMANDS = ['battle.clear', 'battle.act', 'battle.pocket', 'battle.letgo'] as const;
const COMMAND_ICONS = ['clear', 'act', 'pocket', 'letgo'];

export class CommandBar {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly labels: PixelText[];
  private readonly icons: Phaser.GameObjects.Image[];
  private readonly zones: Phaser.GameObjects.Zone[];
  index = 0;
  enabled = false;
  private resolve: ((i: number) => void) | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly y: number,
  ) {
    this.g = scene.add.graphics().setDepth(DEPTH.ui);
    const slot = BASE_WIDTH / 4;
    this.labels = COMMANDS.map((key, i) =>
      new PixelText(scene, Math.round(slot * i + slot / 2 + 6), y + 7, t(key), { font: 'bold', originX: 0.5 }).setDepth(DEPTH.ui + 1),
    );
    this.icons = COMMAND_ICONS.map((frame, i) =>
      scene.add.image(Math.round(slot * i + 22), y + 13, 'ui.icons', frame).setDepth(DEPTH.ui + 1),
    );
    this.zones = COMMANDS.map((_, i) => {
      const z = scene.add.zone(slot * i + 6, y, slot - 12, 26).setOrigin(0).setInteractive();
      z.on(Phaser.Input.Events.POINTER_DOWN, () => {
        if (!this.enabled) return;
        if (this.index === i) this.confirm();
        else {
          this.index = i;
          getServices(scene.game).audio.playSfx('ui-move');
          this.draw();
        }
      });
      return z;
    });
    this.draw();
  }

  choose(): Promise<number> {
    this.enabled = true;
    this.draw();
    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  handle(input: InputSystem): void {
    if (!this.enabled) return;
    if (input.pressedOrRepeated('left')) this.move(-1);
    else if (input.pressedOrRepeated('right')) this.move(1);
    else if (input.justPressed('confirm')) this.confirm();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.draw();
  }

  private move(d: number): void {
    this.index = (this.index + d + 4) % 4;
    getServices(this.scene.game).audio.playSfx('ui-move');
    this.draw();
  }

  private confirm(): void {
    getServices(this.scene.game).audio.playSfx('ui-confirm');
    this.enabled = false;
    this.draw();
    const fn = this.resolve;
    this.resolve = null;
    fn?.(this.index);
  }

  private draw(): void {
    const g = this.g;
    g.clear();
    const slot = BASE_WIDTH / 4;
    COMMANDS.forEach((_, i) => {
      const selected = i === this.index && this.enabled;
      const x = Math.round(slot * i + 8);
      const w = Math.round(slot - 16);
      const h = 26;
      const y = this.y;
      const fill = selected ? PALETTE.tag : PALETTE.night;
      const edge = selected ? PALETTE.white : PALETTE.amber;
      // Tag shape: pointed left end with a punched hole.
      g.fillStyle(edge);
      g.fillRect(x + 4, y, w - 4, h);
      g.fillRect(x + 2, y + 2, 2, h - 4);
      g.fillRect(x, y + 4, 2, h - 8);
      g.fillStyle(fill);
      g.fillRect(x + 5, y + 1, w - 6, h - 2);
      g.fillRect(x + 3, y + 3, 2, h - 6);
      g.fillRect(x + 1, y + 5, 2, h - 10);
      this.labels[i]?.setTint(selected ? PALETTE.ink : PALETTE.amber);
      this.icons[i]?.setTint(selected ? PALETTE.ink : PALETTE.amber);
    });
    void this.zones;
  }
}

// ── Stats line ────────────────────────────────────────────────────────────────

export class StatsLine {
  private readonly name: PixelText;
  private readonly label: PixelText;
  private readonly numbers: PixelText;
  private readonly bar: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    private readonly y: number,
  ) {
    this.name = new PixelText(scene, 24, y, '', { font: 'bold', color: PALETTE.paper }).setDepth(DEPTH.ui);
    this.label = new PixelText(scene, 0, y + 1, t('battle.hp'), { font: 'small', color: PALETTE.paper }).setDepth(DEPTH.ui);
    this.numbers = new PixelText(scene, 0, y + 1, '', { font: 'small', color: PALETTE.paper }).setDepth(DEPTH.ui);
    this.bar = scene.add.graphics().setDepth(DEPTH.ui);
  }

  refresh(state: GameState): void {
    this.name.setText(state.name);
    const lx = Math.round(this.name.x + this.name.width + 16);
    this.label.setX(lx);
    const bx = lx + this.label.width + 6;
    const barW = Math.max(20, state.maxHp * 2);
    this.bar.clear();
    drawBar(this.bar, bx, this.y + 3, barW, 7, state.hp / state.maxHp, PALETTE.tag, PALETTE.rust);
    this.numbers
      .setText(`${state.hp} / ${state.maxHp}`)
      .setX(bx + barW + 8)
      .setTint(state.hp <= state.maxHp / 4 ? PALETTE.sock : PALETTE.paper);
  }
}

// ── Enemy speech bubble ───────────────────────────────────────────────────────

export class SpeechBubble {
  private readonly container: Phaser.GameObjects.Container;
  private readonly text: PixelText;
  private bg: Phaser.GameObjects.Graphics | null = null;
  private full = '';
  private shown = 0;
  private budget = 0;
  private resolve: (() => void) | null = null;

  constructor(private readonly scene: Phaser.Scene) {
    this.container = scene.add.container(0, 0).setDepth(DEPTH.ui + 3).setVisible(false);
    this.text = new PixelText(scene, 8, 6, '', { color: PALETTE.ink, maxWidth: 116 });
    this.container.add(this.text);
  }

  say(line: string, x: number, y: number): Promise<void> {
    const { fonts } = getServices(this.scene.game);
    const rich = parseRichText(line, {});
    const wrapped = wrapRichText(rich.chars, 116, (ch) => fonts.measure('body', ch));
    this.full = wrapped.chars.map((c) => c.ch).join('');
    fonts.ensure('body', this.full);
    this.text.setText(this.full);
    const w = Math.min(132, Math.max(40, this.text.width + 16));
    const h = wrapped.lines * 14 + 10;
    const bg = this.scene.add.graphics();
    drawPanel(bg, 0, 0, w, h, { fill: PALETTE.white, border: PALETTE.ink, inner: PALETTE.paper });
    bg.fillStyle(PALETTE.white);
    bg.fillRect(-3, 8, 4, 3);
    bg.fillRect(-5, 9, 2, 1);
    // Replace only the background; the text object is reused across lines.
    this.bg?.destroy();
    this.bg = bg;
    this.container.addAt(bg, 0);
    this.container.setPosition(Math.min(x, BASE_WIDTH - w - 4), y).setVisible(true);
    this.text.setText('');
    this.shown = 0;
    this.budget = 0;
    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  update(delta: number): void {
    if (!this.container.visible || this.shown >= this.full.length) return;
    this.budget += (delta / 1000) * 40;
    let changed = false;
    while (this.budget >= 1 && this.shown < this.full.length) {
      this.budget -= 1;
      this.shown++;
      changed = true;
    }
    if (changed) this.text.setText(this.full.slice(0, this.shown));
  }

  handle(input: InputSystem): void {
    if (!this.resolve) return;
    const pressed = input.justPressed('confirm') || input.tapped();
    if (this.shown < this.full.length) {
      if (pressed || input.justPressed('cancel')) {
        this.shown = this.full.length;
        this.text.setText(this.full);
      }
      return;
    }
    if (pressed) {
      const fn = this.resolve;
      this.resolve = null;
      this.container.setVisible(false);
      fn?.();
    }
  }
}

// ── Attack timing meter ───────────────────────────────────────────────────────

export class AttackMeter {
  private readonly g: Phaser.GameObjects.Graphics;
  private t = 0;
  private running = false;
  private resolve: ((accuracy: number | null) => void) | null = null;
  private static readonly SWEEP_MS = 1300;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly box: BattleBox,
  ) {
    this.g = scene.add.graphics().setDepth(DEPTH.ui + 2).setVisible(false);
  }

  run(): Promise<number | null> {
    this.t = 0;
    this.running = true;
    this.g.setVisible(true);
    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  update(delta: number): void {
    if (!this.running) return;
    this.t += delta;
    if (this.t >= AttackMeter.SWEEP_MS) {
      this.finish(null);
      return;
    }
    this.draw(this.t / AttackMeter.SWEEP_MS);
  }

  handle(input: InputSystem): void {
    if (!this.running) return;
    if (input.justPressed('confirm') || input.tapped()) {
      const pos = this.t / AttackMeter.SWEEP_MS;
      this.finish(1 - Math.min(1, Math.abs(pos - 0.5) * 2));
    }
  }

  private finish(accuracy: number | null): void {
    this.running = false;
    const fn = this.resolve;
    this.resolve = null;
    this.scene.time.delayedCall(250, () => this.g.setVisible(false));
    fn?.(accuracy);
  }

  private draw(pos: number): void {
    const { x, y, w, h } = this.box.rect;
    const g = this.g;
    const mx = x + 12;
    const mw = w - 24;
    const my = y + h / 2 - 12;
    g.clear();
    // Meter: concentric bands toward the centre, like a target printed on a tag.
    const bands = [PALETTE.dusk, PALETTE.slate, PALETTE.fog, PALETTE.amber, PALETTE.tag];
    bands.forEach((c, i) => {
      const inset = (mw / 2) * (i / bands.length);
      g.fillStyle(c);
      g.fillRect(Math.round(mx + inset), my, Math.round(mw - inset * 2), 24);
    });
    g.fillStyle(PALETTE.white);
    g.fillRect(Math.round(mx + mw / 2), my - 2, 1, 28);
    const cx = Math.round(mx + mw * pos);
    g.fillStyle(PALETTE.ink);
    g.fillRect(cx - 2, my - 4, 5, 32);
    g.fillStyle(PALETTE.white);
    g.fillRect(cx - 1, my - 3, 3, 30);
  }
}
